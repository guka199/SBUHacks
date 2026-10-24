"""Request/response shapes shared with the frontend (mirror these in web/lib/api.ts)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

Platform = Literal["youtube", "tiktok", "instagram", "linkedin"]


class Post(BaseModel):
    platform: Platform
    format: str | None = None  # e.g. "short", "video", "reel", "image", "text"
    caption: str = ""
    posted_at: datetime | None = None
    thumbnail_url: str | None = None
    views: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0
    followers: int | None = None


class IngestYouTubeRequest(BaseModel):
    user_id: str
    channel_id: str
    max_videos: int = 50


class IngestResponse(BaseModel):
    posts_loaded: int


class PlatformStats(BaseModel):
    platform: Platform
    posts: int
    avg_engagement_rate: float
    total_views: int


class DashboardResponse(BaseModel):
    user_id: str
    platforms: list[PlatformStats]


class PredictRequest(BaseModel):
    user_id: str | None = None
    caption: str
    platforms: list[Platform] = ["youtube", "tiktok", "instagram"]
    format: str | None = None
    planned_time: datetime | None = None
    thumbnail_url: str | None = None
    # Optional context about the draft / account (improves the score when known)
    followers: int | None = None
    following: int | None = None
    num_posts: int | None = None
    duration_sec: float | None = None
    original_sound: bool | None = None
    verified: bool | None = None
    is_business_account: bool | None = None
    category: str | None = None  # YouTube category, e.g. "Gaming"
    description_length: int | None = None


class Factor(BaseModel):
    feature: str
    impact: float  # SHAP value; negative = hurts the score


class PlatformScore(BaseModel):
    platform: Platform
    score: float  # 0-100 virality percentile within the platform
    top_factors: list[Factor]


class PredictResponse(BaseModel):
    scores: list[PlatformScore]
    suggestions: list[str]


class ContentScore(BaseModel):
    platform: Platform
    score: float  # Gemini's content score, same 0-100 scale
    reason: str


class ContentAnalysis(BaseModel):
    summary: str
    hook: int
    visual_quality: int
    clarity: int
    trend_fit: int
    platform_scores: list[ContentScore]
    strengths: list[str]


class CombinedScore(BaseModel):
    platform: Platform
    score: float  # combined: model_weight * model_score + (1 - model_weight) * content_score
    model_score: float
    content_score: float | None  # None when Gemini wasn't used
    top_factors: list[Factor]


class ScoreResponse(BaseModel):
    scores: list[CombinedScore]
    suggestions: list[str]
    content: ContentAnalysis | None
    model_weight: float
    gemini_used: bool
    warning: str | None = None


class BriefingRequest(BaseModel):
    user_id: str


class HooksRequest(BaseModel):
    hook_text: str
    voice_ids: list[str] | None = None


class AudioResponse(BaseModel):
    audio_urls: list[str]


class ContributeRequest(BaseModel):
    user_id: str
    wallet_address: str
    posts_shared: int


class ContributeResponse(BaseModel):
    contribution_id: str
    tokens_owed: int
