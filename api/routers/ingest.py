"""Import CSV exports or public YouTube channel history into Snowflake."""

import os

import pandas as pd
from fastapi import APIRouter, Form, UploadFile
from starlette.concurrency import run_in_threadpool

from api.schemas import IngestResponse, IngestYouTubeRequest, Platform, UserId
from api.services import cortex, snowflake, youtube
from api.services.errors import ConfigurationError, ServiceError
from api.services.posts import MAX_CSV_BYTES, PostBatch, normalize_posts, read_csv

router = APIRouter(prefix="/ingest", tags=["ingest"])


def save_batch(user_id: str, batch: PostBatch, source: str, account: dict | None = None) -> IngestResponse:
    result = IngestResponse(**snowflake.upsert_posts(user_id, batch, source, account))
    if result.posts_loaded and os.getenv("CORTEX_ENRICH_ON_INGEST", "true").lower() == "true":
        try:
            limit = min(max(int(os.getenv("CORTEX_MAX_POSTS_PER_IMPORT") or 25), 1), 100)
            result.enriched_posts = cortex.enrich_posts(user_id, limit)
        except (ServiceError, ValueError):
            result.warnings.append("Posts were saved, but Cortex enrichment is pending. Check Cortex privileges/region and retry POST /data/enrich")
    return result


@router.post("/youtube", response_model=IngestResponse)
def ingest_youtube(req: IngestYouTubeRequest) -> IngestResponse:
    # Report missing storage config before consuming YouTube quota.
    if snowflake.missing_settings():
        raise ConfigurationError("Configure Snowflake in .env and run python -m data.setup before importing posts")
    channel = youtube.fetch_channel(req.channel_id, req.max_videos)
    batch = normalize_posts(channel.posts, req.user_id, "youtube") if channel.posts else PostBatch(pd.DataFrame())
    return save_batch(req.user_id, batch, "youtube_api", channel.account)


@router.post("/csv", response_model=IngestResponse)
async def ingest_csv(user_id: UserId = Form(...), platform: Platform | None = Form(None),
                     file: UploadFile = ...) -> IngestResponse:
    content = await file.read(MAX_CSV_BYTES + 1)
    def process():
        return save_batch(user_id, read_csv(content, user_id, platform), "platform_csv")
    return await run_in_threadpool(process)
