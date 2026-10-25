"""ViralPilot report contract; mirrored in frontend/src/lib/contracts.ts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field
from api.hook_schemas import HookAnalysis

FormatId = Literal["tiktok", "instagram", "shorts", "youtube"]


class VideoInfo(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    durationSeconds: float = Field(gt=0, le=43200, allow_inf_nan=False)
    width: int = Field(gt=0, le=16384)
    height: int = Field(gt=0, le=16384)


class PublishingCopy(BaseModel):
    hook: str = Field(default="", max_length=500)
    title: str = Field(default="", max_length=300)
    caption: str = Field(default="", max_length=10000)
    description: str = Field(default="", max_length=2000)
    cta: str = Field(default="", max_length=500)
    edits: list[str] = Field(default_factory=list, max_length=5)


class ReportPlatform(BaseModel):
    id: FormatId
    score: float = Field(ge=0, le=100)
    hook: float | None = Field(default=None, ge=0, le=100)
    pacing: float | None = Field(default=None, ge=0, le=100)
    format: float | None = Field(default=None, ge=0, le=100)
    visualQuality: float | None = Field(default=None, ge=0, le=100)
    clarity: float | None = Field(default=None, ge=0, le=100)
    modelScore: float = Field(ge=0, le=100)
    contentScore: float | None = Field(default=None, ge=0, le=100)
    geminiUsed: bool
    modelWeight: float = Field(ge=0, le=1)
    assessment: str
    opportunities: list[str]
    strengths: list[str]
    suggestions: PublishingCopy


class Observation(BaseModel):
    id: str
    time: float = Field(ge=0)
    end: float = Field(ge=0)
    kind: Literal["strength", "opportunity", "unclear", "pacing", "improve"]
    title: str
    detail: str
    fix: str = ""


class ThumbnailReview(BaseModel):
    index: int = Field(ge=0, le=2)
    name: str
    mimeType: Literal["image/jpeg", "image/png", "image/webp"]
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    scores: dict[FormatId, float]
    reasons: dict[FormatId, str]
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)


class ThumbnailPick(BaseModel):
    platform: FormatId
    index: int = Field(ge=0, le=2)
    reason: str


class ThumbnailComparison(BaseModel):
    summary: str
    items: list[ThumbnailReview]
    picks: list[ThumbnailPick]


class PostingIn(BaseModel):
    """Optional posting plan from the upload form."""
    country: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    plannedTime: datetime | None = None  # an exact instant (with UTC offset)
    timezone: str | None = Field(default=None, max_length=64)  # the poster's IANA zone, e.g. America/New_York


class PostingWindow(BaseModel):
    days: str
    start: str  # HH:MM in the audience time zone
    end: str
    startLocal: str | None = None  # the same window in the poster's own time zone
    endLocal: str | None = None


class PostingPlatform(BaseModel):
    platform: FormatId
    rating: Literal["good", "okay", "poor", "unknown"]
    reason: str
    windows: list[PostingWindow]


class PostingAdvice(BaseModel):
    country: str | None = None
    countryName: str | None = None
    audienceTimezone: str
    posterTimezone: str | None = None
    plannedTime: datetime | None = None
    plannedAudience: str | None = None  # e.g. "Sat 25 Oct, 23:00" in the audience time zone
    plannedPoster: str | None = None
    hasAudienceData: bool
    summary: str
    audienceFit: str
    platforms: list[PostingPlatform]
    suggestions: list[str]


class AnalysisReport(BaseModel):
    id: str
    mode: Literal["live"] = "live"
    video: VideoInfo
    summary: str
    platforms: list[ReportPlatform]
    observations: list[Observation] = Field(default_factory=list)
    overallSuggestions: list[str] = Field(default_factory=list)
    thumbnails: ThumbnailComparison | None = None
    posting: PostingAdvice | None = None
    hookAnalysis: HookAnalysis | None = None
    warnings: list[str] = Field(default_factory=list)


class AnalysisJob(BaseModel):
    id: str
    status: Literal["complete"] = "complete"
    progress: int = 100
    stage: str = "Ready"
    result: AnalysisReport


class RewriteIn(BaseModel):
    platform: FormatId
    tone: Literal["direct", "playful", "educational"]


# --- Photo posts (single image or carousel), stored in ANALYSES with kind "post"; mirrored in contracts.ts ---
PostFormatId = Literal["instagram", "linkedin", "tiktok"]


class PostImage(BaseModel):
    index: int = Field(ge=0)
    name: str
    mimeType: Literal["image/jpeg", "image/png", "image/webp"]
    width: int = Field(gt=0)
    height: int = Field(gt=0)


class SlideNote(BaseModel):
    index: int = Field(ge=0)  # position in the uploaded order
    verdict: Literal["keep", "improve", "cut"]
    feedback: str


class PostPlatformScore(BaseModel):
    id: PostFormatId
    score: float = Field(ge=0, le=100)  # combined, same blend as videos
    modelScore: float = Field(ge=0, le=100)
    contentScore: float | None = Field(default=None, ge=0, le=100)
    reason: str = ""


class PostVariant(BaseModel):
    index: int = Field(ge=0, le=2)
    caption: str
    images: list[PostImage]
    summary: str = ""
    hook: float | None = Field(default=None, ge=0, le=100)
    visualQuality: float | None = Field(default=None, ge=0, le=100)
    clarity: float | None = Field(default=None, ge=0, le=100)
    platforms: list[PostPlatformScore]
    strengths: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    slides: list[SlideNote] = Field(default_factory=list)
    suggestedOrder: list[int] | None = None  # image indices; None when the uploaded order is already best
    orderReason: str = ""


class PostPick(BaseModel):
    platform: PostFormatId
    variant: int = Field(ge=0, le=2)
    reason: str


class PostReport(BaseModel):
    id: str
    kind: Literal["post"] = "post"
    mode: Literal["live"] = "live"
    platforms: list[PostFormatId]
    summary: str
    variants: list[PostVariant]
    picks: list[PostPick]
    modelWeight: float = Field(ge=0, le=1)
    geminiUsed: bool
    warnings: list[str] = Field(default_factory=list)
