"""Loads trained models from models/ and scores drafts.

If no trained model exists yet, returns a fixed fake score so the frontend
can be built in parallel (build order step 1).
"""

from functools import lru_cache
from pathlib import Path

import pandas as pd

from shared.features import FEATURE_COLUMNS

MODELS_DIR = Path(__file__).resolve().parents[2] / "models"


@lru_cache
def load_model(platform: str):
    path = MODELS_DIR / f"engagement_{platform}.json"
    if not path.exists():
        return None
    import xgboost as xgb

    model = xgb.XGBRegressor()
    model.load_model(path)
    return model


def score(platform: str, features: dict) -> tuple[float, list[tuple[str, float]]]:
    """Returns (virality score 0-100, [(feature, shap impact), ...] most negative first)."""
    model = load_model(platform)
    if model is None:
        fake = {"youtube": 42.0, "tiktok": 71.0, "instagram": 35.0, "linkedin": 21.0}
        return fake.get(platform, 50.0), [("caption_length", -4.0), ("hour", -2.0), ("hashtag_count", 1.0)]

    import shap

    X = pd.DataFrame([features], columns=FEATURE_COLUMNS[platform]).astype(float)
    pred = float(model.predict(X)[0])
    shap_values = shap.TreeExplainer(model).shap_values(X)[0]
    factors = sorted(zip(FEATURE_COLUMNS[platform], map(float, shap_values)), key=lambda f: f[1])
    return min(max(pred, 0.0), 100.0), factors
