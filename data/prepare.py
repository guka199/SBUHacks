"""Clean the raw datasets into one shared format with a virality label.

Reads data/raw/<platform>/..., writes data/processed/<platform>.parquet (both git-ignored).

Usage (from repo root):
    python -m data.prepare                 # all platforms
    python -m data.prepare tiktok youtube  # just these

Every output has the same core columns (CORE_COLUMNS). Platform-only fields go into
`extra` (a JSON string), which maps to the VARIANT column in Snowflake.

Virality label, per platform:
  - tiktok, youtube: how a post did vs. the SAME creator's other posts
      relative = log(1 + views) - mean(log(1 + views) of the creator's OTHER posts)
      Only creators with >= 3 posts are kept, so the comparison means something.
  - instagram, linkedin: engagement rate = (likes + comments [+ shares]) / followers
  virality_score = percentile of `relative` within the platform, 0-100.
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

RAW = Path(__file__).resolve().parent / "raw"
OUT = Path(__file__).resolve().parent / "processed"

CORE_COLUMNS = [
    "platform", "external_id", "creator_id", "caption", "posted_at", "format",
    "thumbnail_url", "duration_sec", "hashtags", "views", "likes", "comments",
    "shares", "followers", "relative", "virality_score", "extra",
]

MIN_POSTS_PER_CREATOR = 3
MIN_FOLLOWERS = 100


def _to_extra(df: pd.DataFrame, cols: list[str]) -> pd.Series:
    """Pack platform-only columns into one JSON string per row."""
    records = df[cols].astype(object).where(df[cols].notna(), None).to_dict("records")
    return pd.Series([json.dumps(r, default=str) for r in records], index=df.index)


def _creator_relative(df: pd.DataFrame) -> pd.DataFrame:
    """Keep creators with enough posts; compare each post with the creator's OTHER posts."""
    counts = df.groupby("creator_id")["views"].transform("size")
    df = df[counts >= MIN_POSTS_PER_CREATOR].copy()
    log_views = np.log1p(df["views"].astype(float))
    group = log_views.groupby(df["creator_id"])
    n = group.transform("size")
    others_mean = (group.transform("sum") - log_views) / (n - 1)  # leave-one-out
    df["relative"] = log_views - others_mean
    return df


def _finish(df: pd.DataFrame) -> pd.DataFrame:
    df = df.replace([np.inf, -np.inf], np.nan).dropna(subset=["relative"])
    df["virality_score"] = (df["relative"].rank(pct=True) * 100).round(2)
    for c in CORE_COLUMNS:
        if c not in df.columns:
            df[c] = None
    return df[CORE_COLUMNS].reset_index(drop=True)


def prepare_tiktok() -> pd.DataFrame:
    frames = [pd.read_parquet(p) for p in sorted((RAW / "tiktok").glob("*.parquet"))]
    raw = pd.concat(frames, ignore_index=True).drop_duplicates("id")
    raw = raw[(raw["is_ad"] != "t") & (raw["play_count"] > 0)]

    df = pd.DataFrame({
        "platform": "tiktok",
        "external_id": raw["id"].astype(str),
        "creator_id": raw["user_id"].astype(str),
        "caption": raw["desc"].fillna(""),
        "posted_at": pd.to_datetime(raw["create_time"], unit="s"),
        "format": "short",
        "thumbnail_url": None,  # TikTok cover links in this dataset have expired
        "duration_sec": raw["duration"],
        "hashtags": raw["challenges"].fillna("[]").map(lambda s: len(json.loads(s)) if s.startswith("[") else 0),
        "views": raw["play_count"],
        "likes": raw["digg_count"],
        "comments": raw["comment_count"],
        "shares": raw["share_count"],
        "followers": None,  # not in the dataset
    })
    raw = raw.assign(
        verified=raw["user_verified"] == "t",
        original_sound=raw["music_original"] == "t",
        has_location=raw["poi_id"].notna(),
    )
    df["extra"] = _to_extra(raw, ["music_id", "music_title", "original_sound", "verified", "has_location",
                                  "collect_count", "vq_score"])
    return _finish(_creator_relative(df))


def prepare_youtube() -> pd.DataFrame:
    raw = pd.read_csv(RAW / "youtube" / "US_youtube_trending_data.csv")
    # One row per day a video trended -> keep its latest (highest) stats
    raw = raw.sort_values("view_count").drop_duplicates("video_id", keep="last")
    raw = raw[raw["view_count"] > 0]  # 0 = stats hidden

    categories = json.loads((RAW / "youtube" / "US_category_id.json").read_text())
    cat_names = {int(c["id"]): c["snippet"]["title"] for c in categories["items"]}

    df = pd.DataFrame({
        "platform": "youtube",
        "external_id": raw["video_id"],
        "creator_id": raw["channelId"],
        "caption": raw["title"].fillna(""),
        "posted_at": pd.to_datetime(raw["publishedAt"], utc=True).dt.tz_localize(None),
        "format": "video",
        # Swap the tiny default.jpg for the 480x360 version (better for CLIP)
        "thumbnail_url": raw["thumbnail_link"].str.replace("default.jpg", "hqdefault.jpg", regex=False),
        "hashtags": raw["tags"].fillna("").map(lambda s: 0 if s in ("", "[None]") else len(s.split("|"))),
        "views": raw["view_count"],
        "likes": raw["likes"],
        "comments": raw["comment_count"],
        "shares": None,
    })
    raw = raw.assign(category=raw["categoryId"].map(cat_names), description_length=raw["description"].fillna("").str.len())
    df["extra"] = _to_extra(raw, ["category", "description_length", "comments_disabled"])
    return _finish(_creator_relative(df))


def prepare_instagram() -> pd.DataFrame:
    raw = pd.read_parquet(RAW / "instagram" / "main_instagram.parquet")
    # Tiny accounts make engagement rate meaningless (6 followers, 109 likes)
    raw = raw[raw["followers"] >= MIN_FOLLOWERS].drop_duplicates("shortcode")

    df = pd.DataFrame({
        "platform": "instagram",
        "external_id": raw["shortcode"],
        "creator_id": raw["profile_id"].astype(str),
        "caption": raw["description"].fillna(""),
        "posted_at": pd.to_datetime(raw["date"]),
        "format": raw["post_type"].map({1: "image", 2: "video"}).fillna("other"),
        "hashtags": raw["description"].fillna("").str.count("#"),
        "views": None,
        "likes": raw["likes"],
        "comments": raw["comments"],
        "shares": None,
        "followers": raw["followers"],
    })
    df["relative"] = (df["likes"] + df["comments"]) / df["followers"]
    df["extra"] = _to_extra(raw, ["is_business_account", "following", "num_posts", "lang",
                                  "description_category", "description_grade", "image_grade"])
    return _finish(df)


def prepare_linkedin() -> pd.DataFrame:
    raw = pd.read_csv(RAW / "linkedin" / "influencers_data.csv", low_memory=False)
    raw = raw[(raw["followers"] > 0) & raw["content"].notna()]

    df = pd.DataFrame({
        "platform": "linkedin",
        "external_id": raw["Unnamed: 0"].astype(str),
        "creator_id": raw["name"],
        "caption": raw["content"],
        "posted_at": None,  # dataset only has relative times like "1 week ago"
        "format": raw["media_type"].fillna("text"),
        "hashtags": raw["num_hashtags"],
        "views": raw["views"],
        "likes": raw["reactions"],
        "comments": raw["comments"],
        "shares": None,
        "followers": raw["followers"],
    })
    df["relative"] = (df["likes"] + df["comments"]) / df["followers"]
    df["extra"] = _to_extra(raw, ["headline", "time_spent"])
    return _finish(df)


PREPARERS = {
    "tiktok": prepare_tiktok,
    "youtube": prepare_youtube,
    "instagram": prepare_instagram,
    "linkedin": prepare_linkedin,
}


def main() -> None:
    platforms = sys.argv[1:] or list(PREPARERS)
    OUT.mkdir(exist_ok=True)
    for platform in platforms:
        print(f"[{platform}] preparing...")
        df = PREPARERS[platform]()
        path = OUT / f"{platform}.parquet"
        df.to_parquet(path, index=False)
        print(f"[{platform}] {len(df):,} posts, {df['creator_id'].nunique():,} creators -> {path.relative_to(OUT.parent.parent)}")


if __name__ == "__main__":
    main()
