"""Evaluation metrics for virality models (used by benchmark.py, train.py and evaluate.py).

The target is a 0-100 virality percentile within each platform. For a pre-publish scorer what
matters most is RANKING drafts correctly and spotting the likely-viral ones, so ranking and
top-k metrics come first; error metrics (MAE, R2) are secondary.
"""

import numpy as np
import pandas as pd
from scipy.stats import kendalltau, spearmanr
from sklearn.metrics import average_precision_score, r2_score, roc_auc_score

VIRAL = 75  # a post in its platform's top 25% counts as "viral"

GUIDE = """\
How to read the metrics (all computed on the TEST set: creators no model saw in training)

  Ranking - does the model put better posts higher?            (most important)
    Spearman      rank correlation with the true score. 0 = random, 1 = perfect.
                  [low, high] = 95% confidence interval from resampling creators.
    Kendall       like Spearman, stricter. Usually ~2/3 of Spearman.
    NDCG@10       quality of the model's top 10% picks, 1 = perfect. Compare with baseline_mean.

  Spotting viral posts (true top 25% of the platform)
    AUC           can it tell viral from non-viral? 0.5 = coin flip, 0.7 = useful, 0.8+ = strong.
    PR-AUC        precision/recall summary for viral posts. Random = 0.25.
    P@10          of its top 10% picks, share truly in the top 10%. Random = 0.10.
    Lift@25       how many times more often its top-25% picks are viral than chance. 1 = no skill.
    Top-bottom    true score of its top 25% picks minus its bottom 25%. 0 = no skill.

  Error (secondary: percentiles are hard to hit exactly)
    MAE skill     % less error than always guessing the average. 0% = no better.
    R2            share of variation explained. 0 = no better than the average.

  Practical
    Overfit       train Spearman minus test Spearman. Large = memorizing, not learning.
    Fit s         training time. ms/post = time to score ONE post (API latency).
"""


def _corr(fn, a, b) -> float:
    a, b = np.asarray(a, float), np.asarray(b, float)
    if len(a) < 3 or np.ptp(a) == 0 or np.ptp(b) == 0:  # ptp is exact; std can be ~1e-14 for constants
        return 0.0  # a constant prediction has no ranking ability
    r = fn(a, b).statistic
    return 0.0 if np.isnan(r) else float(r)


def spearman(y, pred) -> float:
    return _corr(spearmanr, y, pred)


def ndcg(y, pred, frac: float = 0.10) -> float:
    """Normalized discounted cumulative gain of the top `frac` of predictions (gain = true score)."""
    y, pred = np.asarray(y, float), np.asarray(pred, float)
    k = max(1, int(len(y) * frac))
    discounts = 1.0 / np.log2(np.arange(2, k + 2))
    dcg = (y[np.argsort(-pred, kind="stable")[:k]] * discounts).sum()
    idcg = (np.sort(y)[::-1][:k] * discounts).sum()
    return float(dcg / idcg) if idcg > 0 else 0.0


def decile_means(y, pred) -> list[float]:
    """True average score in each tenth of posts, from lowest to highest prediction."""
    ranks = pd.Series(np.asarray(pred, float)).rank(method="first")
    bins = pd.qcut(ranks, q=min(10, len(ranks)), labels=False)
    return pd.Series(np.asarray(y, float)).groupby(bins.to_numpy()).mean().round(2).tolist()


def evaluate(y, pred, baseline: float) -> dict:
    """Every metric for one model on one test set. `baseline` = training-set average score."""
    y, pred = np.asarray(y, float), np.asarray(pred, float)
    viral = y >= VIRAL
    has_both = 0 < viral.mean() < 1
    constant = np.ptp(pred) == 0
    q25, q75, q90 = np.percentile(pred, [25, 75, 90])
    top25, top10, bottom25 = pred >= q75, pred >= q90, pred <= q25

    mae = float(np.mean(np.abs(pred - y)))
    baseline_mae = float(np.mean(np.abs(baseline - y)))
    deciles = decile_means(y, pred)
    precision_top25 = float(viral[top25].mean())
    return {
        "spearman": spearman(y, pred),
        "kendall": _corr(kendalltau, y, pred),
        "ndcg_top10": ndcg(y, pred),
        "auc": float(roc_auc_score(viral, pred)) if has_both and not constant else 0.5,
        "pr_auc": float(average_precision_score(viral, pred)) if has_both else float("nan"),
        "viral_rate": float(viral.mean()),
        "precision_top10": float((y >= 90)[top10].mean()),
        "precision_top25": precision_top25,
        "lift_top25": precision_top25 / max(float(viral.mean()), 1e-9),
        "top_bottom_gap": float(y[top25].mean() - y[bottom25].mean()),
        "decile_monotonicity": _corr(spearmanr, np.arange(len(deciles)), deciles) if len(deciles) > 2 else 0.0,
        "mae": mae,
        "baseline_mae": baseline_mae,
        "mae_skill": 1 - mae / baseline_mae if baseline_mae > 0 else 0.0,
        "rmse": float(np.sqrt(np.mean((pred - y) ** 2))),
        "r2": float(r2_score(y, pred)),
        "decile_means": deciles,
    }


def within_creator_spearman(y, pred, groups, min_posts: int = 5) -> tuple[float, int]:
    """Average Spearman computed separately inside each creator's posts: can it rank ONE account's posts?"""
    df = pd.DataFrame({"y": np.asarray(y, float), "p": np.asarray(pred, float), "g": np.asarray(groups)})
    scores = [spearman(g["y"], g["p"]) for _, g in df.groupby("g") if len(g) >= min_posts]
    return (float(np.mean(scores)) if scores else float("nan")), len(scores)


def evaluate_relative(y, pred, groups) -> dict:
    """Metrics for the vs-your-average model. y, pred = log(post result / creator's typical result)."""
    y, pred = np.asarray(y, float), np.asarray(pred, float)
    above = y > 0
    within, n_creators = within_creator_spearman(y, pred, groups)
    mae = float(np.mean(np.abs(pred - y)))
    return {
        "within_creator_spearman": within,
        "within_creators": n_creators,
        "spearman": spearman(y, pred),
        "auc_beats_average": float(roc_auc_score(above, pred)) if 0 < above.mean() < 1 and np.ptp(pred) > 0 else 0.5,
        "direction_accuracy": float(np.mean((pred > 0) == above)),
        "share_above_average": float(above.mean()),
        "mae_log": mae,
        "baseline_mae_log": float(np.mean(np.abs(y - np.median(y)))),
        "r2": float(r2_score(y, pred)),
    }


def _creator_resamples(groups, n_boot: int, seed: int):
    """Yield row indices of bootstrap samples drawn by CREATOR (a creator's posts are correlated)."""
    codes, uniques = pd.factorize(pd.Series(groups))
    n = len(uniques)
    order = np.argsort(codes, kind="stable")
    counts = np.bincount(codes, minlength=n)
    starts = np.concatenate([[0], np.cumsum(counts)[:-1]])
    rng = np.random.default_rng(seed)
    for _ in range(n_boot):
        pick = rng.integers(0, n, n)
        lengths = counts[pick]
        out_starts = np.cumsum(lengths) - lengths
        yield order[np.repeat(starts[pick] - out_starts, lengths) + np.arange(lengths.sum())]


def bootstrap_ci(y, pred, groups, n_boot: int = 200, seed: int = 0, metric=spearman) -> tuple[float, float]:
    """95% confidence interval of `metric`, resampling whole creators."""
    if n_boot <= 0 or len(set(groups)) < 2:
        return float("nan"), float("nan")
    y, pred = np.asarray(y, float), np.asarray(pred, float)
    stats = [metric(y[i], pred[i]) for i in _creator_resamples(groups, n_boot, seed)]
    lo, hi = np.quantile(stats, [0.025, 0.975])
    return float(lo), float(hi)


def paired_difference(y, pred_a, pred_b, groups, n_boot: int = 200, seed: int = 0, metric=spearman):
    """95% CI of metric(a) - metric(b) on the SAME resamples. If it includes 0, a and b are tied."""
    if n_boot <= 0 or len(set(groups)) < 2:
        return float("nan"), float("nan")
    y, a, b = (np.asarray(v, float) for v in (y, pred_a, pred_b))
    diffs = [metric(y[i], a[i]) - metric(y[i], b[i]) for i in _creator_resamples(groups, n_boot, seed)]
    lo, hi = np.quantile(diffs, [0.025, 0.975])
    return float(lo), float(hi)
