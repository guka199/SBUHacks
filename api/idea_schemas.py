"""Personalized follow-up ideas. Mirror browser-facing fields in frontend/src/lib/ideas.ts."""

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

IdeaPlatform = Literal["youtube", "shorts", "tiktok", "instagram", "linkedin"]
IdeaStatus = Literal["suggested", "saved", "dismissed"]


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


class ChannelContext(BaseModel):
    creator: CreatorProfile
    target_platform: IdeaPlatform | None = None
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


class GenerateIdeasRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    platform: IdeaPlatform | None = None
    count: Literal[3, 4, 5] = 3


class GeneratedIdea(BaseModel):
    title: str = Field(min_length=5, max_length=160)
    hook: str = Field(min_length=5, max_length=300)
    outline: list[str] = Field(min_length=3, max_length=5)
    platform: IdeaPlatform
    approach: Literal["sequel", "new_angle", "repurpose"]
    rationale: str = Field(min_length=10, max_length=700)
    source_ids: list[str] = Field(min_length=1, max_length=4)


class GeneratedIdeas(BaseModel):
    channel_summary: str = Field(min_length=10, max_length=800)
    ideas: list[GeneratedIdea] = Field(min_length=3, max_length=5)


class ContentIdea(BaseModel):
    id: str
    batch_id: str
    title: str
    hook: str
    outline: list[str]
    platform: IdeaPlatform
    approach: str
    rationale: str
    sources: list[ChannelSource]
    channel_summary: str
    context_warnings: list[str]
    status: IdeaStatus
    created_at: str


class GeneratedIdeasResponse(BaseModel):
    context: ChannelContext
    ideas: list[ContentIdea]


class IdeaStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: IdeaStatus
