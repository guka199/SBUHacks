"""Full draft scoring: our trained model + Gemini's content review -> one combined score + merged suggestions.

    POST /score   (multipart form)
      caption       text of the post (required)
      platforms     comma-separated, e.g. "tiktok,instagram"
      planned_time  ISO datetime (optional)
      context       JSON with optional account/draft fields, e.g. {"followers": 5000, "duration_sec": 30}
      file          image or video (optional)

Without GEMINI_API_KEY (or if Gemini fails) it returns model-only scores and a `warning`, never an error.
"""

import json
import logging
import os
from datetime import datetime

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from api.routers.predict import CONTEXT_FIELDS, FEATURE_HINTS, score_with_model
from api.schemas import CombinedScore, ContentAnalysis, ContentScore, PredictRequest, ScoreResponse
from api.services import gemini
from shared.features import PLATFORMS

router = APIRouter(tags=["predict"])
log = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 200 * 1024 * 1024
SUPPORTED_MEDIA = ("image/", "video/")


def model_weight() -> float:
    return min(max(float(os.getenv("SCORE_MODEL_WEIGHT") or 0.6), 0.0), 1.0)


@router.post("/score", response_model=ScoreResponse)
async def score_post(
    caption: str = Form(...),
    platforms: str = Form("youtube,tiktok,instagram"),
    planned_time: datetime | None = Form(None),
    context: str = Form("{}"),
    file: UploadFile | None = File(None),
) -> ScoreResponse:
    chosen = [p.strip().lower() for p in platforms.split(",") if p.strip()]
    unknown = [p for p in chosen if p not in PLATFORMS]
    if not chosen or unknown:
        raise HTTPException(422, f"platforms must be a comma-separated subset of {PLATFORMS}; got {unknown or 'none'}")
    try:
        ctx = {k: v for k, v in json.loads(context or "{}").items() if k in CONTEXT_FIELDS}
    except (json.JSONDecodeError, AttributeError):
        raise HTTPException(422, "context must be a JSON object") from None

    media, mime_type = None, None
    if file is not None and file.filename:
        mime_type = file.content_type or ""
        if not mime_type.startswith(SUPPORTED_MEDIA):
            raise HTTPException(415, f"only images and videos are supported, got {mime_type or 'unknown type'}")
        media = await file.read()
        if len(media) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, "file is larger than 200 MB")

    # 1) Our trained model
    req = PredictRequest(caption=caption, platforms=chosen, planned_time=planned_time, **ctx)
    model_result = score_with_model(req)
    model_scores = {s.platform: s.score for s in model_result.scores}
    hurting = sorted({f.feature for s in model_result.scores for f in s.top_factors if f.impact < 0 and f.feature in FEATURE_HINTS})

    # 2) Gemini content review (optional; falls back to model-only)
    analysis, warning = None, None
    if not gemini.is_configured():
        warning = "Gemini is not configured (GEMINI_API_KEY) - showing the model score only."
    else:
        try:
            analysis = await run_in_threadpool(
                gemini.analyze, chosen, caption, planned_time.isoformat() if planned_time else None, ctx,
                model_scores, [FEATURE_HINTS[f] for f in hurting], media, mime_type,
            )
        except Exception as e:
            log.exception("Gemini review failed")
            warning = f"Gemini review failed ({type(e).__name__}) - showing the model score only."

    # 3) Combine
    weight = model_weight()
    content_by_platform = {}
    if analysis:
        for item in analysis.platform_scores:
            p = item.platform.strip().lower()
            if p in chosen:
                content_by_platform[p] = ContentScore(platform=p, score=float(min(max(item.score, 0), 100)), reason=item.reason)

    scores = []
    for s in model_result.scores:
        content = content_by_platform.get(s.platform)
        combined = s.score if content is None else weight * s.score + (1 - weight) * content.score
        scores.append(CombinedScore(
            platform=s.platform, score=round(combined, 1), model_score=s.score,
            content_score=None if content is None else content.score, top_factors=s.top_factors,
        ))

    return ScoreResponse(
        scores=scores,
        suggestions=(analysis.suggestions[:3] if analysis and analysis.suggestions else model_result.suggestions),
        content=None if analysis is None else ContentAnalysis(
            summary=analysis.summary,
            hook=analysis.hook, visual_quality=analysis.visual_quality,
            clarity=analysis.clarity, trend_fit=analysis.trend_fit,
            platform_scores=list(content_by_platform.values()),
            strengths=analysis.strengths[:3],
        ),
        model_weight=weight,
        gemini_used=analysis is not None,
        warning=warning,
    )
