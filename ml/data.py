"""Data for training and benchmarking: load processed posts, split by creator, build feature matrices.

benchmark.py and train.py both use these functions, so every model sees exactly the same rows,
the same split and the same features.
"""

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

from shared.features import THUMBNAIL_ENCODER, build_feature_frame, thumbnail_feature_frame
from shared.text_features import TextEncoder

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "processed"
MODELS_DIR = ROOT / "models"
TARGET = "virality_score"  # 0-100 percentile within the platform
RELATIVE_TARGET = "account_relative"  # log(post result / creator's typical result)
TARGETS = {"score": TARGET, "relative": RELATIVE_TARGET}

# Never inputs for the relative target: typical views is computed from the creator's OTHER posts, so within one
# creator it is a deterministic function of this post's own views -> it would leak the answer.
LEAKY_FOR_RELATIVE = ["log_creator_typical_views"]


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
    thumbnail_encoder: dict | None = None
    test_thumbnail_embeddings: list | None = None
    target: str = "score"


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


def build_matrices(platform: str, split: Split, use_text: bool = True, target: str = TARGET) -> Matrices:
    """Feature matrices for every part. The caption encoder is fit on TRAIN captions only.

    Rows without a value for `target` (e.g. account_relative for one-post creators) are left out.
    """
    if target not in split.test.columns:
        raise KeyError(f"'{target}' missing from the processed data - re-run: python -m data.prepare {platform}")
    split = Split(*(d[d[target].notna()] for d in (split.train, split.valid, split.test)))
    frames = [split.train, split.valid, split.test]
    X = [build_feature_frame(platform, d) for d in frames]
    if target == RELATIVE_TARGET:
        X = [x.drop(columns=[c for c in LEAKY_FOR_RELATIVE if c in x.columns]) for x in X]

    encoder = None
    if use_text:
        encoder = TextEncoder().fit(split.train["caption"])
        X = [pd.concat([x, encoder.transform(d["caption"]).reset_index(drop=True)], axis=1) for x, d in zip(X, frames)]

    X = [x.replace([np.inf, -np.inf], np.nan).astype("float32") for x in X]
    y = [d[target].to_numpy(dtype=float) for d in frames]
    return Matrices(
        X_train=X[0], y_train=y[0],
        X_valid=X[1], y_valid=y[1],
        X_test=X[2], y_test=y[2],
        test_groups=split.test["creator_id"].astype(str).to_numpy(),
        test_posts=split.test.reset_index(drop=True),
        feature_columns=list(X[0].columns),
        text_encoder=encoder,
        target="relative" if target == RELATIVE_TARGET else "score",
    )


def with_thumbnails(m: Matrices, split: Split, embeddings: dict) -> Matrices:
    """Append visual columns after the SAME caption encoder and creator split are built."""
    from dataclasses import replace

    target = RELATIVE_TARGET if m.target == "relative" else TARGET
    frames = [d[d[target].notna()].reset_index(drop=True) for d in (split.train, split.valid, split.test)]
    vectors = [[embeddings.get(url) for url in d.thumbnail_url] for d in frames]
    if any(v is None for part in vectors for v in part):
        raise ValueError("Ablation cohort must have a cached thumbnail for every post")
    matrices = [pd.concat([x.reset_index(drop=True), thumbnail_feature_frame(v)], axis=1)
                for x, v in zip((m.X_train, m.X_valid, m.X_test), vectors)]
    return replace(m, X_train=matrices[0], X_valid=matrices[1], X_test=matrices[2],
                   feature_columns=list(matrices[0].columns), thumbnail_encoder=dict(THUMBNAIL_ENCODER),
                   test_thumbnail_embeddings=vectors[2])
