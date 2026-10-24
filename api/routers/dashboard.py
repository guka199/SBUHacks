"""Dashboard data and explicit, on-demand Snowflake Cortex insights."""

from fastapi import APIRouter, Query

from api.schemas import DashboardResponse, InsightsResponse, PredictionHistory, UserId
from api.services import analytics, cortex, snowflake

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/{user_id}", response_model=DashboardResponse)
def get_dashboard(user_id: UserId, days: int | None = Query(default=None, ge=1, le=730)) -> DashboardResponse:
    return analytics.dashboard(user_id, days)


@router.post("/{user_id}/insights", response_model=InsightsResponse)
def dashboard_insights(user_id: UserId, days: int = Query(default=30, ge=1, le=730)) -> InsightsResponse:
    return cortex.insights(analytics.dashboard(user_id, days))


@router.get("/{user_id}/predictions", response_model=PredictionHistory)
def prediction_history(user_id: UserId, limit: int = Query(default=20, ge=1, le=100)) -> PredictionHistory:
    frame = snowflake.query_df("""SELECT id,request_id,platform,caption,score,model_score,
        content_score,provider,created_at FROM PREDICTIONS WHERE user_id=%s
        ORDER BY created_at DESC,id LIMIT %s""", (user_id, limit))
    return PredictionHistory(predictions=frame.astype(object).where(frame.notna(), None).to_dict("records"))
