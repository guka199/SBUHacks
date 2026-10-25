"""ViralPilot report contract; mirrored in frontend/src/lib/contracts.ts."""

from typing import Literal

from pydantic import BaseModel, Field

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


class AnalysisReport(BaseModel):
    id: str
    mode: Literal["live"] = "live"
    video: VideoInfo
    summary: str
    platforms: list[ReportPlatform]
    observations: list[Observation] = Field(default_factory=list)
    overallSuggestions: list[str] = Field(default_factory=list)
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
