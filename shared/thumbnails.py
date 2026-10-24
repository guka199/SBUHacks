"""Image validation, bounded public-thumbnail downloads, and isolated CLIP inference.

Never imports torch/open_clip in the API or CatBoost process. Model weights and
embedding caches are local training/runtime artifacts, not application records.
"""

import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import warnings
from pathlib import Path

import httpx
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from shared.features import THUMBNAIL_ENCODER

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "processed" / "thumbnail_cache"
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 16_000_000


class ThumbnailError(ValueError):
    pass


def validate_image(content: bytes) -> tuple[int, int]:
    if not content or len(content) > MAX_IMAGE_BYTES:
        raise ThumbnailError("Thumbnail must be a nonempty image no larger than 5 MB")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as image:
                if image.width * image.height > MAX_IMAGE_PIXELS or min(image.size) < 32:
                    raise ThumbnailError("Thumbnail must be at least 32 pixels per side and at most 16 megapixels")
                size = image.size
                image.verify()
        return size
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ThumbnailError("Upload a valid JPEG, PNG, WebP, or other supported still image") from None


def public_thumbnail_url(url: str) -> str:
    # No arbitrary remote fetches from /predict: this is also the training source.
    if not re.fullmatch(r"https://i\.ytimg\.com/vi/[A-Za-z0-9_-]{11}/(?:hqdefault|mqdefault|maxresdefault|sddefault|default)\.(?:jpg|webp)", url):
        raise ThumbnailError("thumbnail_url must be a public i.ytimg.com video thumbnail; upload custom thumbnails through /score")
    return url


def download_thumbnail(url: str, client: httpx.Client | None = None) -> bytes:
    public_thumbnail_url(url)
    owned = client is None
    client = client or httpx.Client(timeout=15, follow_redirects=False)
    try:
        with client.stream("GET", url, follow_redirects=False) as response:
            if response.status_code != 200:
                raise ThumbnailError("YouTube thumbnail is unavailable")
            chunks, total = [], 0
            for chunk in response.iter_bytes():
                total += len(chunk)
                if total > MAX_IMAGE_BYTES:
                    raise ThumbnailError("Thumbnail is larger than 5 MB")
                chunks.append(chunk)
        content = b"".join(chunks)
        width, height = validate_image(content)
        # YouTube's unavailable-image placeholder is usually 120x90.
        if width < 160 or height < 90:
            raise ThumbnailError("YouTube returned a placeholder or undersized thumbnail")
        return content
    except httpx.HTTPError:
        raise ThumbnailError("YouTube thumbnail could not be downloaded") from None
    finally:
        if owned:
            client.close()


def encoder_fingerprint() -> str:
    return hashlib.sha256(json.dumps(THUMBNAIL_ENCODER, sort_keys=True).encode()).hexdigest()[:16]


def encode_paths(paths: list[Path], *, batch_size: int = 32, device: str = "auto", offline: bool = False,
                 timeout: float = 1800) -> np.ndarray:
    """Run the frozen encoder in a fresh interpreter, never alongside OpenMP tree libraries."""
    if not paths:
        return np.empty((0, THUMBNAIL_ENCODER["dimensions"]), dtype="float32")
    CACHE.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="postpilot-clip-") as folder:
        manifest, output = Path(folder) / "input.json", Path(folder) / "vectors.npy"
        manifest.write_text(json.dumps([str(p.resolve()) for p in paths]))
        env = os.environ.copy()
        env.update(OMP_NUM_THREADS="1", TOKENIZERS_PARALLELISM="false")
        if offline:
            env["HF_HUB_OFFLINE"] = "1"
        try:
            result = subprocess.run(
                [sys.executable, "-m", "shared.thumbnail_worker", "--input", str(manifest), "--output", str(output),
                 "--batch-size", str(batch_size), "--device", device],
                cwd=ROOT, env=env, capture_output=True, text=True, timeout=timeout,
            )
        except (subprocess.TimeoutExpired, OSError):
            raise ThumbnailError("Thumbnail encoder timed out or could not start; the standard model is still available") from None
        if result.returncode != 0 or not output.exists():
            # Do not forward subprocess environment, URLs, or dependency diagnostics to HTTP callers.
            raise ThumbnailError("Thumbnail encoder is unavailable; install api/requirements-visual.txt and precompute thumbnails to cache its weights")
        vectors = np.load(output, allow_pickle=False)
    if vectors.shape != (len(paths), THUMBNAIL_ENCODER["dimensions"]) or not np.isfinite(vectors).all():
        raise ThumbnailError("Thumbnail encoder returned invalid vectors")
    norms = np.linalg.norm(vectors, axis=1)
    if not np.allclose(norms, 1, atol=1e-3):
        raise ThumbnailError("Thumbnail encoder returned unnormalized vectors")
    return vectors.astype("float32")


def encode_image(content: bytes, *, offline: bool = True) -> list[float]:
    validate_image(content)
    key = hashlib.sha256(content).hexdigest()
    directory = CACHE / "uploads" / encoder_fingerprint()
    directory.mkdir(parents=True, exist_ok=True)
    cached = directory / f"{key}.npy"
    if cached.exists():
        try:
            vector = np.load(cached, allow_pickle=False)
            if vector.shape == (THUMBNAIL_ENCODER["dimensions"],) and np.isfinite(vector).all() and np.isclose(np.linalg.norm(vector), 1, atol=1e-3):
                return vector.tolist()
        except (ValueError, OSError, EOFError):
            pass
    with tempfile.TemporaryDirectory(prefix="postpilot-thumbnail-") as folder:
        path = Path(folder) / "thumbnail.png"
        with Image.open(io.BytesIO(content)) as image:
            ImageOps.exif_transpose(image).convert("RGB").save(path)
        vector = encode_paths([path], offline=offline, timeout=90)[0]
    # Atomic writes allow simultaneous requests for the same image.
    with tempfile.NamedTemporaryFile(dir=directory, suffix=".npy", delete=False) as temp:
        np.save(temp, vector)
        staged = Path(temp.name)
    staged.replace(cached)
    return vector.tolist()


def load_embedding_cache(path: Path) -> dict[str, list[float]]:
    import pandas as pd

    frame = pd.read_parquet(path)
    required = {"thumbnail_url", "encoder", "embedding"}
    if not required.issubset(frame.columns) or frame.empty:
        raise ThumbnailError("Thumbnail cache must contain thumbnail_url, encoder and embedding columns")
    if not frame["encoder"].eq(encoder_fingerprint()).all() or frame.thumbnail_url.duplicated().any():
        raise ThumbnailError("Thumbnail cache contains duplicate URLs or a different encoder version")
    result = {}
    for row in frame.to_dict("records"):
        vector = np.asarray(row["embedding"], dtype="float32")
        if vector.shape != (512,) or not np.isfinite(vector).all() or not np.isclose(np.linalg.norm(vector), 1, atol=1e-3):
            raise ThumbnailError("Thumbnail cache contains an invalid embedding")
        result[row["thumbnail_url"]] = vector.tolist()
    return result
