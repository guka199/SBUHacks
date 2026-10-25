"""Authenticated adapter from ViralPilot's report contract to the existing scorer.

Creation returns a complete job synchronously; the frontend also accepts this shape.
No synthetic pacing/format scores are manufactured; timestamped observations are Gemini's own
moments, validated against the video's duration.
"""

import asyncio
import io
import json
import logging
import re
import uuid
from datetime import timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from api.analysis_schemas import (AnalysisJob, AnalysisReport, Observation, PostingIn, PublishingCopy, ReportPlatform,
                                  RewriteIn,
                                  ThumbnailComparison, ThumbnailPick, ThumbnailReview, VideoInfo)
from api.routers.score import MAX_UPLOAD_BYTES, score_post
from api.services import db, gemini, model, posting
from api.services.auth import require_user_id

def private_response(response: Response):
    response.headers["Cache-Control"] = "private, no-store"


router = APIRouter(prefix="/api/analyses", tags=["analyses"], dependencies=[Depends(private_response)])
log = logging.getLogger(__name__)
FORMATS = {"tiktok", "instagram", "shorts", "youtube"}
MAX_THUMBNAILS = 3
MAX_THUMBNAIL_BYTES = 10 * 1024 * 1024
THUMBNAIL_TYPES = {"image/jpeg": ("JPEG", ".jpg"), "image/png": ("PNG", ".png"), "image/webp": ("WEBP", ".webp")}


async def _read_thumbnails(files: list[UploadFile]) -> list[dict]:
    """Validate 0-3 thumbnail images (type, size, real decodable image) and read their pixel size."""
    return await read_images(files, MAX_THUMBNAILS, "thumbnails")


async def read_images(files: list[UploadFile], limit: int, label: str) -> list[dict]:
    """Validate up to `limit` JPEG/PNG/WebP images (type, 10 MB each, really decodable) and read their pixel size."""
    from PIL import Image

    files = [f for f in files if f.filename]
    if len(files) > limit:
        raise HTTPException(422, f"Upload at most {limit} {label}")
    images = []
    for file in files:
        mime = file.content_type or ""
        if mime not in THUMBNAIL_TYPES:
            raise HTTPException(415, f"{label.capitalize()} must be JPEG, PNG or WebP images")
        data = await file.read(MAX_THUMBNAIL_BYTES + 1)
        if len(data) > MAX_THUMBNAIL_BYTES:
            raise HTTPException(413, "Each image must be 10 MB or smaller")
        try:
            with Image.open(io.BytesIO(data)) as image:
                if image.format != THUMBNAIL_TYPES[mime][0]:
                    raise ValueError
                width, height = image.size
        except Exception:
            raise HTTPException(415, f"{file.filename} is not a readable {THUMBNAIL_TYPES[mime][0]} image") from None
        images.append({"data": data, "mime_type": mime, "name": Path(file.filename).name[:255],
                       "width": width, "height": height})
    return images


def _thumbnail_report(chosen: list[str], images: list[dict], comparison) -> ThumbnailComparison:
    """Map Gemini's per-thumbnail scores onto the report; the best per platform is the highest score there."""
    items = []
    for index, image in enumerate(images):
        review = next((t for t in comparison.thumbnails if t.number == index + 1), None)
        scores, reasons = {}, {}
        for entry in review.scores if review else []:
            platform = entry.platform.strip().lower()
            if platform in chosen:
                scores[platform] = float(min(max(entry.score, 0), 100))
                reasons[platform] = entry.reason
        items.append(ThumbnailReview(
            index=index, name=image["name"], mimeType=image["mime_type"], width=image["width"],
            height=image["height"], scores=scores, reasons=reasons,
            strengths=review.strengths[:2] if review else [], improvements=review.improvements[:2] if review else [],
        ))
    picks = []
    for platform in chosen:
        scored = [item for item in items if platform in item.scores]
        if scored:
            best = max(scored, key=lambda item: item.scores[platform])  # ties keep the earlier thumbnail
            picks.append(ThumbnailPick(platform=platform, index=best.index, reason=best.reasons[platform]))
    if not picks:
        raise ValueError("Gemini returned no thumbnail scores")
    return ThumbnailComparison(summary=comparison.summary, items=items, picks=picks)


def _thumbnail_name(report_id: str, index: int, mime: str) -> str:
    return f"{report_id}_thumb{index}{THUMBNAIL_TYPES[mime][1]}"


def _row(analysis_id: str, user_id: str) -> dict:
    if not re.fullmatch(r"[0-9a-f]{32}", analysis_id):
        raise HTTPException(404, "Report not found")
    rows = db.query("SELECT * FROM ANALYSES WHERE id = %s AND user_id = %s", (analysis_id, user_id))
    if not rows:
        raise HTTPException(404, "Report not found")
    return rows[0]


def _job(row: dict) -> AnalysisJob:
    if json.loads(row["report"]).get("kind") == "post":  # photo posts have their own router
        raise HTTPException(404, "Report not found")
    return AnalysisJob(id=row["id"], result=AnalysisReport.model_validate_json(row["report"]))


@router.get("")
def list_analyses(user_id: str = Depends(require_user_id)) -> list[dict]:
    rows = db.query("SELECT id, caption, report, created_at FROM ANALYSES WHERE user_id = %s "
                    "ORDER BY created_at DESC LIMIT 50", (user_id,))
    items = []
    for r in rows:
        report = json.loads(r["report"])
        caption = " ".join((r.get("caption") or "").split())[:140]  # one line for the list
        if report.get("kind") == "post":
            first = report["variants"][0]
            items.append({"id": r["id"], "kind": "post", "caption": caption, "createdAt": str(r["created_at"]),
                          "post": {"caption": first["caption"][:120], "variants": len(report["variants"]),
                                   "images": len(first["images"])}})
        else:
            items.append({"id": r["id"], "kind": "video", "caption": caption, "video": report["video"],
                          "createdAt": str(r["created_at"])})
    return items


@router.post("", response_model=AnalysisJob)
async def create_analysis(
    video: UploadFile = File(...),
    platforms: str = Form(...),
    metadata: str = Form(...),
    caption: str = Form(..., min_length=1, max_length=10000),
    thumbnails: list[UploadFile] = File(default=[]),
    posting_plan: str = Form("{}", alias="posting", max_length=2000),
    user_id: str = Depends(require_user_id),
) -> AnalysisJob:
    try:
        chosen = json.loads(platforms)
        info = VideoInfo.model_validate_json(metadata)
        if (not isinstance(chosen, list) or not chosen or len(chosen) > 4
                or any(not isinstance(p, str) or p not in FORMATS for p in chosen)
                or len(set(chosen)) != len(chosen)):
            raise ValueError
    except (ValueError, TypeError, ValidationError):
        raise HTTPException(422, "Choose unique supported platforms and valid video metadata") from None
    try:
        plan = posting.validate(PostingIn.model_validate_json(posting_plan or "{}"))
    except (ValueError, ValidationError):
        raise HTTPException(422, "Choose a valid country and posting time") from None
    caption = caption.strip()
    if not caption:
        raise HTTPException(422, "Add a caption or title for your video")
    mime = video.content_type or ""
    if mime not in ("video/mp4", "video/webm", "video/quicktime"):
        raise HTTPException(415, "Choose an MP4, WebM or MOV video")
    media = await video.read(MAX_UPLOAD_BYTES + 1)
    if len(media) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Video is larger than 200 MB")
    valid_header = (media.startswith(b"\x1aE\xdf\xa3") if mime == "video/webm"
                    else len(media) >= 12 and media[4:8] in (b"ftyp", b"moov", b"wide", b"mdat"))
    if not valid_header:
        raise HTTPException(415, "The file does not have a supported video container")
    images = await _read_thumbnails(thumbnails)
    for platform in {"youtube" if p == "shorts" else p for p in chosen}:
        if await run_in_threadpool(model.load_bundle, platform) is None:
            raise HTTPException(503, f"The {platform} prediction model is not installed")

    results = {}
    warnings = []
    # The thumbnail comparison doesn't need the video review, so it runs alongside it.
    thumbnail_task = None
    if images and gemini.is_configured():
        thumbnail_task = asyncio.create_task(run_in_threadpool(gemini.compare_thumbnails, chosen, caption, images))
    elif images:
        warnings.append("Thumbnail feedback needs Gemini (GEMINI_API_KEY), which is not configured.")
    posting_task = None
    if gemini.is_configured():
        posting_task = asyncio.create_task(run_in_threadpool(posting.advise, user_id, chosen, caption, plan))
    elif plan.country or plan.plannedTime:
        warnings.append("Posting-time advice needs Gemini (GEMINI_API_KEY), which is not configured.")
    # The model's timing features were learned from UTC timestamps
    planned_utc = plan.plannedTime.astimezone(timezone.utc) if plan.plannedTime else None
    summaries = []
    overall: list[str] = []
    observations: list[Observation] = []
    hook_review = None
    clarity_review = pacing_review = None
    # Shorts is a format of YouTube, with the same trained model and the real duration.
    # Review it separately so Gemini receives the requested short-form context.
    groups = [([p for p in chosen if p != "shorts"], "video")]
    if "shorts" in chosen:
        groups.append((["shorts"], "short"))
    for formats, format_name in groups:
        if not formats:
            continue
        response = await score_post(
            background=BackgroundTasks(), caption=caption,
            platforms=",".join("youtube" if p == "shorts" else p for p in formats),
            planned_time=planned_utc, context=json.dumps({"duration_sec": info.durationSeconds, "format": format_name,
                                                      "width": info.width, "height": info.height}),
            file=UploadFile(io.BytesIO(media), filename=video.filename,
                            headers=video.headers), user_id=user_id, session_user_id=None,
        )
        content = response.content
        if response.warning:
            warnings.append(response.warning)
        if content:
            summaries.append(content.summary)
            if hook_review is None:
                hook_review = content.hook_analysis
            # Same video in every review group: keep the first clarity/pacing review that came back
            if clarity_review is None:
                clarity_review = content.clarity_analysis
            if pacing_review is None:
                pacing_review = content.pacing_analysis
            # The Shorts review watches the same video; keep the first review's moments to avoid duplicates
            if not observations:
                observations = [Observation(id=f"m{i}", time=m.start, end=m.end, kind=m.issue, title=m.title,
                                            detail=m.problem, fix=m.fix) for i, m in enumerate(content.moments)]
        if not overall:  # the second (Shorts) review repeats much of the first in other words
            overall = response.suggestions
        for target in formats:
            source = "youtube" if target == "shorts" else target
            score = next(s for s in response.scores if s.platform == source)
            review = next((s for s in content.platform_scores if s.platform == source), None) if content else None
            detail = review.reason if review else ""
            # Per-platform hook / visual / clarity, falling back to the review's overall values (older reviews)
            per_platform = lambda field: (getattr(review, field, None) if review and getattr(review, field, None)
                                          is not None else getattr(content, field) if content else None)
            results[target] = ReportPlatform(
                id=target, score=score.score, modelScore=score.model_score, contentScore=score.content_score,
                geminiUsed=score.content_score is not None, hook=per_platform("hook"),
                modelWeight=response.model_weight if score.content_score is not None else 1.0,
                visualQuality=per_platform("visual_quality"), clarity=per_platform("clarity"),
                assessment=detail or "Statistical model estimate using caption, duration and linked account context. Media review is unavailable.",
                opportunities=response.suggestions, strengths=content.strengths if content else [],
                suggestions=PublishingCopy(caption=caption, edits=response.suggestions),
            )
    thumbnail_report = None
    if thumbnail_task:
        try:
            thumbnail_report = _thumbnail_report(chosen, images, await thumbnail_task)
        except Exception as exc:
            log.warning("Thumbnail comparison failed: %s", type(exc).__name__)
            warnings.append("Gemini could not compare your thumbnails this time. Try again to get thumbnail feedback.")
    posting_advice = None
    if posting_task:
        try:
            posting_advice = await posting_task
        except Exception as exc:
            log.warning("Posting advice failed: %s", type(exc).__name__)
            if plan.country or plan.plannedTime:
                warnings.append("Gemini could not plan your posting time this time. Try again to get timing advice.")
    report = AnalysisReport(
        id=uuid.uuid4().hex, video=info, platforms=[results[p] for p in chosen],
        summary=" ".join(dict.fromkeys(summaries)) or "Model-only report. Gemini did not review this video.",
        warnings=list(dict.fromkeys(warnings)), observations=observations,
        overallSuggestions=overall[:5], thumbnails=thumbnail_report, hookAnalysis=hook_review,
        clarityAnalysis=clarity_review, pacingAnalysis=pacing_review,
        posting=posting_advice,
    )
    safe_name = f"{report.id}{Path(video.filename or 'video.mp4').suffix.lower()}"
    try:
        media_path = await run_in_threadpool(db.store_file, media, user_id, safe_name, db.ANALYSIS_STAGE)
        if thumbnail_report:
            for index, image in enumerate(images):
                await run_in_threadpool(db.store_file, image["data"], user_id,
                                        _thumbnail_name(report.id, index, image["mime_type"]), db.ANALYSIS_STAGE)
        await run_in_threadpool(
            db.execute, "INSERT INTO ANALYSES (id, user_id, caption, report, media_path, media_type, created_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (report.id, user_id, caption, report.model_dump_json(), media_path, mime, db.now()),
        )
    except Exception:
        log.exception("Could not save analysis")
        raise HTTPException(503, "Could not save your report. Please try again when storage is available") from None
    return AnalysisJob(id=report.id, result=report)


@router.get("/{analysis_id}", response_model=AnalysisJob)
def get_analysis(analysis_id: str, user_id: str = Depends(require_user_id)) -> AnalysisJob:
    return _job(_row(analysis_id, user_id))


def _serve(path: str | None, media_type: str, user_id: str, label: str):
    """Serve one of the owner's stored files: locally from data/uploads, else a short-lived presigned stage URL."""
    if not path:
        raise HTTPException(404, f"{label} not found")
    if db.backend() == "sqlite":
        local = (db.ROOT / path).resolve()
        if not local.is_relative_to((db.LOCAL_UPLOADS / user_id).resolve()) or not local.is_file():
            raise HTTPException(404, f"{label} not found")
        return FileResponse(local, media_type=media_type, headers={"Cache-Control": "private, no-store"})
    stage = db.ANALYSIS_STAGE if path.startswith(f"@{db.ANALYSIS_STAGE}/") else db.STAGE
    prefix = f"@{stage}/{user_id}/"
    if not path.startswith(prefix):
        raise HTTPException(404, f"{label} not found")
    relative = path[len(f"@{stage}/"):]
    rows = db.query(f"SELECT GET_PRESIGNED_URL(@{stage}, %s, 300) AS url", (relative,))
    return RedirectResponse(rows[0]["url"], headers={"Cache-Control": "private, no-store"})


@router.get("/{analysis_id}/video")
def get_video(analysis_id: str, user_id: str = Depends(require_user_id)):
    row = _row(analysis_id, user_id)
    return _serve(row.get("media_path"), row["media_type"], user_id, "Video")


@router.get("/{analysis_id}/thumbnails/{index}")
def get_thumbnail(analysis_id: str, index: int, user_id: str = Depends(require_user_id)):
    report = _job(_row(analysis_id, user_id)).result
    item = next((t for t in report.thumbnails.items if t.index == index), None) if report.thumbnails else None
    if item is None:
        raise HTTPException(404, "Thumbnail not found")
    name = _thumbnail_name(analysis_id, index, item.mimeType)
    path = (str((db.LOCAL_UPLOADS / user_id / name).relative_to(db.ROOT)) if db.backend() == "sqlite"
            else f"@{db.ANALYSIS_STAGE}/{user_id}/{name}")
    return _serve(path, item.mimeType, user_id, "Thumbnail")


@router.post("/{analysis_id}/rewrite")
def rewrite(analysis_id: str, request: RewriteIn, user_id: str = Depends(require_user_id)) -> dict:
    row = _row(analysis_id, user_id)
    report = _job(row).result
    platform = next((p for p in report.platforms if p.id == request.platform), None)
    if platform is None:
        raise HTTPException(422, "This platform is not in the report")
    if not gemini.is_configured():
        raise HTTPException(503, "Gemini is not configured for publishing copy")
    try:
        suggestions = gemini.rewrite_copy(row["caption"], request.platform, request.tone, report.summary,
                                           platform.opportunities)
    except Exception as exc:
        log.warning("Publishing copy generation failed: %s", type(exc).__name__)
        raise HTTPException(502, "Could not generate publishing copy. Please try again") from None
    platform.suggestions = suggestions
    # Reload before updating so already-completed rewrites for other platforms are retained.
    latest = _job(_row(analysis_id, user_id)).result
    next(p for p in latest.platforms if p.id == request.platform).suggestions = suggestions
    db.execute("UPDATE ANALYSES SET report = %s WHERE id = %s AND user_id = %s",
               (latest.model_dump_json(), analysis_id, user_id))
    return {"suggestions": suggestions.model_dump()}
