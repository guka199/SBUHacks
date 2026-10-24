"""Check everything training needs BEFORE a long run: data files, labels, features, libraries, devices.

Runs automatically at the start of ml.benchmark and ml.train; can also be run alone:
    python -m ml.preflight
"""

import argparse
import os

import numpy as np

from ml.data import DATA_DIR, MODELS_DIR, TARGET, load_platform
from ml.models import MODELS, availability
from shared.features import FEATURE_COLUMNS, PLATFORMS, build_feature_frame

REQUIRED_COLUMNS = ["platform", "external_id", "creator_id", "caption", "posted_at", "extra", TARGET]
MIN_ROWS, MIN_CREATORS = 1_000, 10


def check_platform(platform: str) -> list[str]:
    """Problems with one platform's processed data (empty list = ready)."""
    path = DATA_DIR / f"{platform}.parquet"
    if not path.exists():
        return [f"missing {path.relative_to(DATA_DIR.parents[1])} - run: python -m data.prepare {platform}"]
    df = load_platform(platform)
    problems = [f"missing column '{c}'" for c in REQUIRED_COLUMNS if c not in df.columns]
    if problems:
        return problems + ["re-run: python -m data.prepare " + platform]
    if len(df) < MIN_ROWS:
        problems.append(f"only {len(df)} rows (need {MIN_ROWS}+)")
    if df["creator_id"].nunique() < MIN_CREATORS:
        problems.append(f"only {df['creator_id'].nunique()} creators (need {MIN_CREATORS}+ to split by creator)")
    target = df[TARGET]
    if target.isna().any() or target.min() < 0 or target.max() > 100:
        problems.append(f"{TARGET} must be 0-100 with no blanks")

    sample = df.sample(min(len(df), 500), random_state=0)
    X = build_feature_frame(platform, sample)
    if list(X.columns) != FEATURE_COLUMNS[platform]:
        problems.append("feature columns don't match shared/features.py FEATURE_COLUMNS")
    if np.isinf(X.to_numpy()).any():
        problems.append("features contain infinite values")
    return problems


def check_models(names: list[str]) -> dict[str, str]:
    """Model name -> '' if it can run, else the reason it can't."""
    return {name: availability(MODELS[name])[1] for name in names}


def device_info() -> str:
    try:
        import torch

        if torch.cuda.is_available():
            return "NVIDIA GPU (cuda)"
        if torch.backends.mps.is_available():
            return "Apple GPU (mps)"
        return "CPU only"
    except Exception:
        return "PyTorch not installed (neural models disabled)"


def run(platforms: list[str], model_names: list[str], verbose: bool = True) -> tuple[list[str], list[str]]:
    """Returns (platforms ready to use, models able to run). Raises if nothing can run at all."""
    ready_platforms = []
    for platform in platforms:
        problems = check_platform(platform)
        if verbose:
            print(f"  data   {platform:<11} {'OK' if not problems else 'PROBLEM: ' + '; '.join(problems)}")
        if not problems:
            ready_platforms.append(platform)

    model_status = check_models(model_names)
    ready_models = [m for m, reason in model_status.items() if not reason]
    if verbose:
        for m, reason in model_status.items():
            if reason:
                print(f"  model  {m:<22} SKIPPED: {reason}")
        print(f"  models ready: {len(ready_models)}/{len(model_names)}   device for neural nets: {device_info()}")

    MODELS_DIR.mkdir(exist_ok=True)
    if not os.access(MODELS_DIR, os.W_OK):
        raise PermissionError(f"cannot write to {MODELS_DIR}")
    if not ready_platforms:
        raise SystemExit("No platform data is ready. Download the data and run: python -m data.prepare")
    if not ready_models:
        raise SystemExit("No model can run. Install requirements: pip install -r ml/requirements.txt")
    return ready_platforms, ready_models


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--platforms", nargs="+", default=PLATFORMS, choices=PLATFORMS)
    args = parser.parse_args()
    print("Preflight checks")
    run(args.platforms, list(MODELS))
    print("All set.")


if __name__ == "__main__":
    main()
