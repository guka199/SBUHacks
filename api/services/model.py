"""Loads the trained model bundles (models/<platform>.joblib, made by ml/train.py) and scores drafts.

If no trained model exists yet, returns a fixed fake score so the frontend
can be built in parallel (build order step 1).
"""

from functools import lru_cache
from pathlib import Path
import logging
import os

import numpy as np

from shared.bundle import ModelBundle
from shared.features import THUMBNAIL_ENCODER, THUMBNAIL_COLUMNS

MODELS_DIR = Path(__file__).resolve().parents[2] / "models"
log = logging.getLogger(__name__)


@lru_cache
def thumbnail_bundle(kind: str = "score") -> ModelBundle | None:
    """Explicit opt-in candidates; the existing served artifacts remain the fallback."""
    if os.getenv("YOUTUBE_THUMBNAILS_ENABLED", "false").lower() != "true":
        return None
    targets = {s.strip() for s in os.getenv("YOUTUBE_THUMBNAIL_TARGETS", "score,relative").split(",")}
    if kind not in targets:
        return None
    suffix = "" if kind == "score" else "_relative"
    try:
        bundle = ModelBundle.load(MODELS_DIR / "candidates" / f"youtube_thumbnail{suffix}.joblib")
        if bundle is None:
            return None
        if (bundle.platform != "youtube" or bundle.target != kind or
                getattr(bundle, "thumbnail_encoder", None) != THUMBNAIL_ENCODER or
                not set(THUMBNAIL_COLUMNS).issubset(bundle.feature_columns)):
            log.warning("Incompatible thumbnail model; using the existing model")
            return None
        return bundle
    except Exception:
        log.warning("Could not load thumbnail model; using the existing model")
        return None


def selected_bundle(platform: str, kind: str, thumbnail_embedding=None):
    visual = thumbnail_bundle(kind) if platform == "youtube" and thumbnail_embedding is not None else None
    return visual or load_bundle(platform, kind)


@lru_cache
def load_bundle(platform: str, kind: str = "score") -> ModelBundle | None:
    """kind: "score" (0-100 virality) or "relative" (vs. the account's own average)."""
    return ModelBundle.load(MODELS_DIR / f"{platform}{'' if kind == 'score' else '_relative'}.joblib")


def reliability(within_creator_spearman: float | None) -> str:
    """How well the vs-average model ranked one account's own posts in testing."""
    if within_creator_spearman is None or within_creator_spearman < 0.1:
        return "low"
    return "moderate" if within_creator_spearman < 0.3 else "high"


def vs_account(platform: str, features: dict, caption: str = "", thumbnail_embedding=None) -> tuple[float, str] | None:
    """(expected result / the account's typical result, reliability), or None if no relative model exists."""
    bundle = selected_bundle(platform, "relative", thumbnail_embedding)
    if bundle is None:
        return None
    log_ratio = float(bundle.predict(bundle.frame([features], [caption], [thumbnail_embedding]))[0])
    ratio = float(np.exp(np.clip(log_ratio, -2.3, 2.3)))  # cap at 10x either way
    label = reliability(bundle.metrics.get("within_creator_spearman"))
    if bundle.metrics.get("pilot") and label == "high":
        label = "moderate"
    return ratio, label


def score(platform: str, features: dict, caption: str = "", thumbnail_embedding=None) -> tuple[float, list[tuple[str, float]]]:
    """Returns (virality score 0-100, [(feature, shap impact), ...] most negative first)."""
    bundle = selected_bundle(platform, "score", thumbnail_embedding)
    if bundle is None:
        fake = {"youtube": 42.0, "tiktok": 71.0, "instagram": 35.0, "linkedin": 21.0}
        return fake.get(platform, 50.0), [("caption_length", -4.0), ("hour", -2.0), ("hashtag_count", 1.0)]

    X = bundle.frame([features], [caption], [thumbnail_embedding])
    value = float(bundle.predict(X)[0])
    factors = sorted(bundle.explain(X), key=lambda f: f[1])
    return value, factors
