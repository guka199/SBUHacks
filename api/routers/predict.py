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
    "has_exclamation": "Add energy to the hook.",
    "has_link": "Drop the link from the caption; put it in your bio instead.",
    "has_call_to_action": "End with a call to action (e.g. 'comment your answer').",
    "uppercase_ratio": "Adjust capitalization; avoid all-caps captions.",
    "duration_sec": "Change the video length; your best posts run a different length.",
    "description_length": "Adjust the description length.",
}

# Fields that may describe the draft or the account, passed through to the feature builder
CONTEXT_FIELDS = ["format", "followers", "following", "num_posts", "duration_sec", "original_sound",
                  "verified", "is_business_account", "category", "description_length"]


@router.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    post = {"caption": req.caption, "posted_at": req.planned_time, **req.model_dump(include=set(CONTEXT_FIELDS))}

    scores: list[PlatformScore] = []
    negatives: list[tuple[str, float]] = []
    for platform in req.platforms:
        value, factors = model.score(platform, build_features(platform, post))
        scores.append(
            PlatformScore(
                platform=platform,
                score=round(value, 1),
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
