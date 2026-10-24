"""Data service readiness and explicit Cortex operations."""

import os

from fastapi import APIRouter

from api.schemas import EnrichRequest, EnrichResponse, SimilarPostsRequest, SimilarPostsResponse, UserId
from api.services import cortex, snowflake

router = APIRouter(prefix="/data", tags=["data"])


@router.get("/status")
def status(check_connection: bool = False) -> dict:
    result = {
        "snowflake_configured": snowflake.is_configured(),
        "youtube_configured": bool(os.getenv("YOUTUBE_API_KEY")),
        "missing_settings": snowflake.missing_settings() + ([] if os.getenv("YOUTUBE_API_KEY") else ["YOUTUBE_API_KEY"]),
        "connection_checked": False,
    }
    if check_connection:
        snowflake.query_df("SELECT 1 AS ready FROM POSTS LIMIT 0")
        result["connection_checked"] = True
    return result


@router.post("/enrich", response_model=EnrichResponse)
def enrich(req: EnrichRequest) -> EnrichResponse:
    return EnrichResponse(enriched_posts=cortex.enrich_posts(req.user_id, req.limit))


@router.post("/{user_id}/similar", response_model=SimilarPostsResponse)
def similar(user_id: UserId, req: SimilarPostsRequest) -> SimilarPostsResponse:
    return cortex.similar_posts(user_id, req)
