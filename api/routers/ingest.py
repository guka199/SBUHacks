"""Bring a user's posts into Snowflake: YouTube API or an uploaded platform CSV export."""

import io

import pandas as pd
from fastapi import APIRouter, Form, UploadFile

from api.schemas import IngestResponse, IngestYouTubeRequest
from api.services import snowflake, youtube

router = APIRouter(prefix="/ingest", tags=["ingest"])

# Map each platform's export column names to our POSTS columns.
# Fill these in once you've downloaded a real export from each platform.
CSV_COLUMN_MAPS: dict[str, dict[str, str]] = {
    "tiktok": {
        "Video title": "caption",
        "Post time": "posted_at",
        "Total views": "views",
        "Total likes": "likes",
        "Total comments": "comments",
        "Total shares": "shares",
    },
    "instagram": {
        "Description": "caption",
        "Publish time": "posted_at",
        "Views": "views",
        "Likes": "likes",
        "Comments": "comments",
        "Shares": "shares",
    },
    "linkedin": {
        "Post title": "caption",
        "Created date": "posted_at",
        "Impressions": "views",
        "Reactions": "likes",
        "Comments": "comments",
        "Reposts": "shares",
    },
}


def _save(user_id: str, posts: pd.DataFrame) -> int:
    posts = posts.copy()
    posts["user_id"] = user_id
    return snowflake.insert_df(posts, "POSTS")


@router.post("/youtube", response_model=IngestResponse)
def ingest_youtube(req: IngestYouTubeRequest) -> IngestResponse:
    posts = pd.DataFrame(youtube.fetch_channel_videos(req.channel_id, req.max_videos))
    return IngestResponse(posts_loaded=_save(req.user_id, posts))


@router.post("/csv", response_model=IngestResponse)
async def ingest_csv(user_id: str = Form(...), platform: str = Form(...), file: UploadFile = ...) -> IngestResponse:
    raw = pd.read_csv(io.BytesIO(await file.read()))
    posts = raw.rename(columns=CSV_COLUMN_MAPS.get(platform, {}))
    keep = ["caption", "posted_at", "views", "likes", "comments", "shares"]
    posts = posts[[c for c in keep if c in posts.columns]]
    posts["platform"] = platform
    return IngestResponse(posts_loaded=_save(user_id, posts))
