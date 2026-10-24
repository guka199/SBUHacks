"""Train one virality model per platform and save it to models/.

Input:  data/processed/<platform>.parquet  (run `python -m data.prepare` first)
Target: virality_score, 0-100 (percentile within the platform; see data/prepare.py)
Output: models/engagement_<platform>.json  +  models/metrics_<platform>.json

Usage (from repo root):
    python -m ml.train                      # all platforms
    python -m ml.train tiktok instagram     # just these
    python -m ml.train --sample 100000      # cap rows per platform for a quick run
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from scipy.stats import spearmanr
from sklearn.model_selection import GroupShuffleSplit

from shared.features import FEATURE_COLUMNS, PLATFORMS, build_feature_frame

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "processed"
MODELS_DIR = ROOT / "models"


def load_platform(platform: str, sample: int | None = None) -> pd.DataFrame:
    df = pd.read_parquet(DATA_DIR / f"{platform}.parquet")
    if sample and len(df) > sample:
        df = df.sample(sample, random_state=42)
    return df.reset_index(drop=True)


def split_by_creator(df: pd.DataFrame, test_size: float = 0.2, seed: int = 42):
    """Train/test split where no creator appears on both sides (otherwise the model memorizes creators)."""
    splitter = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=seed)
    train_idx, test_idx = next(splitter.split(df, groups=df["creator_id"]))
    return df.iloc[train_idx], df.iloc[test_idx]


def evaluate(model: xgb.XGBRegressor, X: pd.DataFrame, y: np.ndarray, baseline: float) -> dict:
    pred = model.predict(X)
    top = y >= 75  # "viral" = top quarter of the platform
    return {
        "mae": float(np.mean(np.abs(pred - y))),
        "baseline_mae": float(np.mean(np.abs(baseline - y))),
        "spearman": float(spearmanr(pred, y).statistic),
        # Of the posts the model ranks in its top 25%, how many really were top 25%?
        "precision_at_top_quarter": float(top[pred >= np.percentile(pred, 75)].mean()),
    }


def train_platform(platform: str, sample: int | None) -> dict:
    df = load_platform(platform, sample)
    train, test = split_by_creator(df)
    train, valid = split_by_creator(train, test_size=0.1, seed=7)

    X_train, X_valid, X_test = (build_feature_frame(platform, d) for d in (train, valid, test))
    y_train, y_valid, y_test = (d["virality_score"].to_numpy(float) for d in (train, valid, test))

    model = xgb.XGBRegressor(
        n_estimators=2000,
        learning_rate=0.05,
        max_depth=6,
        min_child_weight=20,
        subsample=0.8,
        colsample_bytree=0.8,
        tree_method="hist",
        early_stopping_rounds=50,
        eval_metric="mae",
    )
    model.fit(X_train, y_train, eval_set=[(X_valid, y_valid)], verbose=False)

    metrics = {
        "platform": platform,
        "rows": {"train": len(train), "valid": len(valid), "test": len(test)},
        "best_iteration": int(model.best_iteration),
        **evaluate(model, X_test, y_test, baseline=float(y_train.mean())),
        "top_features": (
            pd.Series(model.feature_importances_, index=FEATURE_COLUMNS[platform])
            .sort_values(ascending=False).head(8).round(4).to_dict()
        ),
    }

    MODELS_DIR.mkdir(exist_ok=True)
    model.save_model(MODELS_DIR / f"engagement_{platform}.json")
    (MODELS_DIR / f"metrics_{platform}.json").write_text(json.dumps(metrics, indent=2))
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("platforms", nargs="*", default=PLATFORMS)
    parser.add_argument("--sample", type=int, help="Max rows per platform")
    args = parser.parse_args()

    for platform in args.platforms:
        if not (DATA_DIR / f"{platform}.parquet").exists():
            print(f"[{platform}] no processed data - run python -m data.prepare {platform}")
            continue
        m = train_platform(platform, args.sample)
        print(
            f"[{platform}] MAE {m['mae']:.1f} (baseline {m['baseline_mae']:.1f}) | "
            f"Spearman {m['spearman']:.3f} | top-25% precision {m['precision_at_top_quarter']:.2f} "
            f"(random = 0.25) | {m['rows']['train']:,} train rows"
        )
        print(f"    top features: {', '.join(list(m['top_features'])[:5])}")


if __name__ == "__main__":
    main()
