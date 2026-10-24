"""Matched YouTube visual-feature experiment, invoked through ml.benchmark."""

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

from ml.data import TARGETS, build_matrices, cap_split, split_by_creator, with_thumbnails
from ml.isolation import run_isolated
from ml.metrics import bootstrap_ci, evaluate, evaluate_relative, paired_difference, spearman, within_creator_spearman
from shared.features import THUMBNAIL_ENCODER
from shared.thumbnails import load_embedding_cache


def within_difference(y, baseline, visual, groups, n_boot):
    frame = pd.DataFrame({"y": y, "baseline": baseline, "visual": visual, "creator": groups})
    diffs = np.array([spearman(g.y, g.visual) - spearman(g.y, g.baseline)
                      for _, g in frame.groupby("creator") if len(g) >= 5])
    if len(diffs) < 2:
        return None, None
    rng = np.random.default_rng(0)
    samples = [float(rng.choice(diffs, len(diffs), replace=True).mean()) for _ in range(n_boot)]
    return tuple(map(float, np.quantile(samples, [.025, .975])))


def run(args) -> None:
    if args.thumbnail_data is None or args.thumbnail_cache is None:
        raise SystemExit("--thumbnail-ablation requires --thumbnail-data and --thumbnail-cache")
    source = pd.read_parquet(args.thumbnail_data)
    required = {"platform", "creator_id", "external_id", "thumbnail_url", "caption", "extra", *TARGETS.values()}
    if not required.issubset(source.columns) or not source.platform.eq("youtube").all():
        raise SystemExit("Provide processed YouTube training data with score and account-relative labels")
    if source.external_id.duplicated().any():
        raise SystemExit("Training data contains duplicate video IDs")
    embeddings = load_embedding_cache(args.thumbnail_cache)
    cohort = source[source.thumbnail_url.isin(embeddings)].reset_index(drop=True)
    if len(cohort) < 1000 or cohort.creator_id.nunique() < 25:
        raise SystemExit("Need at least 1,000 real posts from 25 creators with usable thumbnails")
    split = cap_split(split_by_creator(cohort, seed=args.seed), args.max_train, args.max_valid, args.max_test, args.seed)
    output = args.thumbnail_output
    output.mkdir(parents=True, exist_ok=True)
    candidates = Path("models/candidates")
    report = {
        "data_sha256": hashlib.sha256(args.thumbnail_data.read_bytes()).hexdigest(),
        "cache_sha256": hashlib.sha256(args.thumbnail_cache.read_bytes()).hexdigest(),
        "encoder": THUMBNAIL_ENCODER, "seed": args.seed, "source_rows": len(source), "cohort_rows": len(cohort),
        "creators": int(cohort.creator_id.nunique()), "split": split.sizes(),
        "protocol": "Matched rows, creator-disjoint split, identical caption encoder and CatBoost parameters; early stopping on validation only.",
        "caution": "Retrospective convenience-sample pilot. Current thumbnails can have been edited after publication. This does not establish prospective performance or a seven-day forecast.",
        "targets": {},
    }
    lines = ["# YouTube thumbnail ablation", "", report["protocol"], "", report["caution"], "",
             f"Available-image cohort: {len(cohort):,}/{len(source):,} posts; {cohort.creator_id.nunique()} creators.",
             f"Seed: {args.seed}. Split: {split.sizes()}. Both arms exclude the same unavailable images.", ""]
    enabled_targets = []
    for target in args.thumbnail_targets:
        m = build_matrices("youtube", split, target=TARGETS[target])
        visual = with_thumbnails(m, split, embeddings)
        rng = np.random.default_rng(args.seed)
        train_idx = rng.choice(len(m.X_train), min(20_000, len(m.X_train)), replace=False)
        suffix = "" if target == "score" else "_relative"
        paths = {"metadata": candidates / f"youtube_metadata_pilot{suffix}.joblib",
                 "thumbnail": candidates / f"youtube_thumbnail{suffix}.joblib"}
        results, summaries = {}, {}
        for name, matrix in [("metadata", m), ("thumbnail", visual)]:
            print(f"Training {target}/{name}: {len(matrix.X_train):,} train, {len(matrix.X_test):,} test, {len(matrix.feature_columns)} inputs", flush=True)
            result = run_isolated("catboost", {"thread_count": 4}, matrix, train_idx, args.model_timeout, paths[name])
            if not result["ok"]:
                raise RuntimeError(f"{target}/{name} failed: {result['error']}")
            if result["pred"].shape != m.y_test.shape or not np.isfinite(result["pred"]).all():
                raise RuntimeError("Invalid candidate predictions")
            groups_valid = split.valid[split.valid[TARGETS[target]].notna()].creator_id.to_numpy()
            valid_metric = (within_creator_spearman(matrix.y_valid, result["pred_valid"], groups_valid)[0]
                            if target == "relative" else spearman(matrix.y_valid, result["pred_valid"]))
            metrics = (evaluate_relative(m.y_test, result["pred"], m.test_groups) if target == "relative"
                       else evaluate(m.y_test, result["pred"], float(m.y_train.mean())))
            metrics["within_creator_spearman"], metrics["within_creators"] = within_creator_spearman(m.y_test, result["pred"], m.test_groups)
            metrics["spearman_low"], metrics["spearman_high"] = bootstrap_ci(m.y_test, result["pred"], m.test_groups, args.n_boot)
            metrics.update(validation_primary=valid_metric, features=len(matrix.feature_columns), fit_seconds=result["fit_seconds"])
            summaries[name] = metrics
            results[name] = result
            # Verify the actual saved API bundle sees identical features and predictions.
            from shared.bundle import ModelBundle
            from ml.train import check_serving_matches_training
            bundle = ModelBundle.load(paths[name])
            bundle.metrics = {**metrics, "model": "catboost", "platform": "youtube", "target": target,
                              "pilot": True, "data_sha256": report["data_sha256"]}
            check_serving_matches_training(bundle, "youtube", matrix, result["pred"])
            bundle.save(paths[name])
            print(f"  test rank={metrics['spearman']:.4f}; within-account={metrics['within_creator_spearman']:.4f}; validation={valid_metric:.4f}", flush=True)
        rank_ci = paired_difference(m.y_test, results["thumbnail"]["pred"], results["metadata"]["pred"], m.test_groups, args.n_boot)
        within_ci = within_difference(m.y_test, results["metadata"]["pred"], results["thumbnail"]["pred"], m.test_groups, args.n_boot)
        valid_delta = summaries["thumbnail"]["validation_primary"] - summaries["metadata"]["validation_primary"]
        primary_ci = within_ci if target == "relative" else rank_ci
        supported = bool(np.isfinite(valid_delta) and valid_delta >= .01 and primary_ci[0] is not None and primary_ci[0] > 0)
        if supported:
            enabled_targets.append(target)
        report["targets"][target] = {"metrics": summaries, "validation_delta": valid_delta,
                                     "test_rank_delta_ci95": rank_ci, "test_within_creator_delta_ci95": within_ci,
                                     "evidence_supports_candidate": supported,
                                     "candidate_sha256": hashlib.sha256(paths["thumbnail"].read_bytes()).hexdigest()}
        lines += [f"## {target}", "", "| Variant | Validation primary | Test Spearman | Test within-account Spearman | Features |",
                  "| --- | ---: | ---: | ---: | ---: |"]
        for name, metrics in summaries.items():
            lines.append(f"| {name} | {metrics['validation_primary']:.4f} | {metrics['spearman']:.4f} | {metrics['within_creator_spearman']:.4f} | {metrics['features']} |")
        lines += ["", f"Paired test rank delta 95% CI: {rank_ci}.", f"Paired within-account delta 95% CI: {within_ci}.",
                  f"Candidate evidence criterion met: **{supported}** (validation gain >=0.01 and paired primary test CI entirely above zero).", ""]
    report["supported_targets"] = enabled_targets
    report["production_models_replaced"] = False
    lines += ["## Deployment", "", "Existing served model files were not replaced. Candidate bundles are in ignored `models/candidates/`.",
              "Visual serving is opt-in with `YOUTUBE_THUMBNAILS_ENABLED=true`; keep it disabled unless the evidence and cohort suit the use case.",
              "Requests must also explicitly set `use_thumbnail_model=true` (the website checkbox is off by default).",
              "Request-time image failures or absent images fall back to the existing metadata model.", ""]
    def clean(value):
        if isinstance(value, dict): return {k: clean(v) for k, v in value.items()}
        if isinstance(value, (list, tuple)): return [clean(v) for v in value]
        if isinstance(value, (float, np.floating)) and not np.isfinite(value): return None
        return value
    (output / "results.json").write_text(json.dumps(clean(report), indent=2, allow_nan=False))
    (output / "report.md").write_text("\n".join(lines))
    print(f"Comparison saved to {output / 'report.md'}; supported targets: {enabled_targets}", flush=True)
