"""Request/response shapes shared with the frontend (mirror these in web/lib/api.ts)."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Platform = Literal["youtube", "tiktok", "instagram", "linkedin"]
UserId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)]


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
    user_id: UserId
    channel_id: str = Field(min_length=1, max_length=512)
    max_videos: int = Field(default=50, ge=1, le=200)


class IngestResponse(BaseModel):
    posts_loaded: int
    inserted: int = 0
    updated: int = 0
    duplicates_skipped: int = 0
    batch_id: str | None = None
    enriched_posts: int = 0
    warnings: list[str] = Field(default_factory=list)


class PlatformStats(BaseModel):
    platform: Platform
    posts: int
    avg_engagement_rate: float
    total_views: int


class FormatStats(PlatformStats):
    format: str


class WeeklyStats(PlatformStats):
    week: date


class RecentPost(Post):
    external_id: str | None  # Imports from the original scaffold may not have IDs.
    sentiment: str | None = None


class ConnectedAccount(BaseModel):
    platform: Platform
    handle: str | None = None
    followers: int | None = None


class DashboardResponse(BaseModel):
    user_id: UserId
    platforms: list[PlatformStats]
    by_format: list[FormatStats] = Field(default_factory=list)
    weekly: list[WeeklyStats] = Field(default_factory=list)
    recent_posts: list[RecentPost] = Field(default_factory=list)
    accounts: list[ConnectedAccount] = Field(default_factory=list)
    total_posts: int = 0
    last_import_at: datetime | None = None


class EnrichRequest(BaseModel):
    user_id: UserId
    limit: int = Field(default=25, ge=1, le=100)


class EnrichResponse(BaseModel):
    enriched_posts: int


class InsightsResponse(BaseModel):
    user_id: UserId
    summary: str
    provider: Literal["snowflake-cortex"] = "snowflake-cortex"
    model: str


class SimilarPostsRequest(BaseModel):
    caption: str = Field(min_length=1, max_length=6000)
    platform: Platform | None = None
    limit: int = Field(default=5, ge=1, le=20)


class SimilarPost(RecentPost):
    similarity: float


class SimilarPostsResponse(BaseModel):
    posts: list[SimilarPost]


class PredictRequest(BaseModel):
    user_id: UserId | None = None
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
    prediction_id: str | None = None
    storage_warning: str | None = None


class ContentScore(BaseModel):
    platform: Platform
    score: float  # Gemini's content score, same 0-100 scale
    reason: str


class VideoMoment(BaseModel):
    start: float  # seconds into the uploaded video
    end: float
    issue: Literal["unclear", "pacing", "improve"]
    title: str
    problem: str
    fix: str


class ContentAnalysis(BaseModel):
    summary: str
    hook: int
    visual_quality: int
    clarity: int
    trend_fit: int
    platform_scores: list[ContentScore]
    strengths: list[str]
    moments: list[VideoMoment] = []  # timestamped problem stretches (videos only), checked against the duration


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
    prediction_id: str | None = None
    storage_warning: str | None = None


class PredictionRecord(BaseModel):
    id: str
    request_id: str | None = None
    platform: Platform
    caption: str
    score: float
    model_score: float | None = None
    content_score: float | None = None
    provider: str | None = None
    created_at: datetime


class PredictionHistory(BaseModel):
    predictions: list[PredictionRecord]


class BriefingRequest(BaseModel):
    user_id: str


class HooksRequest(BaseModel):
    hook_text: str
    voice_ids: list[str] | None = None


class AudioResponse(BaseModel):
    audio_urls: list[str]


class ContributeRequest(BaseModel):
    user_id: UserId
    wallet_address: str = Field(min_length=32, max_length=44)
    posts_shared: int = Field(gt=0)


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

