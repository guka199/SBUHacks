"""Cross-platform comparison for the dashboard page."""

from fastapi import APIRouter

from api.schemas import DashboardResponse, PlatformStats
from api.services import snowflake

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/{user_id}", response_model=DashboardResponse)
def get_dashboard(user_id: str) -> DashboardResponse:
    df = snowflake.query_df(
        """
        SELECT platform,
               COUNT(*)                                                         AS posts,
               AVG((likes + comments + shares) / NULLIF(COALESCE(NULLIF(views, 0), followers), 0)) AS avg_engagement_rate,
               SUM(views)                                                       AS total_views
        FROM POSTS
        WHERE user_id = %s
        GROUP BY platform
        ORDER BY platform
        """,
        (user_id,),
    )
    platforms = [
        PlatformStats(
            platform=r["platform"],
            posts=int(r["posts"]),
            avg_engagement_rate=float(r["avg_engagement_rate"] or 0),
            total_views=int(r["total_views"] or 0),
        )
        for r in df.to_dict("records")
    ]
    return DashboardResponse(user_id=user_id, platforms=platforms)
