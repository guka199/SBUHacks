"""Cache frozen CLIP embeddings for historical YouTube thumbnails, resumably.

python -m data.thumbnail_embeddings --data data/processed/youtube.parquet
The cache contains no labels. Both ablation variants use the identical available-image cohort.
"""

import argparse
import hashlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

from shared.thumbnails import ROOT, ThumbnailError, download_thumbnail, encoder_fingerprint, encode_paths, load_embedding_cache, validate_image


def save_cache(rows: dict, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp.parquet")
    pd.DataFrame(list(rows.values())).to_parquet(temporary, index=False)
    temporary.replace(output)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "data/processed/youtube_thumbnail_embeddings.parquet")
    parser.add_argument("--max-posts", type=int)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--checkpoint-size", type=int, default=512)
    parser.add_argument("--device", choices=["auto", "cpu", "mps", "cuda"], default="auto")
    args = parser.parse_args()
    if not 1 <= args.workers <= 16 or not 1 <= args.checkpoint_size <= 2048:
        parser.error("workers must be 1-16 and checkpoint-size 1-2048")
    frame = pd.read_parquet(args.data)
    if "thumbnail_url" not in frame or "platform" not in frame or not frame.platform.eq("youtube").all():
        parser.error("data must contain only YouTube posts and have a thumbnail_url column")
    if args.max_posts:
        frame = frame.sample(min(args.max_posts, len(frame)), random_state=42)
    urls = frame.thumbnail_url.dropna().drop_duplicates().tolist()
    existing = {}
    if args.output.exists():
        load_embedding_cache(args.output)  # reject stale or incompatible cache contracts
        existing = {r["thumbnail_url"]: r for r in pd.read_parquet(args.output).to_dict("records")}
    todo = [url for url in urls if url not in existing]
    images = ROOT / "data/raw/thumbnails" / encoder_fingerprint()
    images.mkdir(parents=True, exist_ok=True)
    failures = []
    with httpx.Client(timeout=15, follow_redirects=False) as client:
        def download(url):
            try:
                path = images / (hashlib.sha256(url.encode()).hexdigest() + ".jpg")
                if path.exists():
                    content = path.read_bytes()
                    validate_image(content)
                else:
                    content = download_thumbnail(url, client)
                    path.write_bytes(content)
                return url, path, hashlib.sha256(content).hexdigest()
            except (ThumbnailError, OSError):
                return url, None, None
        print(f"{len(urls):,} unique thumbnails, {len(todo):,} uncached; encoder {encoder_fingerprint()}", flush=True)
        with ThreadPoolExecutor(args.workers) as pool:
            downloaded = []
            for i, result in enumerate(pool.map(download, todo), start=1):
                url, path, checksum = result
                if path:
                    downloaded.append((url, path, checksum))
                else:
                    failures.append(url)
                if i % 500 == 0 or i == len(todo):
                    print(f"Downloaded {i:,}/{len(todo):,}; unavailable {len(failures):,}", flush=True)
    for start in range(0, len(downloaded), args.checkpoint_size):
        batch = downloaded[start:start + args.checkpoint_size]
        vectors = encode_paths([p for _, p, _ in batch], batch_size=args.batch_size, device=args.device)
        for (url, _, checksum), vector in zip(batch, vectors):
            existing[url] = {"thumbnail_url": url, "encoder": encoder_fingerprint(), "image_sha256": checksum,
                             "embedding": vector.astype("float32").tolist()}
        save_cache(existing, args.output)
        print(f"Encoded {start + len(batch):,}/{len(downloaded):,}; checkpoint saved", flush=True)
    if not existing:
        raise SystemExit("No usable thumbnail embeddings were produced")
    available = set(existing).intersection(urls)
    print(f"Ready: {len(available):,}/{len(urls):,} usable images. Missing images are excluded from BOTH comparison arms.", flush=True)


if __name__ == "__main__":
    main()
