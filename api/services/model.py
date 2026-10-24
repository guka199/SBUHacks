"""Loads the trained model bundles (models/<platform>.joblib, made by ml/train.py) and scores drafts.

If no trained model exists yet, returns a fixed fake score so the frontend
can be built in parallel (build order step 1).
"""

from functools import lru_cache
from pathlib import Path

import numpy as np

from shared.bundle import ModelBundle

MODELS_DIR = Path(__file__).resolve().parents[2] / "models"


@lru_cache
def load_bundle(platform: str, kind: str = "score") -> ModelBundle | None:
    """kind: "score" (0-100 virality) or "relative" (vs. the account's own average)."""
    return ModelBundle.load(MODELS_DIR / f"{platform}{'' if kind == 'score' else '_relative'}.joblib")


def reliability(within_creator_spearman: float | None) -> str:
    """How well the vs-average model ranked one account's own posts in testing."""
    if within_creator_spearman is None or within_creator_spearman < 0.1:
        return "low"
    return "moderate" if within_creator_spearman < 0.3 else "high"


def vs_account(platform: str, features: dict, caption: str = "") -> tuple[float, str] | None:
    """(expected result / the account's typical result, reliability), or None if no relative model exists."""
    bundle = load_bundle(platform, "relative")
    if bundle is None:
        return None
    log_ratio = float(bundle.predict(bundle.frame([features], [caption]))[0])
    ratio = float(np.exp(np.clip(log_ratio, -2.3, 2.3)))  # cap at 10x either way
    return ratio, reliability(bundle.metrics.get("within_creator_spearman"))


def score(platform: str, features: dict, caption: str = "") -> tuple[float, list[tuple[str, float]]]:
    """Returns (virality score 0-100, [(feature, shap impact), ...] most negative first)."""
    bundle = load_bundle(platform)
    if bundle is None:
        fake = {"youtube": 42.0, "tiktok": 71.0, "instagram": 35.0, "linkedin": 21.0}
        return fake.get(platform, 50.0), [("caption_length", -4.0), ("hour", -2.0), ("hashtag_count", 1.0)]

    X = bundle.frame([features], [caption])
    value = float(bundle.predict(X)[0])
    factors = sorted(bundle.explain(X), key=lambda f: f[1])
    return value, factors
