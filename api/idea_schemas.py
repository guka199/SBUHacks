"""Personalized follow-up ideas. Mirror browser-facing fields in frontend/src/lib/ideas.ts."""

from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, PrivateAttr, StringConstraints, field_validator

IdeaPlatform = Literal["youtube", "shorts", "tiktok", "instagram", "linkedin"]
IDEA_PLATFORMS = ("youtube", "shorts", "tiktok", "instagram", "linkedin")
IdeaTarget = Literal["youtube", "shorts", "tiktok", "instagram", "linkedin", "all_platforms"]
IdeaStatus = Literal["suggested", "saved", "dismissed"]
IdeaKind = Literal["follow_up", "trend_inspired", "evergreen"]
IdeaFeedback = Literal["useful", "not_useful"]
CreatorGoal = Literal["growth", "engagement", "sales", "series"]
ShortTopic = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class CreatorPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    # Retained so older clients and stored idea snapshots remain readable.
    # Active preferences ignore these fields after removal of the Goals UI.
    goal: CreatorGoal | None = Field(default=None, deprecated=True)
    goal_details: str = Field(default="", max_length=500, deprecated=True)
    filming_minutes: int | None = Field(default=None, ge=5, le=480, strict=True)
    style_notes: str = Field(default="", max_length=500)
    audience_notes: str = Field(default="", max_length=500)
    topics_to_avoid: list[ShortTopic] = Field(default_factory=list, max_length=10)


class CreatorPreferencesResponse(BaseModel):
    preferences: CreatorPreferences
    updated_at: str | None = None


class RefreshMemoryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ChannelSource(BaseModel):
    id: str
    kind: Literal["published_post", "analyzed_draft", "scored_draft"]
    platform: str
    format: str | None = None
    title: str
    text: str
    summary: str = ""
    review_notes: list[str] = Field(default_factory=list)
    review_kind: Literal["gemini", "model_only", "none"] = "none"
    published_at: str | None = None
    updated_at: str | None = None
    age_days: float | None = None
    age_days_at_snapshot: float | None = None
    views: int | None = None
    likes: int | None = None
    comments: int | None = None
    shares: int | None = None
    relative_views: float | None = None
    comparison_count: int | None = None
    comparison_median_views: float | None = None
    comparison_label: str | None = None
    url: str | None = None


class CreatorProfile(BaseModel):
    display_name: str
    account_type: str | None = None
    niche: str | None = None


class ChannelAccount(BaseModel):
    platform: str
    followers: int | None = None
    typical_views: float | None = None
    audience: dict = Field(default_factory=dict)
    refreshed_at: str | None = None


class MemoryObservation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    label: str = Field(min_length=3, max_length=160)
    source_ids: list[str] = Field(min_length=1, max_length=4)


class GeneratedMemory(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    summary: str = Field(min_length=10, max_length=800)
    themes: list[MemoryObservation] = Field(min_length=1, max_length=6)
    style: list[MemoryObservation] = Field(default_factory=list, max_length=4)
    covered_topics: list[MemoryObservation] = Field(min_length=1, max_length=10)


class ChannelMemory(GeneratedMemory):
    sources: list[ChannelSource] = Field(max_length=40)
    generated_at: str
    is_stale: bool = False


class TrendEvidence(BaseModel):
    id: str
    platform: IdeaPlatform
    region_code: str
    title: str = Field(max_length=200)
    summary: str = Field(max_length=800)
    url: str = Field(max_length=2000)
    published_at: str
    date_status: Literal["api_verified", "source_reported"]
    observed_at: str
    provider: Literal["youtube_data", "google_search"]
    views: int | None = None


class TrendResearch(BaseModel):
    status: Literal["available", "unavailable", "disabled", "needs_topic", "needs_platform"]
    platform: IdeaPlatform | None = None
    region_code: str = "US"
    topic: str = ""
    checked_at: str | None = None
    expires_at: str | None = None
    cached: bool = False
    sources: list[TrendEvidence] = Field(default_factory=list, max_length=6)
    search_suggestions: list[Annotated[str, StringConstraints(max_length=30000)]] = Field(default_factory=list, max_length=2)
    notes: list[str] = Field(default_factory=list, max_length=6)


class ChannelContext(BaseModel):
    _memory_fingerprint: str = PrivateAttr(default="")
    creator: CreatorProfile
    target_platform: IdeaTarget | None = None
    accounts: list[ChannelAccount]
    sources: list[ChannelSource]
    published_posts: int
    draft_reviews: int
    distinct_content: int
    history_status: Literal["insufficient", "limited", "available"]
    can_generate: bool
    last_updated: str | None = None
    collected_at: str
    warnings: list[str]
    creator_preferences: CreatorPreferences = Field(default_factory=CreatorPreferences)
    preferences_updated_at: str | None = None
    memory: ChannelMemory | None = None
    trend_research: TrendResearch | None = None


class GenerateIdeasRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    platform: IdeaTarget | None = None
    count: Literal[3, 4, 5] = 3
    use_trends: bool = True
    region_code: str = Field(default="US", pattern=r"^[A-Z]{2}$")
    trend_topic: str | None = Field(default=None, min_length=2, max_length=100)

    @field_validator("trend_topic")
    @classmethod
    def clean_topic(cls, value):
        if value is not None:
            value = value.strip()
            if len(value) < 2:
                raise ValueError("Use at least two characters for the research topic")
        return value


class PlatformAdaptation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    platform: IdeaPlatform
    format: str = Field(min_length=3, max_length=80)
    hook: str = Field(min_length=5, max_length=180)
    execution: str = Field(min_length=10, max_length=300)


class GeneratedIdea(BaseModel):
    idea_kind: IdeaKind
    title: str = Field(min_length=5, max_length=160)
    hook: str = Field(min_length=5, max_length=300)
    outline: list[str] = Field(min_length=3, max_length=5)
    platform: IdeaTarget
    approach: Literal["sequel", "new_angle", "repurpose"]
    rationale: str = Field(min_length=10, max_length=700)
    source_ids: list[str] = Field(min_length=1, max_length=4)
    trend_source_ids: list[str] = Field(default_factory=list, max_length=3)
    adaptations: list[PlatformAdaptation] = Field(default_factory=list, max_length=5)


class GeneratedIdeas(BaseModel):
    channel_summary: str = Field(min_length=10, max_length=800)
    ideas: list[GeneratedIdea] = Field(min_length=3, max_length=5)


class ContentIdea(BaseModel):
    id: str
    batch_id: str
    title: str
    hook: str
    outline: list[str]
    platform: IdeaTarget
    approach: str
    rationale: str
    sources: list[ChannelSource]
    channel_summary: str
    context_warnings: list[str]
    status: IdeaStatus
    created_at: str
    creator_preferences: CreatorPreferences = Field(default_factory=CreatorPreferences)
    memory_generated_at: str | None = None
    idea_kind: IdeaKind | None = None
    trend_sources: list[TrendEvidence] = Field(default_factory=list)
    trend_research: TrendResearch | None = None
    feedback: IdeaFeedback | None = None
    adaptations: list[PlatformAdaptation] = Field(default_factory=list, max_length=5)


class GeneratedIdeasResponse(BaseModel):
    context: ChannelContext
    ideas: list[ContentIdea]


class IdeaStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: IdeaStatus


class IdeaFeedbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feedback: IdeaFeedback | None
