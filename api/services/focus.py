"""Ground and bound Gemini's whole-video clarity and pacing reviews (same approach as api/services/hooks.py)."""
import math
from statistics import mean

from pydantic import BaseModel, ConfigDict, Field

from api.focus_schemas import FocusAnalysis, FocusCriterion, FocusEvidence

LABELS = {
    "clarity": {"subject": "Subject", "message": "Message & payoff", "text_audio": "Works with sound off",
                "structure": "Structure"},
    "pacing": {"start": "Gets going", "rhythm": "Rhythm", "dead_air": "Dead air", "ending": "Ending"},
}


class FocusInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


class GeminiFocusCriterion(FocusInput):
    id: str = Field(description="one of the criterion ids listed for this review")
    score: int | None = Field(ge=0, le=100, description="Editorial rating, not probability. Null if unobservable.")
    evidence: str = Field(min_length=1, max_length=700, description="Specific visible/audible basis for the rating.")


class GeminiFocusMoment(FocusInput):
    start: str = Field(description="Exact start time in MM:SS, inside the video's real length.")
    end: str = Field(description="Exact end time in MM:SS, after start and inside the video.")
    observation: str = Field(min_length=1, max_length=700, description="What actually happens in this span.")
    edit: str = Field(min_length=1, max_length=700, description="One concrete edit for this span.")


class GeminiFocusReview(FocusInput):
    summary: str = Field(min_length=1, max_length=700, description="One sentence verdict.")
    top_fix: str = Field(min_length=1, max_length=700, description="The single most impactful change.")
    criteria: list[GeminiFocusCriterion] = Field(min_length=4, max_length=4,
                                                 description="Exactly one of each listed criterion id.")
    evidence: list[GeminiFocusMoment] = Field(max_length=4, description="Up to 4 observed spans with concrete edits.")


FOCUS_PROMPT = """
CLARITY REVIEW (clarity_analysis) and PACING REVIEW (pacing_analysis): for an attached VIDEO, review the WHOLE video
from 00:00 to its real end; for an image or caption-only input return null for both. These are AI editorial
assessments, not measured retention, probabilities or promises of views. Rate each criterion 0-100 (0 weak,
50 mixed, 100 strong) from what you actually see and hear; use null when it cannot be judged and say why.
Return each listed criterion id exactly once.
clarity_analysis criteria:
- subject: how quickly a viewer knows what the video is about;
- message: whether the point or payoff is clear and actually delivered;
- text_audio: whether it still works with the sound off (on-screen text, captions) and speech/text is legible;
- structure: whether the order of ideas is easy to follow, without confusing jumps.
pacing_analysis criteria:
- start: how fast the first meaningful moment arrives;
- rhythm: whether cut frequency and shot length fit the content (not sluggish, not frantic);
- dead_air: absence of stalls, empty screens, repetition or filler;
- ending: whether the payoff lands and the video ends without dragging.
For each review give a one-sentence summary, the single most impactful fix (top_fix), and up to 4 timestamped spans
(exact MM:SS taken from the video, inside its real length) with a concrete edit each. Report only spans you can
actually observe; fewer is better than invented ones.
"""


def clean_focus_review(review: GeminiFocusReview | None, kind: str, duration, is_video: bool) -> FocusAnalysis | None:
    """Keep a review only if it has each criterion once; drop spans outside the video. Never invent scores."""
    if not is_video or review is None:
        return None
    labels = LABELS[kind]
    by_id = {item.id.strip().lower(): item for item in review.criteria}
    if set(by_id) != set(labels):
        return None
    criteria = [FocusCriterion(id=key, label=label, score=by_id[key].score, evidence=by_id[key].evidence)
                for key, label in labels.items()]
    known = [item.score for item in criteria if item.score is not None]
    length = duration if isinstance(duration, (int, float)) and not isinstance(duration, bool) and \
        math.isfinite(duration) and duration > 0 else None
    from api.services.gemini import seconds  # avoid a module-level import cycle
    evidence = []
    for item in review.evidence:
        start, end = seconds(item.start), seconds(item.end)
        if start is None or end is None or not (0 <= start < end) or (length and end > length + 0.5):
            continue
        end = min(end, length) if length else end
        if any(abs(start - old.start) < .1 and abs(end - old.end) < .1 for old in evidence):
            continue
        evidence.append(FocusEvidence(start=start, end=end, observation=item.observation, edit=item.edit))
    return FocusAnalysis(kind=kind, score=round(mean(known), 1) if known else None, summary=review.summary,
                         topFix=review.top_fix, criteria=criteria,
                         evidence=sorted(evidence, key=lambda item: item.start)[:4])
