"""Train the chosen model type on ALL the data for each platform and save it for the API.

Pick the model type with `python -m ml.benchmark` first; it's DEFAULT_MODEL in ml/models.py.

Two kinds of model per platform (--target):
    score     0-100 virality percentile within the platform           -> models/<platform>.joblib
    relative  this post vs. the account's own average (log ratio)    -> models/<platform>_relative.joblib
Each also writes models/metrics_<platform>[_relative].json with its test-set metrics.

Usage (from repo root):
    python -m ml.train                          # DEFAULT_MODEL, all platforms
    python -m ml.train tiktok --model lightgbm  # one platform, another model type
    python -m ml.train --max-train 200000       # cap training rows (faster)
    python -m ml.train --target relative        # the vs-your-average models
"""

import argparse
import json
import time
import warnings

import numpy as np

from ml import preflight
from ml.data import MODELS_DIR, TARGETS, build_matrices, cap_split, load_platform, split_by_creator
from ml.metrics import bootstrap_ci, evaluate, evaluate_relative, spearman
from ml.models import DEFAULT_MODEL, MODELS
from shared.bundle import ModelBundle
from shared.features import PLATFORMS, build_features


def check_serving_matches_training(bundle: ModelBundle, platform: str, m, expected: np.ndarray, n: int = 25) -> None:
    """Score a few test posts the way the API does (one dict at a time) and compare with training's batch path.

    Catches train/serve skew: a feature built differently in the API than in training.
    """
    posts = m.test_posts.head(n).to_dict("records")
    features = [build_features(platform, {**json.loads(p.get("extra") or "{}"), **p}) for p in posts]
    served = bundle.predict(bundle.frame(features, [p["caption"] for p in posts]))
    expected = expected[: len(posts)]
    if bundle.target == "score":
        expected = np.clip(expected, 0, 100)
    if not np.allclose(served, expected, atol=1e-2):
        raise AssertionError(f"[{platform}] API-path predictions differ from training - check shared/features.py")


def train_platform(platform: str, model_name: str, args) -> dict:
    t0 = time.time()
    split = cap_split(split_by_creator(load_platform(platform), seed=args.seed), max_train=args.max_train, seed=args.seed)
    m = build_matrices(platform, split, use_text=not args.no_text, target=TARGETS[args.target])

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        model = MODELS[model_name].make({"time_budget_s": args.time_budget}).fit(m.X_train, m.y_train, m.X_valid, m.y_valid)
        pred = np.asarray(model.predict(m.X_test), dtype=float)
        train_idx = np.random.default_rng(args.seed).choice(len(m.X_train), min(20_000, len(m.X_train)), replace=False)
        train_spearman = spearman(m.y_train[train_idx], model.predict(m.X_train.iloc[train_idx]))

    if args.target == "score":
        metrics = evaluate(m.y_test, pred, baseline=float(m.y_train.mean()))
    else:
        metrics = evaluate_relative(m.y_test, pred, m.test_groups)
    metrics["spearman_low"], metrics["spearman_high"] = bootstrap_ci(m.y_test, pred, m.test_groups, n_boot=200)
    metrics["train_spearman"] = train_spearman
    metrics["overfit_gap"] = train_spearman - metrics["spearman"]
    summary = {
        "platform": platform,
        "model": model_name,
        "target": args.target,
        "text_features": m.text_encoder is not None,
        "rows": split.sizes(),
        "features": len(m.feature_columns),
        "seconds": round(time.time() - t0, 1),
        **metrics,
    }

    bundle = ModelBundle(platform, model_name, model, m.feature_columns, m.text_encoder, summary, target=args.target)
    check_serving_matches_training(bundle, platform, m, pred)
    MODELS_DIR.mkdir(exist_ok=True)
    suffix = "" if args.target == "score" else "_relative"
    bundle.save(MODELS_DIR / f"{platform}{suffix}.joblib")
    (MODELS_DIR / f"metrics_{platform}{suffix}.json").write_text(json.dumps(summary, indent=2))
    for old in (MODELS_DIR / f"engagement_{platform}.json", MODELS_DIR / f"text_{platform}.joblib"):
        old.unlink(missing_ok=True)  # files from the previous XGBoost-only format
    return summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("platforms", nargs="*", default=PLATFORMS)
    parser.add_argument("--model", default=DEFAULT_MODEL, choices=list(MODELS))
    parser.add_argument("--target", default="score", choices=list(TARGETS), help="score (0-100) or relative (vs. account average)")
    parser.add_argument("--max-train", type=int, help="cap training rows per platform")
    parser.add_argument("--time-budget", type=float, default=600, help="max training seconds for neural nets")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--no-text", action="store_true", help="skip caption topic features")
    args = parser.parse_args()

    print("Preflight checks")
    platforms, ready = preflight.run(args.platforms, [args.model])
    if args.model not in ready:
        raise SystemExit(f"{args.model} can't run here - see the preflight message above")

    print(f"\nTraining {args.model} ({args.target}) on {', '.join(platforms)}")
    for platform in platforms:
        s = train_platform(platform, args.model, args)
        if args.target == "relative":
            print(
                f"  {platform:<10} within-account Spearman {s['within_creator_spearman']:.3f} ({s['within_creators']} accounts)  "
                f"above/below-average accuracy {s['direction_accuracy']:.1%} (base {max(s['share_above_average'], 1 - s['share_above_average']):.1%})  "
                f"AUC {s['auc_beats_average']:.3f}  ({s['rows']['train']:,} train rows, {s['seconds']}s) -> models/{platform}_relative.joblib"
            )
            continue
        print(
            f"  {platform:<10} Spearman {s['spearman']:.3f} [{s['spearman_low']:.3f}, {s['spearman_high']:.3f}]  "
            f"AUC {s['auc']:.3f}  Lift@25 {s['lift_top25']:.2f}  overfit {s['overfit_gap']:.3f}  "
            f"({s['rows']['train']:,} train rows, {s['seconds']}s) -> models/{platform}.joblib"
        )
    print("\nDetails: python -m ml.evaluate")


if __name__ == "__main__":
    main()
