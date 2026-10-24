"""Every candidate model behind ONE interface, so they can be compared fairly.

    model = MODELS["xgboost"].make(options)
    model.fit(X_train, y_train, X_valid, y_valid)   # valid set is used only for early stopping
    model.predict(X)                                 # -> virality score per row (0-100 scale)

To add a model: write an adapter (or reuse SklearnModel) and register a ModelSpec in MODELS.
Optional libraries are imported lazily, so a missing one only disables its own model.
"""

import sys
from dataclasses import dataclass
from importlib import import_module
from typing import Callable

import numpy as np
from sklearn.compose import TransformedTargetRegressor
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.neighbors import KNeighborsRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import QuantileTransformer, StandardScaler

SEED = 42

# The model type the API serves. Chosen with `python -m ml.benchmark`; see models/benchmark/report.md.
DEFAULT_MODEL = "catboost"


def make_preprocessor(n_rows: int) -> Pipeline:
    """For models that need clean, scaled inputs (linear, KNN, neural nets).

    Median-fill missing values (+ a 0/1 'was missing' column each), then map every feature to a
    normal distribution by rank, which tames heavy tails like follower counts and caption length.
    """
    return make_pipeline(
        SimpleImputer(strategy="median", add_indicator=True, keep_empty_features=True),
        QuantileTransformer(
            output_distribution="normal", n_quantiles=max(10, min(1000, n_rows)), subsample=200_000, random_state=SEED
        ),
    )


def _check_no_torch(library: str) -> None:
    """On macOS, XGBoost/LightGBM segfault if PyTorch is already loaded (different OpenMP runtimes)."""
    if sys.platform == "darwin" and "torch" in sys.modules:
        raise RuntimeError(
            f"PyTorch is loaded in this process; on macOS {library} cannot run alongside it. "
            "Run it in a separate process (ml.benchmark does this automatically)."
        )


# ----------------------------------------------------------------------------- adapters

class SklearnModel:
    """Any scikit-learn regressor, optionally behind make_preprocessor (fit on train rows only)."""

    def __init__(self, estimator, preprocess: bool = False, tree: bool = False):
        self.estimator = estimator
        self.preprocess = preprocess
        self.tree = tree  # tree models take raw features (NaN allowed) and support SHAP

    def fit(self, X, y, X_valid=None, y_valid=None):
        steps = [make_preprocessor(len(X))] if self.preprocess else []
        self.pipeline = make_pipeline(*steps, self.estimator).fit(X, y)
        return self

    def predict(self, X) -> np.ndarray:
        return self.pipeline.predict(X)

    @property
    def tree_model(self):
        return self.pipeline[-1] if self.tree and not self.preprocess else None


class HGBModel:
    """scikit-learn's histogram gradient boosting (LightGBM-style), early-stopped on the valid set."""

    def __init__(self, **params):
        self.params = dict(
            max_iter=2000, learning_rate=0.05, max_leaf_nodes=63, min_samples_leaf=50,
            l2_regularization=1.0, early_stopping=True, n_iter_no_change=50, random_state=SEED,
        ) | params

    def fit(self, X, y, X_valid=None, y_valid=None):
        self.model = HistGradientBoostingRegressor(**self.params)
        if X_valid is not None:
            self.model.fit(X, y, X_val=X_valid, y_val=y_valid)
        else:
            self.model.fit(X, y)
        return self

    def predict(self, X) -> np.ndarray:
        return self.model.predict(X)

    @property
    def tree_model(self):
        return self.model


class XGBModel:
    def __init__(self, **params):
        self.params = dict(
            n_estimators=3000, learning_rate=0.05, max_depth=6, min_child_weight=20, subsample=0.8,
            colsample_bytree=0.8, tree_method="hist", eval_metric="mae", n_jobs=-1, random_state=SEED,
        ) | params

    def fit(self, X, y, X_valid=None, y_valid=None):
        _check_no_torch("XGBoost")
        import xgboost as xgb

        if X_valid is None:
            self.model = xgb.XGBRegressor(**(self.params | {"n_estimators": 500})).fit(X, y)
        else:
            self.model = xgb.XGBRegressor(**self.params, early_stopping_rounds=100)
            self.model.fit(X, y, eval_set=[(X_valid, y_valid)], verbose=False)
        return self

    def predict(self, X) -> np.ndarray:
        return self.model.predict(X)

    @property
    def tree_model(self):
        return self.model


class LGBMModel:
    def __init__(self, **params):
        self.params = dict(
            n_estimators=3000, learning_rate=0.05, num_leaves=63, min_child_samples=50, subsample=0.8,
            subsample_freq=1, colsample_bytree=0.8, reg_lambda=1.0, n_jobs=-1, random_state=SEED, verbose=-1,
        ) | params

    def fit(self, X, y, X_valid=None, y_valid=None):
        _check_no_torch("LightGBM")
        import lightgbm as lgb

        if X_valid is None:
            self.model = lgb.LGBMRegressor(**(self.params | {"n_estimators": 500})).fit(X, y)
        else:
            self.model = lgb.LGBMRegressor(**self.params)
            self.model.fit(
                X, y, eval_set=[(X_valid, y_valid)], eval_metric="l1",
                callbacks=[lgb.early_stopping(100, verbose=False)],
            )
        return self

    def predict(self, X) -> np.ndarray:
        return self.model.predict(X)

    @property
    def tree_model(self):
        return self.model


class CatBoostModel:
    def __init__(self, **params):
        self.params = dict(
            iterations=3000, learning_rate=0.05, depth=6, loss_function="RMSE", eval_metric="MAE",
            random_seed=SEED, verbose=0, allow_writing_files=False, thread_count=-1,
        ) | params

    def fit(self, X, y, X_valid=None, y_valid=None):
        from catboost import CatBoostRegressor

        if X_valid is None:
            self.model = CatBoostRegressor(**(self.params | {"iterations": 500})).fit(X, y)
        else:
            self.model = CatBoostRegressor(**self.params)
            self.model.fit(X, y, eval_set=(X_valid, y_valid), use_best_model=True, early_stopping_rounds=100)
        return self

    def predict(self, X) -> np.ndarray:
        return self.model.predict(X)

    @property
    def tree_model(self):
        return self.model


def _torch(arch: str, options: dict):
    from ml.torch_models import TorchRegressor

    return TorchRegressor(arch, time_budget_s=options.get("time_budget_s", 180), seed=SEED)


# ----------------------------------------------------------------------------- registry

@dataclass(frozen=True)
class ModelSpec:
    name: str
    family: str  # baseline | linear | neighbors | trees | boosting | neural
    description: str
    make: Callable[[dict], object]
    requires: tuple[str, ...] = ()
    explainable: bool = False  # SHAP TreeExplainer works -> powers per-feature suggestions in the API


_SPECS = [
    ModelSpec(
        "baseline_mean", "baseline", "Always predicts the training average (the bar every model must beat)",
        lambda o: SklearnModel(DummyRegressor(strategy="mean")),
    ),
    ModelSpec(
        "ridge", "linear", "Linear regression (L2) on quantile-normalized features",
        lambda o: SklearnModel(Ridge(alpha=10.0), preprocess=True),
    ),
    ModelSpec(
        "knn", "neighbors", "Average score of the 50 most similar training posts",
        lambda o: SklearnModel(KNeighborsRegressor(n_neighbors=50, algorithm="brute", n_jobs=-1), preprocess=True),
    ),
    ModelSpec(
        "random_forest", "trees", "300 bagged decision trees (bootstrap rows, random feature subsets)",
        lambda o: SklearnModel(
            RandomForestRegressor(
                n_estimators=300, max_features=0.33, min_samples_leaf=20, max_samples=0.5,
                n_jobs=-1, random_state=SEED,
            ),
            tree=True,
        ),
        explainable=True,
    ),
    ModelSpec(
        "extra_trees", "trees", "300 extremely randomized trees (random split thresholds)",
        lambda o: SklearnModel(
            ExtraTreesRegressor(
                n_estimators=300, max_features=0.5, min_samples_leaf=20, max_samples=0.5, bootstrap=True,
                n_jobs=-1, random_state=SEED,
            ),
            tree=True,
        ),
        explainable=True,
    ),
    ModelSpec(
        "hist_gradient_boosting", "boosting", "scikit-learn histogram gradient boosting",
        lambda o: HGBModel(), explainable=True,
    ),
    ModelSpec("xgboost", "boosting", "XGBoost gradient boosting", lambda o: XGBModel(), ("xgboost",), True),
    ModelSpec("lightgbm", "boosting", "LightGBM leaf-wise gradient boosting", lambda o: LGBMModel(), ("lightgbm",), True),
    ModelSpec("catboost", "boosting", "CatBoost symmetric-tree gradient boosting", lambda o: CatBoostModel(), ("catboost",), True),
    ModelSpec(
        "mlp_sklearn", "neural", "scikit-learn neural net, 3 hidden layers (256-128-64)",
        lambda o: SklearnModel(
            TransformedTargetRegressor(
                regressor=MLPRegressor(
                    hidden_layer_sizes=(256, 128, 64), alpha=1e-4, batch_size=512, learning_rate_init=1e-3,
                    max_iter=100, early_stopping=True, n_iter_no_change=8, random_state=SEED,
                ),
                transformer=StandardScaler(),
            ),
            preprocess=True,
        ),
    ),
    ModelSpec("torch_mlp", "neural", "PyTorch deep MLP (512-256-128, BatchNorm, dropout)", lambda o: _torch("mlp", o), ("torch",)),
    ModelSpec("torch_resnet", "neural", "PyTorch tabular ResNet (residual blocks)", lambda o: _torch("resnet", o), ("torch",)),
    ModelSpec(
        "ft_transformer", "neural", "PyTorch FT-Transformer (attention across features)",
        lambda o: _torch("ft_transformer", o), ("torch",),
    ),
]
MODELS: dict[str, ModelSpec] = {s.name: s for s in _SPECS}


def availability(spec: ModelSpec) -> tuple[bool, str]:
    """Can this model run here? (False, reason) if a required library won't import."""
    for lib in spec.requires:
        try:
            import_module(lib)
        except Exception as e:  # ImportError, or OSError when a native library is missing
            return False, f"{lib} unavailable ({type(e).__name__}: {str(e)[:80]})"
    return True, ""
