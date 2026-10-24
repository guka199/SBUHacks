"""Score a draft post per platform and suggest changes."""

from fastapi import APIRouter

from api.schemas import AccountComparison, Factor, PlatformScore, PredictRequest, PredictResponse
from api.services import model
from api.services.predictions import persist
from shared.features import build_features
from shared.thumbnails import ThumbnailError, download_thumbnail, encode_image

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
    "thumbnail_content": "Review the thumbnail's clarity and how well it matches the title; visual features lowered this prediction.",
}

# Fields that may describe the draft or the account, passed through to the feature builder
CONTEXT_FIELDS = ["format", "followers", "following", "num_posts", "duration_sec", "original_sound",
                  "verified", "is_business_account", "category", "description_length", "creator_typical_views"]


@router.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    """Our trained model only (fast, no Gemini). /score adds Gemini's content review on top."""
    result = score_with_model(req)
    return persist(req.user_id, req.caption, result, req.model_dump(exclude={"caption", "user_id"}))


def score_with_model(req: PredictRequest, *, thumbnail_bytes: bytes | None = None) -> PredictResponse:
    post = {"caption": req.caption, "posted_at": req.planned_time, **req.model_dump(include=set(CONTEXT_FIELDS))}

    embedding, thumbnail_warning = None, None
    supplied = thumbnail_bytes is not None or bool(req.thumbnail_url)
    if "youtube" in req.platforms and req.use_thumbnail_model and not supplied:
        thumbnail_warning = "Upload the selected YouTube thumbnail to try the experimental thumbnail model."
    if "youtube" in req.platforms and req.use_thumbnail_model and supplied:
        if model.thumbnail_bundle("score") is not None or model.thumbnail_bundle("relative") is not None:
            try:
                content = thumbnail_bytes if thumbnail_bytes is not None else download_thumbnail(req.thumbnail_url)
                embedding = encode_image(content)
            except ThumbnailError as exc:
                thumbnail_warning = f"{exc}. Using the standard prediction."
            except (OSError, ValueError):
                thumbnail_warning = "Thumbnail features are unavailable; using the standard prediction."
        else:
            thumbnail_warning = "Thumbnail-based prediction is not enabled on this server; using the standard model."

    scores: list[PlatformScore] = []
    negatives: list[tuple[str, float]] = []
    for platform in req.platforms:
        features = build_features(platform, post)
        image = embedding if platform == "youtube" else None
        value, factors = model.score(platform, features, req.caption, thumbnail_embedding=image)
        comparison = None
        if (rel := model.vs_account(platform, features, req.caption, thumbnail_embedding=image)) is not None:
            ratio, reliability = rel
            typical = req.creator_typical_views if platform in ("tiktok", "youtube") else None
            comparison = AccountComparison(
                ratio=round(ratio, 3), percent=round((ratio - 1) * 100, 1), reliability=reliability,
                expected_views=round(ratio * typical) if typical else None,
                thumbnail_used=image is not None and model.thumbnail_bundle("relative") is not None,
            )
        scores.append(
            PlatformScore(
                platform=platform,
                score=round(value, 1),
                top_factors=[Factor(feature=f, impact=i) for f, i in factors[:3]],
                vs_account=comparison,
                thumbnail_used=image is not None and model.thumbnail_bundle("score") is not None,
            )
        )
        negatives += [(f, i) for f, i in factors if i < 0]

    # Features that hurt the most across platforms -> top 3 suggestions
    worst: dict[str, float] = {}
    for f, i in negatives:
        worst[f] = worst.get(f, 0) + i
    # Only features a user can act on (topic dims like text_7 and account size have no hint)
    actionable = [(f, i) for f, i in worst.items() if f in FEATURE_HINTS]
    suggestions = [FEATURE_HINTS[f] for f, _ in sorted(actionable, key=lambda x: x[1])[:3]]

    return PredictResponse(scores=scores, suggestions=suggestions, thumbnail_warning=thumbnail_warning)
