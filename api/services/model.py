"""Loads the trained model bundles (models/<platform>.joblib, made by ml/train.py) and scores drafts.

If no trained model exists yet, returns a fixed fake score so the frontend
can be built in parallel (build order step 1).
"""

from functools import lru_cache
from pathlib import Path

from shared.bundle import ModelBundle

MODELS_DIR = Path(__file__).resolve().parents[2] / "models"


@lru_cache
def load_bundle(platform: str) -> ModelBundle | None:
    return ModelBundle.load(MODELS_DIR / f"{platform}.joblib")


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
