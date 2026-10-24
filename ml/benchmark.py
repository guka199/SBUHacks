"""Compare every candidate model on every platform -- same splits, same features, same metrics --
and recommend ONE model type to keep iterating on.

Usage (from repo root):
    python -m ml.benchmark --smoke         # tiny run of every model (~2 min) - catches errors first
    python -m ml.benchmark                 # full comparison (~30-45 min; run it in the background)
    python -m ml.benchmark --models xgboost lightgbm catboost --platforms tiktok instagram

Fairness rules:
  - one creator-grouped train/valid/test split per platform, shared by all models
  - the same capped training sample for every model (--max-train), so families compete on equal data
  - valid set only for early stopping; every reported number comes from the untouched test set
  - ranking is decided on test Spearman, with creator-level bootstrap to tell real wins from noise

Outputs (models/benchmark/, or models/benchmark/smoke/ with --smoke):
  results.csv     every metric for every platform x model
  report.md       per-platform tables, overall ranking, recommendation
  benchmark.log   full tracebacks of any model that failed
"""

import argparse
import json
import time
import traceback
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

from ml import preflight
from ml.isolation import run_isolated
from ml.data import MODELS_DIR, build_matrices, cap_split, load_platform, split_by_creator
from ml.metrics import GUIDE, bootstrap_ci, evaluate, paired_difference, spearman
from ml.models import MODELS
from shared.features import PLATFORMS

# LinkedIn has only 67 creators, so its scores are too noisy to decide anything; it is reported, not ranked.
RANK_PLATFORMS = ["tiktok", "youtube", "instagram"]
TRAIN_SAMPLE_FOR_OVERFIT = 20_000


def _fmt(x, digits=3) -> str:
    return "-" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:.{digits}f}"


def run_platform(platform: str, model_names: list[str], args, log) -> list[dict]:
    t0 = time.time()
    split = split_by_creator(load_platform(platform), seed=args.seed)
    split = cap_split(split, args.max_train, args.max_valid, args.max_test, seed=args.seed)
    m = build_matrices(platform, split, use_text=not args.no_text)
    print(
        f"\n=== {platform.upper()}: {len(m.X_train):,} train / {len(m.X_valid):,} valid / {len(m.X_test):,} test posts, "
        f"{len(m.feature_columns)} features, {len(set(m.test_groups)):,} test creators (data ready in {time.time() - t0:.0f}s)"
    )

    rng = np.random.default_rng(args.seed)
    train_idx = rng.choice(len(m.X_train), size=min(TRAIN_SAMPLE_FOR_OVERFIT, len(m.X_train)), replace=False)
    baseline = float(m.y_train.mean())
    options = {"time_budget_s": args.time_budget}

    rows, predictions = [], {}
    for name in model_names:
        spec = MODELS[name]
        row = {"platform": platform, "model": name, "family": spec.family, "explainable": spec.explainable,
               "train_rows": len(m.X_train), "test_rows": len(m.X_test), "status": "ok"}
        try:
            result = run_isolated(name, options, m, train_idx, args.model_timeout)
            if not result["ok"]:
                raise RuntimeError(result["error"])
            pred = result["pred"]
            if pred.shape != m.y_test.shape or not np.isfinite(pred).all():
                raise ValueError(f"bad predictions: shape {pred.shape}, all finite={np.isfinite(pred).all()}")

            metrics = evaluate(m.y_test, pred, baseline)
            row["decile_means"] = json.dumps(metrics.pop("decile_means"))
            row.update(metrics)
            row["fit_seconds"], row["ms_per_post"] = result["fit_seconds"], result["ms_per_post"]
            row["spearman_low"], row["spearman_high"] = bootstrap_ci(m.y_test, pred, m.test_groups, args.n_boot)
            row["train_spearman"] = spearman(m.y_train[train_idx], result["pred_train"])
            row["overfit_gap"] = row["train_spearman"] - row["spearman"]
            predictions[name] = pred
        except Exception as e:
            message = str(e).strip().splitlines()[-1] if str(e).strip() else type(e).__name__
            row["status"] = f"error: {message}"[:300]
            log.write(f"\n[{datetime.now():%H:%M:%S}] {platform} / {name}\n{e}\n{traceback.format_exc()}\n")
            log.flush()

        rows.append(row)
        if row["status"] == "ok":
            print(
                f"  {name:<24} Spearman {row['spearman']:.3f} [{_fmt(row['spearman_low'])}, {_fmt(row['spearman_high'])}]"
                f"  AUC {row['auc']:.3f}  Lift {row['lift_top25']:.2f}  fit {row['fit_seconds']:.1f}s", flush=True
            )
        else:
            print(f"  {name:<24} FAILED - {row['status']}", flush=True)

    # Is each model statistically tied with this platform's best? (paired bootstrap on the same creators)
    ok = [r for r in rows if r["status"] == "ok"]
    if ok:
        best = max(ok, key=lambda r: r["spearman"])
        for r in ok:
            r["rank"] = 1 + sum(o["spearman"] > r["spearman"] for o in ok)
            if r is best:
                r["diff_vs_best_low"] = r["diff_vs_best_high"] = 0.0
            else:
                r["diff_vs_best_low"], r["diff_vs_best_high"] = paired_difference(
                    m.y_test, predictions[best["model"]], predictions[r["model"]], m.test_groups, args.n_boot
                )
            r["tied_with_best"] = bool(r is best or (r["diff_vs_best_low"] <= 0 <= r["diff_vs_best_high"]))
    return rows


def overall_ranking(results: pd.DataFrame, rank_platforms: list[str]) -> pd.DataFrame:
    ok = results[(results["status"] == "ok") & results["platform"].isin(rank_platforms)]
    if ok.empty:
        return pd.DataFrame()
    n_platforms = ok["platform"].nunique()
    summary = ok.groupby("model").agg(
        family=("family", "first"),
        explainable=("explainable", "first"),
        platforms=("platform", "nunique"),
        mean_rank=("rank", "mean"),
        mean_spearman=("spearman", "mean"),
        mean_auc=("auc", "mean"),
        mean_pr_auc=("pr_auc", "mean"),
        mean_lift=("lift_top25", "mean"),
        tied_best=("tied_with_best", "sum"),
        mean_overfit=("overfit_gap", "mean"),
        fit_seconds=("fit_seconds", "mean"),
        ms_per_post=("ms_per_post", "mean"),
    )
    summary = summary[summary["platforms"] == n_platforms]  # only models that ran everywhere can win
    return summary.sort_values(["mean_rank", "mean_spearman"], ascending=[True, False])


def recommendation(summary: pd.DataFrame, rank_platforms: list[str]) -> list[str]:
    n_platforms = len(rank_platforms)
    if summary.empty:
        return ["No model ran successfully on every ranked platform - see benchmark.log."]
    top = summary.index[0]
    lines = [f"**Recommended model type: `{top}`** - best average rank across {', '.join(rank_platforms)}."]
    tied = summary[summary["tied_best"] == n_platforms].index.tolist()
    if tied:
        lines.append(f"Statistically tied with the best on every ranked platform: {', '.join(f'`{t}`' for t in tied)}.")
    if not summary.loc[top, "explainable"]:
        explainable = summary[summary["explainable"]]
        if not explainable.empty:
            lines.append(
                f"`{top}` has no fast SHAP explanations (the API's per-feature suggestions); the best explainable "
                f"model is `{explainable.index[0]}`."
            )
    return lines


def write_report(results: pd.DataFrame, args, out_dir: Path, rank_platforms: list[str]) -> None:
    lines = [
        "# Model benchmark",
        "",
        f"Run {datetime.now():%Y-%m-%d %H:%M} | max train rows {args.max_train:,} | max test rows {args.max_test:,} | "
        f"caption topics {'off' if args.no_text else 'on'} | bootstrap {args.n_boot} | seed {args.seed}",
        "",
    ]
    summary = overall_ranking(results, rank_platforms)
    lines += recommendation(summary, rank_platforms) + [""]

    if not summary.empty:
        lines += [
            f"## Overall (ranked on {', '.join(rank_platforms)})",
            "",
            "| model | family | mean rank | mean Spearman | mean AUC | mean PR-AUC | mean lift | tied with best | overfit | fit s | ms/post | SHAP |",
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
        for name, r in summary.iterrows():
            lines.append(
                f"| {name} | {r['family']} | {r['mean_rank']:.1f} | {r['mean_spearman']:.3f} | {r['mean_auc']:.3f} | "
                f"{r['mean_pr_auc']:.3f} | {r['mean_lift']:.2f} | {int(r['tied_best'])}/{len(rank_platforms)} | "
                f"{r['mean_overfit']:.3f} | {r['fit_seconds']:.1f} | {r['ms_per_post']:.1f} | {'yes' if r['explainable'] else 'no'} |"
            )
        lines.append("")

    for platform, group in results.groupby("platform", sort=False):
        ok = group[group["status"] == "ok"].sort_values("spearman", ascending=False)
        note = "" if platform in rank_platforms else " (reported only - too few creators to rank on)"
        lines += [
            f"## {platform}{note}",
            "",
            "| model | Spearman [95% CI] | tied w/ best | Kendall | NDCG@10 | AUC | PR-AUC | P@10 | Lift@25 | top-bottom | MAE skill | R2 | overfit | fit s | ms/post |",
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
        for _, r in ok.iterrows():
            lines.append(
                f"| {r['model']} | {r['spearman']:.3f} [{_fmt(r['spearman_low'])}, {_fmt(r['spearman_high'])}] | "
                f"{'yes' if r['tied_with_best'] else 'no'} | {r['kendall']:.3f} | {r['ndcg_top10']:.3f} | {r['auc']:.3f} | "
                f"{_fmt(r['pr_auc'])} | {r['precision_top10']:.2f} | {r['lift_top25']:.2f} | {r['top_bottom_gap']:.1f} | "
                f"{r['mae_skill'] * 100:.1f}% | {r['r2']:.3f} | {r['overfit_gap']:.3f} | {r['fit_seconds']:.1f} | {r['ms_per_post']:.1f} |"
            )
        for _, r in group[group["status"] != "ok"].iterrows():
            lines.append(f"\n- `{r['model']}` failed: {r['status']}")
        lines.append("")

    lines += ["## Metric guide", "", "```", GUIDE.rstrip(), "```", ""]
    (out_dir / "report.md").write_text("\n".join(lines))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--platforms", nargs="+", default=PLATFORMS, choices=PLATFORMS)
    parser.add_argument("--models", nargs="+", default=list(MODELS), choices=list(MODELS))
    parser.add_argument("--max-train", type=int, default=100_000, help="training rows per platform (same for all models)")
    parser.add_argument("--max-valid", type=int, default=25_000)
    parser.add_argument("--max-test", type=int, default=50_000)
    parser.add_argument("--n-boot", type=int, default=200, help="bootstrap resamples for confidence intervals")
    parser.add_argument("--time-budget", type=float, default=180, help="max training seconds per neural net")
    parser.add_argument("--model-timeout", type=float, default=1800, help="max seconds per model before it is killed")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--no-text", action="store_true", help="skip caption topic features")
    parser.add_argument("--smoke", action="store_true", help="tiny, fast run of everything to catch errors")
    args = parser.parse_args()

    out_dir = MODELS_DIR / "benchmark"
    partial = set(args.platforms) != set(PLATFORMS) or set(args.models) != set(MODELS)
    if partial and not args.smoke:
        out_dir = out_dir / "partial"  # never overwrite the full comparison with a subset run
    if args.smoke:
        args.max_train, args.max_valid, args.max_test, args.n_boot, args.time_budget = 3_000, 1_000, 2_000, 20, 10
        args.model_timeout = min(args.model_timeout, 300)
        out_dir = out_dir / "smoke"
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Preflight checks")
    platforms, model_names = preflight.run(args.platforms, args.models)
    print(f"\nComparing {len(model_names)} models on {len(platforms)} platforms -> {out_dir.relative_to(MODELS_DIR.parent)}/")
    print(GUIDE)

    all_rows: list[dict] = []
    started = time.time()
    with open(out_dir / "benchmark.log", "w") as log:
        try:
            for platform in platforms:
                all_rows += run_platform(platform, model_names, args, log)
                pd.DataFrame(all_rows).to_csv(out_dir / "results.csv", index=False)  # saved after every platform
        except KeyboardInterrupt:
            print("\nInterrupted - writing results so far.")

    results = pd.DataFrame(all_rows)
    results.to_csv(out_dir / "results.csv", index=False)
    rank_platforms = [p for p in RANK_PLATFORMS if p in platforms] or platforms
    write_report(results, args, out_dir, rank_platforms)

    failures = results[results["status"] != "ok"]
    summary = overall_ranking(results, rank_platforms)
    print(f"\n=== OVERALL (ranked on {', '.join(rank_platforms)}) - {(time.time() - started) / 60:.1f} min")
    if not summary.empty:
        print(summary[["family", "mean_rank", "mean_spearman", "mean_auc", "mean_lift", "tied_best", "fit_seconds"]].round(3).to_string())
    for line in recommendation(summary, rank_platforms):
        print(line.replace("**", "").replace("`", ""))
    print(f"\n{len(failures)} failures" + (" - see benchmark.log" if len(failures) else ""))
    print(f"Report: {(out_dir / 'report.md').relative_to(MODELS_DIR.parent)}")


if __name__ == "__main__":
    main()
