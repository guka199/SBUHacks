"""Data for training and benchmarking: load processed posts, split by creator, build feature matrices.

benchmark.py and train.py both use these functions, so every model sees exactly the same rows,
the same split and the same features.
"""

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

from shared.features import build_feature_frame
from shared.text_features import TextEncoder

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "processed"
MODELS_DIR = ROOT / "models"
TARGET = "virality_score"


@dataclass
class Split:
    train: pd.DataFrame
    valid: pd.DataFrame  # used only for early stopping
    test: pd.DataFrame  # never seen during training; all reported metrics come from here

    def sizes(self) -> dict:
        return {"train": len(self.train), "valid": len(self.valid), "test": len(self.test)}


@dataclass
class Matrices:
    X_train: pd.DataFrame
    y_train: np.ndarray
    X_valid: pd.DataFrame
    y_valid: np.ndarray
    X_test: pd.DataFrame
    y_test: np.ndarray
    test_groups: np.ndarray  # creator id of each test row (for creator-level bootstrap)
    test_posts: pd.DataFrame  # raw test rows (for train/serve consistency checks)
    feature_columns: list[str]
    text_encoder: TextEncoder | None


def load_platform(platform: str) -> pd.DataFrame:
    path = DATA_DIR / f"{platform}.parquet"
    if not path.exists():
        raise FileNotFoundError(f"{path} is missing - run: python -m data.prepare {platform}")
    return pd.read_parquet(path)


def _group_split(df: pd.DataFrame, test_size: float, seed: int):
    splitter = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=seed)
    a, b = next(splitter.split(df, groups=df["creator_id"]))
    return df.iloc[a], df.iloc[b]


def split_by_creator(df: pd.DataFrame, seed: int = 42, test_size: float = 0.2, valid_size: float = 0.1) -> Split:
    """Train / valid / test with every creator in exactly ONE part.

    If a creator's posts were in both train and test, models could memorize the creator
    and look better than they are on new users.
    """
    train, test = _group_split(df, test_size, seed)
    train, valid = _group_split(train, valid_size, seed + 1)
    return Split(train, valid, test)


def cap_rows(df: pd.DataFrame, max_rows: int | None, seed: int = 42) -> pd.DataFrame:
    return df if not max_rows or len(df) <= max_rows else df.sample(max_rows, random_state=seed)


def cap_split(split: Split, max_train=None, max_valid=None, max_test=None, seed: int = 42) -> Split:
    """Subsample AFTER splitting, so the no-shared-creators guarantee still holds."""
    return Split(
        cap_rows(split.train, max_train, seed),
        cap_rows(split.valid, max_valid, seed),
        cap_rows(split.test, max_test, seed),
    )


def build_matrices(platform: str, split: Split, use_text: bool = True) -> Matrices:
    """Feature matrices for every part. The caption encoder is fit on TRAIN captions only."""
    frames = [split.train, split.valid, split.test]
    X = [build_feature_frame(platform, d) for d in frames]

    encoder = None
    if use_text:
        encoder = TextEncoder().fit(split.train["caption"])
        X = [pd.concat([x, encoder.transform(d["caption"]).reset_index(drop=True)], axis=1) for x, d in zip(X, frames)]

    X = [x.replace([np.inf, -np.inf], np.nan).astype("float32") for x in X]
    y = [d[TARGET].to_numpy(dtype=float) for d in frames]
    return Matrices(
        X_train=X[0], y_train=y[0],
        X_valid=X[1], y_valid=y[1],
        X_test=X[2], y_test=y[2],
        test_groups=split.test["creator_id"].astype(str).to_numpy(),
        test_posts=split.test.reset_index(drop=True),
        feature_columns=list(X[0].columns),
        text_encoder=encoder,
    )
