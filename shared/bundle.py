"""A trained model packaged with everything needed to score a post.

Saved by ml/train.py as models/<platform>.joblib and loaded by api/services/model.py.
Holds the model, the exact feature column order and the caption encoder, so the API
builds inputs exactly the way training did.
"""

from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from shared.text_features import TextEncoder


@dataclass
class ModelBundle:
    platform: str
    model_name: str
    model: object  # has .predict(X); tree models also expose .tree_model for SHAP
    feature_columns: list[str]
    text_encoder: TextEncoder | None = None
    metrics: dict = field(default_factory=dict)

    def frame(self, features: list[dict], captions: list[str]) -> pd.DataFrame:
        """Model input for posts given as feature dicts (from shared.features.build_features) + captions."""
        X = pd.DataFrame(features)
        if self.text_encoder is not None:
            text = self.text_encoder.transform(list(captions)).reset_index(drop=True)
            X = pd.concat([X.reset_index(drop=True), text], axis=1)
        return X.reindex(columns=self.feature_columns).astype("float32")

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return np.clip(np.asarray(self.model.predict(X), dtype=float), 0, 100)

    def explain(self, X: pd.DataFrame) -> list[tuple[str, float]]:
        """SHAP impact of each feature on the first row. Empty if the model type has no fast explainer."""
        tree = getattr(self.model, "tree_model", None)
        if tree is None:
            return []
        try:
            import shap

            if getattr(self, "_explainer", None) is None:
                self._explainer = shap.TreeExplainer(tree)
            values = np.asarray(self._explainer.shap_values(X.iloc[:1]))[0]
        except Exception:
            return []
        return list(zip(self.feature_columns, map(float, values)))

    def __getstate__(self):
        state = self.__dict__.copy()
        state.pop("_explainer", None)  # rebuilt on demand, not saved
        return state

    def save(self, path: Path) -> None:
        joblib.dump(self, path)

    @staticmethod
    def load(path: Path) -> "ModelBundle | None":
        return joblib.load(path) if path.exists() else None
