"""Turns a post into model features.

Used by BOTH ml/train.py and api/ so a post is described to the model the same way
in training and in production. Change features here, then retrain.
"""

import re
from datetime import datetime

import pandas as pd

PLATFORMS = ["youtube", "tiktok", "instagram", "linkedin"]

# Order matters: the model expects columns in exactly this order.
FEATURE_COLUMNS = [
    "caption_length",
    "word_count",
    "hashtag_count",
    "mention_count",
    "emoji_count",
    "has_question",
    "has_number",
    "hour",
    "weekday",
    "is_weekend",
    "sentiment",
]

_EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")


def engagement_rate(likes: int, comments: int, shares: int, views: int, followers: int | None) -> float:
    """Target variable: interactions per view (falls back to per follower)."""
    denom = views or followers or 0
    if denom <= 0:
        return 0.0
    return (likes + comments + shares) / denom


def build_features(
    caption: str,
    posted_at: datetime | None = None,
    sentiment: float | None = None,
) -> dict:
    """Features for one post. `sentiment` comes from Snowflake Cortex SENTIMENT (-1..1)."""
    caption = caption or ""
    posted_at = posted_at or datetime.now()
    return {
        "caption_length": len(caption),
        "word_count": len(caption.split()),
        "hashtag_count": caption.count("#"),
        "mention_count": caption.count("@"),
        "emoji_count": len(_EMOJI.findall(caption)),
        "has_question": int("?" in caption),
        "has_number": int(any(c.isdigit() for c in caption)),
        "hour": posted_at.hour,
        "weekday": posted_at.weekday(),
        "is_weekend": int(posted_at.weekday() >= 5),
        "sentiment": sentiment if sentiment is not None else 0.0,
    }


def build_feature_frame(posts: pd.DataFrame) -> pd.DataFrame:
    """Features for many posts. Expects columns: caption, posted_at, and optionally sentiment."""
    rows = [
        build_features(
            caption=row.get("caption", ""),
            posted_at=pd.to_datetime(row.get("posted_at")).to_pydatetime() if pd.notna(row.get("posted_at")) else None,
            sentiment=row.get("sentiment"),
        )
        for row in posts.to_dict("records")
    ]
    return pd.DataFrame(rows, columns=FEATURE_COLUMNS)
