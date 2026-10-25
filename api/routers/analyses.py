"""Authenticated adapter from ViralPilot's report contract to the existing scorer.

Creation returns a complete job synchronously; the frontend also accepts this shape.
No synthetic pacing/format scores are manufactured; timestamped observations are Gemini's own
moments, validated against the video's duration.
"""

import io
import json
import logging
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from api.analysis_schemas import AnalysisJob, AnalysisReport, Observation, PublishingCopy, ReportPlatform, RewriteIn, VideoInfo
from api.routers.score import MAX_UPLOAD_BYTES, score_post
from api.services import db, gemini, model
from api.services.auth import require_user_id

def private_response(response: Response):
    response.headers["Cache-Control"] = "private, no-store"


router = APIRouter(prefix="/api/analyses", tags=["analyses"], dependencies=[Depends(private_response)])
log = logging.getLogger(__name__)
FORMATS = {"tiktok", "instagram", "shorts", "youtube"}


def _row(analysis_id: str, user_id: str) -> dict:
    if not re.fullmatch(r"[0-9a-f]{32}", analysis_id):
        raise HTTPException(404, "Report not found")
    rows = db.query("SELECT * FROM ANALYSES WHERE id = %s AND user_id = %s", (analysis_id, user_id))
    if not rows:
        raise HTTPException(404, "Report not found")
    return rows[0]


def _job(row: dict) -> AnalysisJob:
    return AnalysisJob(id=row["id"], result=AnalysisReport.model_validate_json(row["report"]))


@router.get("")
def list_analyses(user_id: str = Depends(require_user_id)) -> list[dict]:
    rows = db.query("SELECT id, report, created_at FROM ANALYSES WHERE user_id = %s "
                    "ORDER BY created_at DESC LIMIT 50", (user_id,))
    return [{"id": r["id"], "video": json.loads(r["report"])["video"], "createdAt": str(r["created_at"])}
            for r in rows]


@router.post("", response_model=AnalysisJob)
async def create_analysis(
    video: UploadFile = File(...),
    platforms: str = Form(...),
    metadata: str = Form(...),
    caption: str = Form(..., min_length=1, max_length=10000),
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
    for platform in {"youtube" if p == "shorts" else p for p in chosen}:
        if await run_in_threadpool(model.load_bundle, platform) is None:
            raise HTTPException(503, f"The {platform} prediction model is not installed")

    results = {}
    warnings = []
    summaries = []
    overall: list[str] = []
    observations: list[Observation] = []
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
            planned_time=None, context=json.dumps({"duration_sec": info.durationSeconds, "format": format_name}),
            file=UploadFile(io.BytesIO(media), filename=video.filename,
                            headers=video.headers), user_id=user_id, session_user_id=None,
        )
        content = response.content
        if response.warning:
            warnings.append(response.warning)
        if content:
            summaries.append(content.summary)
            # The Shorts review watches the same video; keep the first review's moments to avoid duplicates
            if not observations:
                observations = [Observation(id=f"m{i}", time=m.start, end=m.end, kind=m.issue, title=m.title,
                                            detail=m.problem, fix=m.fix) for i, m in enumerate(content.moments)]
        if not overall:  # the second (Shorts) review repeats much of the first in other words
            overall = response.suggestions
        for target in formats:
            source = "youtube" if target == "shorts" else target
            score = next(s for s in response.scores if s.platform == source)
            detail = next((s.reason for s in content.platform_scores if s.platform == source), "") if content else ""
            results[target] = ReportPlatform(
                id=target, score=score.score, modelScore=score.model_score, contentScore=score.content_score,
                geminiUsed=score.content_score is not None, hook=content.hook if content else None,
                modelWeight=response.model_weight if score.content_score is not None else 1.0,
                visualQuality=content.visual_quality if content else None, clarity=content.clarity if content else None,
                assessment=detail or "Statistical model estimate using caption, duration and linked account context. Media review is unavailable.",
                opportunities=response.suggestions, strengths=content.strengths if content else [],
                suggestions=PublishingCopy(caption=caption, edits=response.suggestions),
            )
    report = AnalysisReport(
        id=uuid.uuid4().hex, video=info, platforms=[results[p] for p in chosen],
        summary=" ".join(dict.fromkeys(summaries)) or "Model-only report. Gemini did not review this video.",
        warnings=list(dict.fromkeys(warnings)), observations=observations,
        overallSuggestions=overall[:5],
    )
    safe_name = f"{report.id}{Path(video.filename or 'video.mp4').suffix.lower()}"
    try:
        media_path = await run_in_threadpool(db.store_file, media, user_id, safe_name, db.ANALYSIS_STAGE)
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


@router.get("/{analysis_id}/video")
def get_video(analysis_id: str, user_id: str = Depends(require_user_id)):
    row = _row(analysis_id, user_id)
    path = row.get("media_path")
    if not path:
        raise HTTPException(404, "Video not found")
    if db.backend() == "sqlite":
        local = (db.ROOT / path).resolve()
        if not local.is_relative_to((db.LOCAL_UPLOADS / user_id).resolve()) or not local.is_file():
            raise HTTPException(404, "Video not found")
        return FileResponse(local, media_type=row["media_type"], headers={"Cache-Control": "private, no-store"})
    stage = db.ANALYSIS_STAGE if path.startswith(f"@{db.ANALYSIS_STAGE}/") else db.STAGE
    prefix = f"@{stage}/{user_id}/"
    if not path.startswith(prefix):
        raise HTTPException(404, "Video not found")
    relative = path[len(f"@{stage}/"):]
    rows = db.query(f"SELECT GET_PRESIGNED_URL(@{stage}, %s, 300) AS url", (relative,))
    return RedirectResponse(rows[0]["url"], headers={"Cache-Control": "private, no-store"})


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
