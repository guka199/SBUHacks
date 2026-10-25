"""Ground and bound the optional Gemini opening review, independent of ML scores."""
import math
from statistics import mean

from pydantic import BaseModel, ConfigDict, Field

from api.hook_schemas import HookAnalysis, HookCriterion, HookCriterionId, HookEvidence

LABELS = {'attention': 'First impression', 'clarity': 'Message clarity',
          'pacing': 'Opening pace', 'audio_text': 'Audio & text support'}


class HookInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class GeminiHookCriterion(HookInput):
    id: HookCriterionId
    score: int | None = Field(ge=0, le=100, description='Editorial rating, not probability. Null if unobservable.')
    evidence: str = Field(min_length=1, max_length=700, description='Specific visible/audible basis, or explain what cannot be assessed.')


class GeminiHookMoment(HookInput):
    start: str = Field(description='Exact start time in seconds or MM:SS, inside the first 5 seconds only.')
    end: str = Field(description='Exact end time, after start and no later than the opening window end.')
    observation: str = Field(min_length=1, max_length=700, description='What actually happens in this span, not an invented event.')
    edit: str = Field(min_length=1, max_length=700, description='One concrete edit grounded in this span.')


class GeminiHookReview(HookInput):
    summary: str = Field(min_length=1, max_length=700)
    opening: str = Field(min_length=1, max_length=700, description='Describe the ACTUAL opening visuals/audio/text, without invented dialogue.')
    suggested_opening: str = Field(min_length=1, max_length=700, description='A proposed opening edit/script faithful to the video. A suggestion, not observed speech or a performance guarantee.')
    criteria: list[GeminiHookCriterion] = Field(min_length=4, max_length=4, description='Exactly one of each: attention, clarity, pacing, audio_text.')
    evidence: list[GeminiHookMoment] = Field(max_length=3, description='Up to 3 observed spans with concrete edits. Empty if no grounded edit is needed.')


def clean_hook_review(review: GeminiHookReview | None, duration, is_video: bool) -> HookAnalysis | None:
    if not is_video or review is None:
        return None
    if isinstance(duration, (int, float)) and not isinstance(duration, bool) and math.isfinite(duration) and duration > 0:
        window = min(5.0, duration)
    else:
        window = 5.0
    by_id = {item.id: item for item in review.criteria}
    if len(by_id) != 4 or set(by_id) != set(LABELS):
        return None
    # Use one explicit equal-weight rubric. Never infer missing scores as zeros.
    criteria = [HookCriterion(id=key, label=label, score=by_id[key].score,
                             evidence=by_id[key].evidence.strip()) for key, label in LABELS.items()]
    known = [item.score for item in criteria if item.score is not None]
    from api.services.gemini import seconds  # avoid a module-level import cycle
    evidence = []
    for item in review.evidence:
        start, end = seconds(item.start), seconds(item.end)
        if start is None or end is None or not math.isfinite(start) or not math.isfinite(end):
            continue
        # Do not clamp a span describing later content into the opening window.
        if not (0 <= start < end <= window):
            continue
        if any(abs(start - old.start) < .1 and abs(end - old.end) < .1 for old in evidence):
            continue
        evidence.append(HookEvidence(start=start, end=end, observation=item.observation.strip(), edit=item.edit.strip()))
    return HookAnalysis(windowSeconds=window, score=round(mean(known), 1) if known else None,
                        summary=review.summary.strip(), opening=review.opening.strip(),
                        suggestedOpening=review.suggested_opening.strip(), criteria=criteria,
                        evidence=sorted(evidence, key=lambda item: item.start))
