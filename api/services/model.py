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
    """Returns (predicted engagement rate, [(feature, shap impact), ...] most negative first)."""
    model = load_model(platform)
    if model is None:
        fake = {"youtube": 0.042, "tiktok": 0.071, "instagram": 0.035, "linkedin": 0.021}
        return fake.get(platform, 0.03), [("caption_length", -0.004), ("hour", -0.002), ("hashtag_count", 0.001)]

    import shap

    X = pd.DataFrame([features], columns=FEATURE_COLUMNS)
    pred = float(model.predict(X)[0])
    shap_values = shap.TreeExplainer(model).shap_values(X)[0]
    factors = sorted(zip(FEATURE_COLUMNS, map(float, shap_values)), key=lambda f: f[1])
    return max(pred, 0.0), factors
