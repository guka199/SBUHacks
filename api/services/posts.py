"""One validated post format for CSV, YouTube, and the demo loader."""

import hashlib
import io
import json
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

import pandas as pd

from api.services.errors import InvalidImport
from shared.features import PLATFORMS

MAX_CSV_BYTES = 10 * 1024 * 1024
MAX_IMPORT_ROWS = 10_000
POST_COLUMNS = [
    "user_id", "platform", "format", "external_id", "caption", "posted_at",
    "thumbnail_url", "views", "likes", "comments", "shares", "followers",
]

# Canonical headers work on every platform. These are common export aliases;
# callers can also provide a column map in the command-line loader.
ALIASES = {
    "video title": "caption", "description": "caption", "post title": "caption",
    "post time": "posted_at", "publish time": "posted_at", "created date": "posted_at",
    "total views": "views", "impressions": "views", "playcount": "views",
    "total likes": "likes", "reactions": "likes", "diggcount": "likes",
    "total comments": "comments", "commentcount": "comments",
    "total shares": "shares", "reposts": "shares", "sharecount": "shares",
    "post id": "external_id", "video id": "external_id", "id": "external_id",
    "desc": "caption", "createtime": "posted_at", "followers count": "followers",
}


@dataclass
class PostBatch:
    frame: pd.DataFrame
    duplicates_skipped: int = 0


def validate_user_id(user_id: str) -> str:
    if not user_id or not user_id.strip() or len(user_id) > 128:
        raise InvalidImport("user_id must be 1-128 characters")
    return user_id.strip()


def _count(value, field: str, row: int, nullable: bool = False) -> int | None:
    if value is None or str(value).strip() == "":
        return None if nullable else 0
    try:
        n = Decimal(str(value).replace(",", "").strip())
        if not n.is_finite() or n < 0 or n != n.to_integral_value() or n > 2**63 - 1:
            raise InvalidOperation
        return int(n)
    except (InvalidOperation, ValueError):
        raise InvalidImport(f"Row {row}: {field} must be a nonnegative whole number") from None


def _date(value, row: int):
    if value is None or str(value).strip() == "":
        return None
    try:
        text = str(value).strip()
        if text.isdigit():
            timestamp = pd.to_datetime(int(text), unit="ms" if len(text) > 10 else "s", utc=True)
        else:
            timestamp = pd.to_datetime(value, utc=True)
        if pd.isna(timestamp):
            raise ValueError
        return timestamp.tz_convert(None).to_pydatetime()
    except (ValueError, TypeError, OverflowError):
        raise InvalidImport(f"Row {row}: posted_at must be an ISO timestamp or Unix seconds/milliseconds") from None


def normalize_posts(records: list[dict], user_id: str, platform: str | None = None,
                    column_map: dict[str, str] | None = None) -> PostBatch:
    user_id = validate_user_id(user_id)
    if not records:
        raise InvalidImport("The import contains no posts")
    if len(records) > MAX_IMPORT_ROWS:
        raise InvalidImport(f"Import at most {MAX_IMPORT_ROWS:,} posts at a time")
    if platform is not None and platform not in PLATFORMS:
        raise InvalidImport(f"platform must be one of {', '.join(PLATFORMS)}")

    rows = []
    for index, raw in enumerate(records, start=2):  # CSV row numbers include its header
        post = {}
        for key, value in raw.items():
            mapped = (column_map or {}).get(key, key).strip().lower()
            mapped = ALIASES.get(mapped, mapped)
            if mapped in post:
                raise InvalidImport(f"Ambiguous columns mapping to '{mapped}'")
            post[mapped] = value
        p = str(post.get("platform") or platform or "").strip().lower()
        if p not in PLATFORMS:
            raise InvalidImport(f"Row {index}: provide a valid platform column or select a platform")
        if platform and p != platform:
            raise InvalidImport(f"Row {index}: platform '{p}' conflicts with selected platform '{platform}'")
        caption = str(post.get("caption") or "").strip()
        if len(caption) > 50_000:
            raise InvalidImport(f"Row {index}: caption is longer than 50,000 characters")
        posted_at = _date(post.get("posted_at"), index)
        external_id = str(post.get("external_id") or "").strip()
        if not external_id:
            if not caption or posted_at is None:
                raise InvalidImport(f"Row {index}: provide external_id, or both caption and posted_at")
            # Metrics are deliberately excluded: importing refreshed stats updates this post.
            identity = json.dumps([p, caption, posted_at.isoformat(), post.get("format") or "unknown"], ensure_ascii=False)
            external_id = "csv-" + hashlib.sha256(identity.encode()).hexdigest()[:32]
        if len(external_id) > 512:
            raise InvalidImport(f"Row {index}: external_id is longer than 512 characters")
        post_format = str(post.get("format") or "unknown").strip().lower()
        if len(post_format) > 64:
            raise InvalidImport(f"Row {index}: format is longer than 64 characters")
        row = {
            "user_id": user_id, "platform": p, "external_id": external_id,
            "caption": caption, "posted_at": posted_at,
            "format": post_format,
            "thumbnail_url": post.get("thumbnail_url") or None,
            **{name: _count(post.get(name), name, index, name == "followers")
               for name in ["views", "likes", "comments", "shares", "followers"]},
            "raw_payload": json.dumps(raw.get("_raw_payload", raw), default=str, ensure_ascii=False, allow_nan=False),
        }
        rows.append(row)
    frame = pd.DataFrame(rows, columns=POST_COLUMNS + ["raw_payload"])
    # Nullable integer columns must not become floats when they contain missing values.
    for name in ["views", "likes", "comments", "shares", "followers"]:
        frame[name] = pd.array(frame[name], dtype="Int64")
    frame["posted_at"] = pd.to_datetime(frame["posted_at"])
    frame = frame.drop_duplicates(["user_id", "platform", "external_id"], keep="last").reset_index(drop=True)
    return PostBatch(frame, len(rows) - len(frame))


def read_csv(content: bytes, user_id: str, platform: str | None = None,
             column_map: dict[str, str] | None = None) -> PostBatch:
    if len(content) > MAX_CSV_BYTES:
        raise InvalidImport("CSV is larger than 10 MB")
    try:
        frame = pd.read_csv(io.BytesIO(content), dtype=str, keep_default_na=False, encoding="utf-8-sig",
                            nrows=MAX_IMPORT_ROWS + 1)
    except (pd.errors.ParserError, pd.errors.EmptyDataError, UnicodeDecodeError, ValueError):
        raise InvalidImport("Upload a valid UTF-8 CSV file with a header row") from None
    return normalize_posts(frame.to_dict("records"), user_id, platform, column_map)
