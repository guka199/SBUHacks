"""AI editorial reviews of a whole video's clarity and pacing, shown beside the opening review.

Like the opening review these are editorial ratings, not measured retention or probabilities.
"""
from typing import Literal

from pydantic import BaseModel, Field

FocusKind = Literal["clarity", "pacing"]


class FocusCriterion(BaseModel):
    id: str
    label: str
    score: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    evidence: str = Field(min_length=1, max_length=700)


class FocusEvidence(BaseModel):
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(gt=0, allow_inf_nan=False)
    observation: str = Field(min_length=1, max_length=700)
    edit: str = Field(min_length=1, max_length=700)


class FocusAnalysis(BaseModel):
    method: Literal["ai_review"] = "ai_review"
    kind: FocusKind
    score: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    summary: str = Field(min_length=1, max_length=700)
    topFix: str = Field(min_length=1, max_length=700)
    criteria: list[FocusCriterion] = Field(min_length=4, max_length=4)
    evidence: list[FocusEvidence] = Field(default_factory=list, max_length=4)
