"""Train one engagement model per platform and save it to models/.

Usage (from repo root):
    python -m ml.train                       # pulls TRAINING_DATA from Snowflake
    python -m ml.train --csv data/samples/demo_posts.csv   # offline, no Snowflake needed
"""

import argparse
from pathlib import Path

import pandas as pd
import xgboost as xgb
from dotenv import load_dotenv
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split

from shared.features import build_feature_frame, engagement_rate

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
MIN_ROWS = 50  # below this, a platform's model is too unreliable to save


def load_data(csv: str | None) -> pd.DataFrame:
    if csv:
        df = pd.read_csv(csv)
        df["engagement_rate"] = [
            engagement_rate(r.likes, r.comments, r.shares, r.views, r.followers) for r in df.itertuples()
        ]
        return df
    from api.services import snowflake

    return snowflake.query_df("SELECT * FROM TRAINING_DATA")


def train_platform(df: pd.DataFrame, platform: str) -> None:
    X = build_feature_frame(df)
    y = df["engagement_rate"].astype(float).values

    if len(df) < MIN_ROWS:
        print(f"[{platform}] only {len(df)} rows - training on all of it, no evaluation. Get more data!")
        X_train, y_train, X_test, y_test = X, y, None, None
    else:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = xgb.XGBRegressor(n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.8)
    model.fit(X_train, y_train)

    if X_test is not None:
        mae = mean_absolute_error(y_test, model.predict(X_test))
        baseline = mean_absolute_error(y_test, [y_train.mean()] * len(y_test))
        print(f"[{platform}] MAE {mae:.4f} vs baseline {baseline:.4f} ({len(df)} rows)")

    MODELS_DIR.mkdir(exist_ok=True)
    out = MODELS_DIR / f"engagement_{platform}.json"
    model.save_model(out)
    print(f"[{platform}] saved {out.relative_to(MODELS_DIR.parent)}")


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", help="Train from a local CSV instead of Snowflake")
    args = parser.parse_args()

    df = load_data(args.csv)
    for platform, group in df.groupby("platform"):
        train_platform(group.reset_index(drop=True), platform)


if __name__ == "__main__":
    main()
