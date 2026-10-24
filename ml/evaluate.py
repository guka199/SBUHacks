"""Print the test-set metrics saved by ml/train.py for each platform.

Usage (from repo root):
    python -m ml.evaluate
"""

import json

from ml.train import MODELS_DIR
from shared.features import PLATFORMS


def main() -> None:
    for platform in PLATFORMS:
        path = MODELS_DIR / f"metrics_{platform}.json"
        if not path.exists():
            print(f"[{platform}] no model - run python -m ml.train {platform}")
            continue
        m = json.loads(path.read_text())
        print(f"\n[{platform}] {m['rows']['test']:,} test posts (creators unseen in training)")
        print(f"  MAE {m['mae']:.1f} vs baseline {m['baseline_mae']:.1f}   (lower is better)")
        print(f"  Spearman {m['spearman']:.3f}   (0 = no signal, 1 = perfect ranking)")
        print(f"  Top-25% precision {m['precision_at_top_quarter']:.2f}   (random = 0.25)")
        print("  Top features: " + ", ".join(f"{k} ({v})" for k, v in m["top_features"].items()))


if __name__ == "__main__":
    main()
