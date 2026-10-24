"""Turns a post into model features.

Used by BOTH ml/train.py and api/ so a post is described to the model the same way
in training and in production. Change features here, then retrain.

Each platform has its own feature list (FEATURE_COLUMNS[platform]): every platform gets
the caption + timing features, plus the context fields only that platform's data has.
"""

import json
import math
import re
from datetime import datetime

import pandas as pd

PLATFORMS = ["tiktok", "youtube", "instagram", "linkedin"]

# Opt-in visual contract. Existing bundles keep their original feature lists.
THUMBNAIL_ENCODER = {"model": "ViT-B-32", "pretrained": "laion2b_s34b_b79k", "dimensions": 512, "version": 1}
THUMBNAIL_COLUMNS = [f"thumbnail_{i}" for i in range(THUMBNAIL_ENCODER["dimensions"])]


def thumbnail_features(embedding=None) -> dict:
    """The exact same normalized image-vector inputs in training and serving."""
    if embedding is None:
        return dict.fromkeys(THUMBNAIL_COLUMNS, float("nan"))
    values = list(embedding)
    if len(values) != len(THUMBNAIL_COLUMNS) or not all(math.isfinite(float(v)) for v in values):
        raise ValueError("Thumbnail embedding must contain 512 finite values")
    return dict(zip(THUMBNAIL_COLUMNS, map(float, values)))


def thumbnail_feature_frame(embeddings) -> pd.DataFrame:
    return pd.DataFrame([thumbnail_features(e) for e in embeddings], columns=THUMBNAIL_COLUMNS).astype("float32")

CAPTION_COLUMNS = [
    "caption_length",
    "word_count",
    "hashtag_count",
    "mention_count",
    "emoji_count",
    "has_question",
    "has_exclamation",
    "has_number",
    "has_link",
    "has_call_to_action",
    "uppercase_ratio",
]
TIME_COLUMNS = ["hour", "weekday", "is_weekend"]

YOUTUBE_CATEGORIES = [
    "Gaming", "Entertainment", "Music", "Sports", "People & Blogs", "Comedy", "Film & Animation",
    "News & Politics", "Science & Technology", "Howto & Style", "Education", "Autos & Vehicles",
]


def _slug(text: str) -> str:
    """'People & Blogs' -> 'people_blogs' (feature names must be plain for LightGBM/XGBoost)."""
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


# Context features per platform (must exist both in training data and in the API request)
PLATFORM_COLUMNS = {
    "tiktok": ["log_creator_typical_views", "duration_sec", "original_sound", "verified", "has_location"],
    "youtube": [
        "log_followers", "log_creator_typical_views", "log_days_since_published", "duration_sec", "is_short",
        "description_length",
    ] + [f"category_{_slug(c)}" for c in YOUTUBE_CATEGORIES],
    "instagram": ["log_followers", "log_following", "log_num_posts", "is_video", "is_business_account"],
    "linkedin": ["log_followers", "has_media"],
}

# LinkedIn data has no post dates, so no timing features there
FEATURE_COLUMNS = {
    p: CAPTION_COLUMNS + ([] if p == "linkedin" else TIME_COLUMNS) + PLATFORM_COLUMNS[p] for p in PLATFORMS
}

DRAFT_AGE_DAYS = 90

_EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
_CTA = re.compile(r"\b(comment|follow|share|save|tag|link in bio|subscribe|like if|let me know|dm)\b", re.I)


def _log(x) -> float:
    return math.log1p(float(x)) if x is not None and not pd.isna(x) else float("nan")


def caption_features(caption: str) -> dict:
    caption = caption or ""
    letters = [c for c in caption if c.isalpha()]
    return {
        "caption_length": len(caption),
        "word_count": len(caption.split()),
        "hashtag_count": caption.count("#"),
        "mention_count": caption.count("@"),
        "emoji_count": len(_EMOJI.findall(caption)),
        "has_question": int("?" in caption),
        "has_exclamation": int("!" in caption),
        "has_number": int(any(c.isdigit() for c in caption)),
        "has_link": int("http" in caption or "www." in caption),
        "has_call_to_action": int(bool(_CTA.search(caption))),
        "uppercase_ratio": sum(c.isupper() for c in letters) / len(letters) if letters else 0.0,
    }


def time_features(posted_at: datetime | None) -> dict:
    if posted_at is None or pd.isna(posted_at):
        return {"hour": float("nan"), "weekday": float("nan"), "is_weekend": float("nan")}
    return {"hour": posted_at.hour, "weekday": posted_at.weekday(), "is_weekend": int(posted_at.weekday() >= 5)}


def context_features(platform: str, post: dict) -> dict:
    """Platform-specific features. `post` holds the core columns plus the keys from `extra`."""
    get = post.get
    if platform == "tiktok":
        return {
            "log_creator_typical_views": _log(get("creator_typical_views")),  # NaN if the user didn't say
            "duration_sec": get("duration_sec"),
            "original_sound": int(bool(get("original_sound"))),
            "verified": int(bool(get("verified"))),
            "has_location": int(bool(get("has_location"))),
        }
    if platform == "youtube":
        category = get("category")
        duration = get("duration_sec")
        return {
            "log_followers": _log(get("followers")),  # subscribers
            "log_creator_typical_views": _log(get("creator_typical_views")),
            # Training videos are 30-730 days old; a draft is scored as "views after ~3 months"
            "log_days_since_published": _log(get("days_since_published") or DRAFT_AGE_DAYS),
            "duration_sec": duration,
            "is_short": float("nan") if duration is None or pd.isna(duration) else int(duration <= 180),
            "description_length": get("description_length"),
            **{f"category_{_slug(c)}": int(category == c) for c in YOUTUBE_CATEGORIES},
        }
    if platform == "instagram":
        return {
            "log_followers": _log(get("followers")),
            "log_following": _log(get("following")),
            "log_num_posts": _log(get("num_posts")),
            "is_video": int(get("format") == "video"),
            "is_business_account": int(bool(get("is_business_account"))),
        }
    if platform == "linkedin":
        return {"log_followers": _log(get("followers")), "has_media": int(get("format") not in (None, "text"))}
    raise ValueError(f"unknown platform {platform}")


def build_features(platform: str, post: dict) -> dict:
    """Features for one post, e.g. a draft from the API.

    `post` keys: caption, posted_at, plus any context fields (followers, duration_sec, format, ...).
    Missing context becomes NaN, which XGBoost handles.
    """
    row = {
        **caption_features(post.get("caption", "")),
        **time_features(post.get("posted_at")),
        **context_features(platform, post),
    }
    return {c: row[c] for c in FEATURE_COLUMNS[platform]}


def build_feature_frame(platform: str, posts: pd.DataFrame) -> pd.DataFrame:
    """Features for many posts in data/processed format (core columns + `extra` JSON)."""
    rows = []
    for post in posts.to_dict("records"):
        extra = json.loads(post.pop("extra") or "{}") if "extra" in post else {}
        rows.append(build_features(platform, {**extra, **post}))
    return pd.DataFrame(rows, columns=FEATURE_COLUMNS[platform]).astype(float)
