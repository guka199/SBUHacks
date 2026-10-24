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
    creator_typical_views: int | None = None  # TikTok: views a typical post of this account gets


class Factor(BaseModel):
    feature: str
    impact: float  # SHAP value; negative = hurts the score


class AccountComparison(BaseModel):
    ratio: float  # expected result / the account's typical post (1.4 = 40% better than usual)
    percent: float  # (ratio - 1) * 100
    reliability: str  # low | moderate | high - how well this ranked an account's own posts in testing
    expected_views: float | None = None  # ratio * creator_typical_views, when given (TikTok/YouTube)


class PlatformScore(BaseModel):
    platform: Platform
    score: float  # 0-100 virality percentile within the platform
    top_factors: list[Factor]
    vs_account: AccountComparison | None = None


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
    vs_account: AccountComparison | None = None


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


# ----------------------------------------------------------------------------- users & linked accounts

AccountType = Literal["creator", "business"]


class SignupRequest(BaseModel):
    email: str
    password: str
    display_name: str
    account_type: AccountType = "creator"
    niche: str | None = None  # e.g. "study tips", "local bakery"


class LoginRequest(BaseModel):
    email: str
    password: str


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    account_type: AccountType | None = None
    niche: str | None = None  # "" clears it


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class DeleteAccountRequest(BaseModel):
    password: str  # re-entered to confirm


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
    account_type: str | None = None
    niche: str | None = None


class Audience(BaseModel):
    age_range: str | None = None  # e.g. "18-24"
    percent_female: float | None = None  # 0-100
    top_countries: list[str] | None = None
    interests: str | None = None
    language: str | None = None


class ManualAccountIn(BaseModel):
    """Stats a user types in from their platform's analytics (TikTok, Instagram, LinkedIn, or YouTube manually)."""
    handle: str
    profile_url: str | None = None
    followers: int | None = None
    following: int | None = None
    total_posts: int | None = None
    avg_views: float | None = None
    avg_likes: float | None = None
    avg_comments: float | None = None
    avg_shares: float | None = None
    posts_per_week: float | None = None
    audience: Audience | None = None


class YouTubeConnectIn(BaseModel):
    channel: str  # channel URL, @handle or channel id
    audience: Audience | None = None


class AccountOut(BaseModel):
    platform: Platform
    connection: str  # api | manual
    handle: str | None = None
    external_id: str | None = None  # e.g. YouTube channel id
    display_name: str | None = None
    profile_url: str | None = None
    followers: int | None = None
    following: int | None = None
    total_posts: int | None = None
    avg_views: float | None = None
    typical_views: float | None = None
    avg_likes: float | None = None
    avg_comments: float | None = None
    avg_shares: float | None = None
    engagement_rate: float | None = None
    posts_per_week: float | None = None
    audience: dict = {}
    extra: dict = {}
    updated_at: str | None = None

