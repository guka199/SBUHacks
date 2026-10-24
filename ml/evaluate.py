"""Check saved models: error on held-out data and which features matter most.

Usage (from repo root):
    python -m ml.evaluate --csv data/samples/demo_posts.csv
"""

import argparse

import pandas as pd
import xgboost as xgb
from dotenv import load_dotenv
from sklearn.metrics import mean_absolute_error

from ml.train import MODELS_DIR, load_data
from shared.features import FEATURE_COLUMNS, build_feature_frame


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv")
    args = parser.parse_args()

    df = load_data(args.csv)
    for platform, group in df.groupby("platform"):
        path = MODELS_DIR / f"engagement_{platform}.json"
        if not path.exists():
            print(f"[{platform}] no model - run python -m ml.train first")
            continue
        model = xgb.XGBRegressor()
        model.load_model(path)
        X = build_feature_frame(group)
        mae = mean_absolute_error(group["engagement_rate"], model.predict(X))
        importance = pd.Series(model.feature_importances_, index=FEATURE_COLUMNS).sort_values(ascending=False)
        print(f"\n[{platform}] MAE {mae:.4f} on {len(group)} rows. Top features:")
        print(importance.head(5).to_string())


if __name__ == "__main__":
    main()
