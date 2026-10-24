"""Load a CSV of posts (Kaggle dataset or demo sample) into Snowflake POSTS.

Usage (from repo root):
    python -m data.loaders.load_csv data/samples/demo_posts.csv
    python -m data.loaders.load_csv path/to/kaggle_tiktok.csv --platform tiktok \
        --map "desc=caption,createTime=posted_at,playCount=views,diggCount=likes,commentCount=comments,shareCount=shares"

Downloaded datasets go in data/raw/ (git-ignored).
"""

import argparse
import uuid

import pandas as pd
from dotenv import load_dotenv

from api.services import snowflake

POSTS_COLUMNS = [
    "platform", "format", "external_id", "caption", "posted_at",
    "thumbnail_url", "views", "likes", "comments", "shares", "followers",
]


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--platform", help="Set platform for every row (if the CSV has no platform column)")
    parser.add_argument("--map", default="", help="Column renames: 'theirs=ours,theirs2=ours2'")
    args = parser.parse_args()

    df = pd.read_csv(args.path)
    if args.map:
        df = df.rename(columns=dict(pair.split("=") for pair in args.map.split(",")))
    if args.platform:
        df["platform"] = args.platform
    if "external_id" not in df.columns:
        df["external_id"] = [uuid.uuid4().hex for _ in range(len(df))]
    if "posted_at" in df.columns:
        posted = df["posted_at"]
        # Kaggle TikTok data often uses unix seconds
        df["posted_at"] = pd.to_datetime(posted, unit="s") if pd.api.types.is_numeric_dtype(posted) else pd.to_datetime(posted)

    df = df[[c for c in POSTS_COLUMNS if c in df.columns]]
    print(f"Loading {len(df)} rows into POSTS...")
    print(f"Done: {snowflake.insert_df(df, 'POSTS')} rows inserted.")


if __name__ == "__main__":
    main()
