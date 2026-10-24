"""Score a draft post per platform and suggest changes."""

from fastapi import APIRouter

from api.schemas import Factor, PlatformScore, PredictRequest, PredictResponse
from api.services import model
from shared.features import build_features

router = APIRouter(tags=["predict"])

# Plain-English hints per feature, used until LLM suggestions (Cortex COMPLETE) are wired in.
FEATURE_HINTS = {
    "caption_length": "Try a shorter caption; your best posts get to the point faster.",
    "word_count": "Cut filler words from the caption.",
    "hashtag_count": "Adjust the number of hashtags; 3-5 targeted ones usually beat a long list.",
    "mention_count": "Tag a relevant account or collaborator.",
    "emoji_count": "Adjust emoji use to match your top-performing posts.",
    "has_question": "Ask the audience a question to invite comments.",
    "has_number": "Add a concrete number to the hook (e.g. '3 tips', '10 seconds').",
    "hour": "Post at a different time of day; your audience is more active at another hour.",
    "weekday": "Try a different day of the week.",
    "is_weekend": "Try posting on a weekday instead (or vice versa).",
    "sentiment": "Make the tone more positive and energetic.",
}


def _to_score(rate: float) -> float:
    """Map engagement rate to a 0-100 score (10% engagement or more = 100)."""
    return round(min(rate / 0.10, 1.0) * 100, 1)


@router.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    features = build_features(req.caption, req.planned_time)

    scores: list[PlatformScore] = []
    negatives: list[tuple[str, float]] = []
    for platform in req.platforms:
        rate, factors = model.score(platform, features)
        scores.append(
            PlatformScore(
                platform=platform,
                score=_to_score(rate),
                predicted_engagement_rate=rate,
                top_factors=[Factor(feature=f, impact=i) for f, i in factors[:3]],
            )
        )
        negatives += [(f, i) for f, i in factors if i < 0]

    # Features that hurt the most across platforms -> top 3 suggestions
    worst: dict[str, float] = {}
    for f, i in negatives:
        worst[f] = worst.get(f, 0) + i
    suggestions = [FEATURE_HINTS[f] for f, _ in sorted(worst.items(), key=lambda x: x[1])[:3] if f in FEATURE_HINTS]

    return PredictResponse(scores=scores, suggestions=suggestions)
