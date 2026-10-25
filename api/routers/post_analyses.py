"""Photo posts (single image or carousel): up to 3 variants in the user's chosen image order.

Our model scores each variant's caption (with "image post" context); Gemini sees every variant's images in one call so
the content scores are comparable. Combined like videos (SCORE_MODEL_WEIGHT). Saved in ANALYSES with kind "post".
"""

import asyncio
import io
import json
import logging
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from api.analysis_schemas import PostImage, PostPick, PostPlatformScore, PostReport, PostVariant, SlideNote
from api.routers.analyses import THUMBNAIL_TYPES, _row, _serve, private_response, read_images
from api.routers.predict import score_with_model
from api.routers.score import model_weight
from api.schemas import PredictRequest
from api.services import accounts, db, gemini, model
from api.services.auth import require_user_id

router = APIRouter(prefix="/api/post-analyses", tags=["post analyses"], dependencies=[Depends(private_response)])
log = logging.getLogger(__name__)
FORMATS = ("instagram", "linkedin", "tiktok")
MAX_VARIANTS = 3
MAX_IMAGES = 10  # per variant
REVIEW_EDGE = 1280  # images are downscaled for Gemini so 30 of them fit in one request


def _for_review(image: dict) -> dict:
    from PIL import Image

    with Image.open(io.BytesIO(image["data"])) as source:
        copy = source.convert("RGB")
        copy.thumbnail((REVIEW_EDGE, REVIEW_EDGE))
        out = io.BytesIO()
        copy.save(out, "JPEG", quality=85)
    return {**image, "data": out.getvalue(), "mime_type": "image/jpeg"}


def _image_name(report_id: str, variant: int, index: int, mime: str) -> str:
    return f"{report_id}_v{variant}_{index}{THUMBNAIL_TYPES[mime][1]}"


def _order(numbers: list[int], count: int) -> list[int] | None:
    """Gemini's 1-based order -> 0-based indices; None if invalid or already the uploaded order."""
    if sorted(numbers) != list(range(1, count + 1)) or numbers == sorted(numbers):
        return None
    return [n - 1 for n in numbers]


def _parse(platforms: str, captions: str) -> tuple[list[str], list[str]]:
    try:
        chosen, texts = json.loads(platforms), json.loads(captions)
        if (not isinstance(chosen, list) or not chosen or len(set(chosen)) != len(chosen)
                or any(p not in FORMATS for p in chosen)):
            raise ValueError
        if not isinstance(texts, list) or not 1 <= len(texts) <= MAX_VARIANTS or any(not isinstance(t, str) for t in texts):
            raise ValueError
    except (ValueError, TypeError):
        raise HTTPException(422, "Choose Instagram, LinkedIn and/or TikTok, and 1-3 post variants") from None
    texts = [t.strip() for t in texts]
    if any(not t or len(t) > 10000 for t in texts):
        raise HTTPException(422, "Add a caption to every variant")
    return chosen, texts


@router.post("", response_model=PostReport)
async def create_post_analysis(
    platforms: str = Form(...),
    captions: str = Form(..., max_length=40000),  # JSON list, one caption per variant
    variant0: list[UploadFile] = File(default=[]),
    variant1: list[UploadFile] = File(default=[]),
    variant2: list[UploadFile] = File(default=[]),
    user_id: str = Depends(require_user_id),
) -> PostReport:
    chosen, texts = _parse(platforms, captions)
    uploads = [variant0, variant1, variant2]
    if any(f.filename for files in uploads[len(texts):] for f in files):
        raise HTTPException(422, "Images were sent for a variant without a caption")
    variants = []
    for files in uploads[:len(texts)]:
        images = await read_images(files, MAX_IMAGES, f"images per variant")
        if not images:
            raise HTTPException(422, "Add at least one image to every variant")
        variants.append(images)
    for platform in chosen:
        if await run_in_threadpool(model.load_bundle, platform) is None:
            raise HTTPException(503, f"The {platform} prediction model is not installed")

    warnings: list[str] = []
    review_task = None
    if gemini.is_configured():
        profile = await run_in_threadpool(accounts.audience_summary, user_id) or "not specified"
        reviews = await run_in_threadpool(lambda: [{"caption": text, "images": [_for_review(i) for i in images]}
                                                   for text, images in zip(texts, variants)])
        review_task = asyncio.create_task(run_in_threadpool(gemini.compare_posts, chosen, reviews, profile))
    else:
        warnings.append("Gemini is not configured (GEMINI_API_KEY) - showing caption-model scores only.")

    model_results = []
    for text, images in zip(texts, variants):
        request = PredictRequest(caption=text, platforms=chosen, format="carousel" if len(images) > 1 else "image")
        model_results.append(await run_in_threadpool(score_with_model, request, user_id))

    comparison = None
    if review_task:
        try:
            comparison = await review_task
        except Exception as exc:
            log.warning("Post review failed: %s", type(exc).__name__)
            warnings.append(f"Gemini review failed ({type(exc).__name__}) - showing caption-model scores only.")

    weight = model_weight()
    report_id = uuid.uuid4().hex
    built = []
    for v, (text, images, result) in enumerate(zip(texts, variants, model_results)):
        review = next((r for r in comparison.variants if r.variant == v + 1), None) if comparison else None
        content = {}
        for item in review.platform_scores if review else []:
            name = item.platform.strip().lower()
            if name in chosen:
                content[name] = (float(min(max(item.score, 0), 100)), item.reason)
        scores = []
        for s in result.scores:
            content_score, reason = content.get(s.platform, (None, ""))
            combined = s.score if content_score is None else weight * s.score + (1 - weight) * content_score
            scores.append(PostPlatformScore(id=s.platform, score=round(combined, 1), modelScore=s.score,
                                            contentScore=content_score, reason=reason))
        slides = [SlideNote(index=n.image - 1, verdict=n.verdict, feedback=n.feedback)
                  for n in (review.slides if review else []) if 1 <= n.image <= len(images)]
        built.append(PostVariant(
            index=v, caption=text,
            images=[PostImage(index=i, name=img["name"], mimeType=img["mime_type"], width=img["width"],
                              height=img["height"]) for i, img in enumerate(images)],
            summary=review.summary if review else "", hook=review.hook if review else None,
            visualQuality=review.visual_quality if review else None, clarity=review.clarity if review else None,
            platforms=sorted(scores, key=lambda p: chosen.index(p.id)),
            strengths=review.strengths[:3] if review else [],
            suggestions=review.suggestions[:3] if review else result.suggestions[:3],
            slides=slides, suggestedOrder=_order(review.suggested_order, len(images)) if review else None,
            orderReason=review.order_reason if review else "",
        ))
    picks = []
    for platform in chosen:
        best = max(built, key=lambda b: next(p.score for p in b.platforms if p.id == platform))  # ties: earlier
        score = next(p for p in best.platforms if p.id == platform)
        picks.append(PostPick(platform=platform, variant=best.index,
                              reason=score.reason or "Highest caption-model score (images were not reviewed)."))
    report = PostReport(
        id=report_id, platforms=chosen, variants=built, picks=picks, modelWeight=weight,
        geminiUsed=comparison is not None, warnings=warnings,
        summary=comparison.summary if comparison else "Caption-model report. Gemini did not review the images.",
    )
    try:
        files = [(img["data"], _image_name(report_id, v, i, img["mime_type"]))
                 for v, images in enumerate(variants) for i, img in enumerate(images)]
        paths = await run_in_threadpool(db.store_files, files, user_id, db.ANALYSIS_STAGE)
        await run_in_threadpool(
            db.execute, "INSERT INTO ANALYSES (id, user_id, caption, report, media_path, media_type, created_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (report_id, user_id, texts[0], report.model_dump_json(), paths[0], variants[0][0]["mime_type"], db.now()),
        )
    except Exception:
        log.exception("Could not save post analysis")
        raise HTTPException(503, "Could not save your report. Please try again when storage is available") from None
    return report


def _report(analysis_id: str, user_id: str) -> PostReport:
    row = _row(analysis_id, user_id)
    if json.loads(row["report"]).get("kind") != "post":
        raise HTTPException(404, "Report not found")
    return PostReport.model_validate_json(row["report"])


@router.get("/{analysis_id}", response_model=PostReport)
def get_post_analysis(analysis_id: str, user_id: str = Depends(require_user_id)) -> PostReport:
    return _report(analysis_id, user_id)


@router.get("/{analysis_id}/images/{variant}/{index}")
def get_post_image(analysis_id: str, variant: int, index: int, user_id: str = Depends(require_user_id)):
    report = _report(analysis_id, user_id)
    found = next((v for v in report.variants if v.index == variant), None)
    image = next((i for i in found.images if i.index == index), None) if found else None
    if image is None:
        raise HTTPException(404, "Image not found")
    name = _image_name(analysis_id, variant, index, image.mimeType)
    path = (str((db.LOCAL_UPLOADS / user_id / name).relative_to(db.ROOT)) if db.backend() == "sqlite"
            else f"@{db.ANALYSIS_STAGE}/{user_id}/{name}")
    return _serve(path, image.mimeType, user_id, "Image")
