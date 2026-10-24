"""Show how well the models the API serves are doing (from models/metrics_<platform>.json; no retraining).

Usage (from repo root):
    python -m ml.evaluate
For the comparison of ALL model types, open models/benchmark/report.md (made by python -m ml.benchmark).
"""

import json

from ml.data import MODELS_DIR
from ml.metrics import GUIDE
from shared.features import PLATFORMS


def main() -> None:
    print(GUIDE)
    for platform in PLATFORMS:
        path = MODELS_DIR / f"metrics_{platform}.json"
        if not path.exists():
            print(f"[{platform}] no model yet - run: python -m ml.train {platform}")
            continue
        s = json.loads(path.read_text())
        if "model" not in s:
            print(f"[{platform}] metrics are from an older format - retrain: python -m ml.train {platform}")
            continue
        print(f"\n=== {platform.upper()} - {s['model']} ({s['rows']['train']:,} train / {s['rows']['test']:,} test posts)")
        print(f"  Ranking   Spearman {s['spearman']:.3f} [{s['spearman_low']:.3f}, {s['spearman_high']:.3f}]   "
              f"Kendall {s['kendall']:.3f}   NDCG@10 {s['ndcg_top10']:.3f}")
        print(f"  Viral     AUC {s['auc']:.3f}   PR-AUC {s['pr_auc']:.3f} (random {s['viral_rate']:.2f})   "
              f"P@10 {s['precision_top10']:.2f}   Lift@25 {s['lift_top25']:.2f}   top-bottom {s['top_bottom_gap']:.1f}")
        print(f"  Error     MAE {s['mae']:.1f} (baseline {s['baseline_mae']:.1f}, skill {s['mae_skill'] * 100:.1f}%)   "
              f"R2 {s['r2']:.3f}   overfit {s['overfit_gap']:.3f}")
        print("  True avg score by predicted decile (low -> high): " + " ".join(f"{v:.0f}" for v in s["decile_means"]))


if __name__ == "__main__":
    main()
