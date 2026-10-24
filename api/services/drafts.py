"""Drafts users scored on /score: caption, media file, scores and suggestions (Snowflake or local SQLite)."""

import json
import logging
import uuid

from api.services import db

log = logging.getLogger(__name__)


def save_draft(user_id: str, caption: str, platforms: list[str], planned_time: str | None,
               media: bytes | None, media_name: str | None, media_type: str | None, response: dict) -> None:
    """Store one scored draft. Runs as a background task after /score responds; never raises."""
    draft_id = uuid.uuid4().hex
    try:
        media_path = db.store_file(media, user_id, f"{draft_id}_{media_name or 'upload'}") if media else None
        db.execute(
            "INSERT INTO DRAFTS (id, user_id, caption, platforms, planned_time, media_name, media_type, media_bytes, "
            "media_path, scores, suggestions, content_review, gemini_used, created_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (draft_id, user_id, caption, ",".join(platforms), planned_time, media_name, media_type,
             len(media) if media else None, media_path, json.dumps(response["scores"]),
             json.dumps(response["suggestions"]), json.dumps(response.get("content") or {}),
             bool(response.get("gemini_used")), db.now()),
        )
    except Exception:
        log.exception("could not save draft for user %s", user_id)


def list_drafts(user_id: str, limit: int = 50) -> list[dict]:
    rows = db.query(
        "SELECT id, caption, platforms, planned_time, media_name, media_type, media_path, scores, suggestions, "
        "content_review, gemini_used, created_at FROM DRAFTS WHERE user_id = %s ORDER BY created_at DESC LIMIT %s",
        (user_id, limit),
    )
    for r in rows:
        for f in ("scores", "suggestions", "content_review"):
            r[f] = json.loads(r[f]) if r.get(f) else None
        r["platforms"] = (r.get("platforms") or "").split(",")
        r["created_at"] = str(r["created_at"])
        r["planned_time"] = str(r["planned_time"]) if r.get("planned_time") else None
    return rows
