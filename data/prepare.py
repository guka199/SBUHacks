"""Clean the raw datasets into one shared format with a virality label.

Reads data/raw/<platform>/..., writes data/processed/<platform>.parquet (both git-ignored).

Usage (from repo root):
    python -m data.prepare                 # all platforms
    python -m data.prepare tiktok youtube  # just these

Every output has the same core columns (CORE_COLUMNS). Platform-only fields go into
`extra` (a JSON string), which maps to the VARIANT column in Snowflake.

Virality label, per platform:
  - tiktok: the post's own reach, relative = log(1 + views). The creator's typical views (from their OTHER
      posts) is an INPUT (extra.creator_typical_views), hidden on 20% of rows so the model also handles
      users who don't tell us. Creators with >= 3 posts only.
  - youtube (YouTube Data API data, data/raw/youtube_api): the video's own reach, relative = log(1 + views).
      Inputs include subscribers and the channel's typical views (each hidden on 20% of rows) and the
      video's age (30-730 days; drafts are scored at 90 days). Falls back to the Kaggle trending data
      (creator-relative label) if no API data was collected.
  - youtube (Kaggle trending fallback): how a post did vs. the SAME creator's other posts
      relative = log(1 + views) - mean(log(1 + views) of the creator's OTHER posts)
      Only creators with >= 3 posts are kept, so the comparison means something.
  - instagram, linkedin: engagement rate = (likes + comments [+ shares]) / followers
  virality_score = percentile of `relative` within the platform, 0-100.

Second label, every platform: account_relative = log(this post's result / the creator's typical result on their
OTHER posts) - views for TikTok/YouTube, likes + comments for Instagram/LinkedIn. 0 = exactly the creator's usual,
+0.69 = 2x, -0.69 = half. NaN for creators with < 3 posts. Used by `python -m ml.train --target relative`.
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
    "shares", "followers", "relative", "virality_score", "account_relative", "extra",
]

MIN_POSTS_PER_CREATOR = 3
MIN_FOLLOWERS = 100
BASELINE_MASK_RATE = 0.2  # share of rows with an account-level input hidden (TikTok + YouTube API)
YOUTUBE_MIN_AGE_DAYS, YOUTUBE_MAX_AGE_DAYS = 30, 730  # younger videos are still gaining views


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


def _account_relative(df: pd.DataFrame, result: pd.Series) -> pd.Series:
    """log(result) minus the mean log(result) of the same creator's OTHER posts (NaN if < 3 posts)."""
    log_result = np.log(result.astype(float).clip(lower=1))
    group = log_result.groupby(df["creator_id"])
    n = group.transform("size")
    others_mean = (group.transform("sum") - log_result) / (n - 1)
    return (log_result - others_mean).where(n >= MIN_POSTS_PER_CREATOR)


def _with_creator_baseline(df: pd.DataFrame) -> pd.DataFrame:
    """Keep creators with enough posts; add each creator's typical views from their OTHER posts.

    The label is the post's own reach (log views). Typical views = geometric mean of the creator's
    other posts (leave-one-out), so a post never sees its own views.
    """
    counts = df.groupby("creator_id")["views"].transform("size")
    df = df[counts >= MIN_POSTS_PER_CREATOR].copy()
    log_views = np.log1p(df["views"].astype(float))
    group = log_views.groupby(df["creator_id"])
    others_mean = (group.transform("sum") - log_views) / (group.transform("size") - 1)
    df["creator_typical_views"] = np.expm1(others_mean).round()
    df["relative"] = log_views
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
    df = _with_creator_baseline(df)
    df["account_relative"] = _account_relative(df, df["views"] + 1)
    hidden = np.random.default_rng(0).random(len(df)) < BASELINE_MASK_RATE
    typical = df["creator_typical_views"].mask(hidden)
    df["extra"] = [
        json.dumps({**json.loads(e), "creator_typical_views": None if pd.isna(t) else int(t)})
        for e, t in zip(df["extra"], typical)
    ]
    return _finish(df)


def _youtube_categories() -> dict[int, str]:
    categories = json.loads((RAW / "youtube" / "US_category_id.json").read_text())
    return {int(c["id"]): c["snippet"]["title"] for c in categories["items"]}


def prepare_youtube() -> pd.DataFrame:
    parts = sorted((RAW / "youtube_api").glob("part_*.parquet"))
    return _prepare_youtube_api(parts) if parts else _prepare_youtube_trending()


def _prepare_youtube_api(parts: list[Path]) -> pd.DataFrame:
    raw = pd.concat([pd.read_parquet(p) for p in parts], ignore_index=True).drop_duplicates("video_id")
    published = pd.to_datetime(raw["published_at"], utc=True)
    age_days = (pd.to_datetime(raw["collected_at"], utc=True) - published).dt.total_seconds() / 86400
    raw = raw.assign(age_days=age_days, published=published.dt.tz_localize(None))
    raw = raw[raw["age_days"].between(YOUTUBE_MIN_AGE_DAYS, YOUTUBE_MAX_AGE_DAYS) & (raw["views"] > 0)]

    df = pd.DataFrame({
        "platform": "youtube",
        "external_id": raw["video_id"],
        "creator_id": raw["channel_id"],
        "caption": raw["title"].fillna(""),
        "posted_at": raw["published"],
        "format": (raw["duration_sec"] <= 180).map({True: "short", False: "video"}),
        "thumbnail_url": raw["thumbnail_url"],
        "duration_sec": raw["duration_sec"],
        "hashtags": raw["tags"].fillna("").map(lambda s: len(s.split("|")) if s else 0),
        "views": raw["views"],
        "likes": raw["likes"],
        "comments": raw["comments"],
        "shares": None,
        "followers": raw["subscribers"],
    })
    df = _with_creator_baseline(df)
    df["account_relative"] = _account_relative(df, df["views"] + 1)
    rng = np.random.default_rng(1)
    df.loc[rng.random(len(df)) < BASELINE_MASK_RATE, "followers"] = None
    typical = df["creator_typical_views"].mask(rng.random(len(df)) < BASELINE_MASK_RATE)

    raw = raw.loc[df.index].assign(
        category=pd.to_numeric(raw["category_id"], errors="coerce").map(_youtube_categories()),
        days_since_published=raw["age_days"].round(1),
        creator_typical_views=typical,
    )
    df["extra"] = _to_extra(raw, ["category", "description_length", "days_since_published", "creator_typical_views",
                                  "has_captions", "definition", "channel_video_count", "made_for_kids"])
    return _finish(df)


def _prepare_youtube_trending() -> pd.DataFrame:
    raw = pd.read_csv(RAW / "youtube" / "US_youtube_trending_data.csv")
    # One row per day a video trended -> keep its latest (highest) stats
    raw = raw.sort_values("view_count").drop_duplicates("video_id", keep="last")
    raw = raw[raw["view_count"] > 0]  # 0 = stats hidden

    cat_names = _youtube_categories()

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
    df = _creator_relative(df)
    df["account_relative"] = df["relative"]
    return _finish(df)


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
    df["account_relative"] = _account_relative(df, df["likes"] + df["comments"] + 1)
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
    df["account_relative"] = _account_relative(df, df["likes"] + df["comments"] + 1)
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
