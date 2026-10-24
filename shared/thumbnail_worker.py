"""Frozen OpenCLIP image tower. Invoked only in its own interpreter."""

import argparse
import json
from pathlib import Path

from shared.features import THUMBNAIL_ENCODER


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--device", choices=["auto", "cpu", "mps", "cuda"], default="auto")
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 128:
        parser.error("batch-size must be 1-128")

    import numpy as np
    from importlib.metadata import version
    if version("open_clip_torch") != "3.3.0":
        raise RuntimeError("Encoder contract v1 requires open_clip_torch==3.3.0")
    import open_clip
    import torch
    from PIL import Image, ImageOps
    from shared.thumbnails import CACHE

    torch.set_num_threads(4)
    device = args.device
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    model, _, preprocess = open_clip.create_model_and_transforms(
        THUMBNAIL_ENCODER["model"], pretrained=THUMBNAIL_ENCODER["pretrained"], device=device,
        cache_dir=str(CACHE / "weights"),
    )
    model.eval()
    paths = json.loads(args.input.read_text())
    batches = []
    with torch.inference_mode():
        for start in range(0, len(paths), args.batch_size):
            images = []
            for path in paths[start:start + args.batch_size]:
                with Image.open(path) as image:
                    images.append(preprocess(ImageOps.exif_transpose(image).convert("RGB")))
            features = model.encode_image(torch.stack(images).to(device), normalize=True)
            batches.append(features.float().cpu().numpy())
    np.save(args.output, np.concatenate(batches).astype("float32"), allow_pickle=False)


if __name__ == "__main__":
    main()
