"""AI editorial hook ratings, not measured retention or calibrated probabilities."""
from typing import Literal

from pydantic import BaseModel, Field, model_validator

HookCriterionId = Literal['attention', 'clarity', 'pacing', 'audio_text']


class HookCriterion(BaseModel):
    id: HookCriterionId
    label: str
    score: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    evidence: str = Field(min_length=1, max_length=700)


class HookEvidence(BaseModel):
    start: float = Field(ge=0, lt=5, allow_inf_nan=False)
    end: float = Field(gt=0, le=5, allow_inf_nan=False)
    observation: str = Field(min_length=1, max_length=700)
    edit: str = Field(min_length=1, max_length=700)


class HookAnalysis(BaseModel):
    method: Literal['ai_review'] = 'ai_review'
    windowSeconds: float = Field(gt=0, le=5, allow_inf_nan=False)
    score: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    summary: str = Field(min_length=1, max_length=700)
    opening: str = Field(min_length=1, max_length=700)
    suggestedOpening: str = Field(min_length=1, max_length=700)
    criteria: list[HookCriterion] = Field(min_length=4, max_length=4)
    evidence: list[HookEvidence] = Field(default_factory=list, max_length=3)

    @model_validator(mode='after')
    def bound_review(self):
        if len({item.id for item in self.criteria}) != 4:
            raise ValueError('Opening rubric must contain each criterion once')
        if any(not (item.start < item.end <= self.windowSeconds) for item in self.evidence):
            raise ValueError('Evidence must be inside the opening window')
        return self
