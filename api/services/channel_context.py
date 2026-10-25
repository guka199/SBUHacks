"""Bounded, owner-scoped evidence for follow-up ideas. No media is re-uploaded.

Published outcomes and unpublished model/Gemini reviews stay explicitly separate.
View ratios compare only same-platform, same-format posts in broad age cohorts.
"""

import hashlib
import json
import math
import re
from collections import defaultdict
from datetime import datetime, timezone
from statistics import median

from api.idea_schemas import ChannelAccount, ChannelContext, ChannelSource, CreatorProfile, IdeaPlatform
from api.services import accounts, db

POST_LIMIT = 50
MAX_POST_SOURCES = 30
REVIEW_LIMIT = 10


def text(value, limit: int = 700) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def normalized(value: str) -> str:
    return " ".join(re.findall(r"\w+", value.casefold()))


def _date(value) -> datetime | None:
    if value is None:
        return None
    try:
        result = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result.astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


def _iso(value) -> str | None:
    date = _date(value)
    return date.isoformat() if date else None


def _number(value, *, integer=False):
    try:
        number = float(value)
        if not math.isfinite(number) or number < 0:
            return None
        return int(number) if integer else number
    except (TypeError, ValueError, OverflowError):
        return None


def _json(value, expected):
    try:
        parsed = json.loads(value) if isinstance(value, str) else value
        return parsed if isinstance(parsed, expected) else None
    except (ValueError, TypeError):
        return None


def _notes(value) -> list[str]:
    return [text(v, 250) for v in value[:6] if text(v, 250)] if isinstance(value, list) else []


def _truth(value) -> bool:
    return value is True or value == 1 or (isinstance(value, str) and value.lower() == "true")


def _age_group(days: float | None) -> str | None:
    if days is None or days < 7:
        return None
    if days <= 30:
        return "7–30 days old"
    if days <= 90:
        return "31–90 days old"
    if days <= 365:
        return "91–365 days old"
    return "over 365 days old"


def _published(rows: list[dict], now: datetime) -> list[ChannelSource]:
    sources = []
    seen = set()
    for row in rows:
        caption = text(row.get("caption"))
        if not caption:
            continue
        platform = text(row.get("platform"), 30)
        external_id = text(row.get("external_id"), 150)
        date = _date(row.get("posted_at"))
        captured = _date(row.get("loaded_at"))
        if date and date > now:
            continue
        identity = external_id or hashlib.sha256(f"{caption}:{date}".encode()).hexdigest()[:24]
        source_id = f"post:{platform}:{identity}"
        if source_id in seen:
            continue
        seen.add(source_id)
        sources.append(ChannelSource(
            id=source_id, kind="published_post", platform=platform,
            format=text(row.get("format"), 30) or None, title=caption[:140], text=caption,
            published_at=_iso(date), updated_at=_iso(row.get("loaded_at")),
            age_days=round((now-date).total_seconds()/86400, 1) if date else None,
            age_days_at_snapshot=(captured-date).total_seconds()/86400 if date and captured and date <= captured <= now else None,
            views=_number(row.get("views"), integer=True), likes=_number(row.get("likes"), integer=True),
            comments=_number(row.get("comments"), integer=True), shares=_number(row.get("shares"), integer=True),
            url=f"https://www.youtube.com/watch?v={external_id}" if platform == "youtube" and re.fullmatch(r"[\w-]{11}", external_id, re.ASCII) else None,
        ))
    return sources


def compare_views(sources: list[ChannelSource]) -> None:
    groups = defaultdict(list)
    for source in sources:
        age_group = _age_group(source.age_days_at_snapshot)
        if source.kind == "published_post" and source.format and age_group and source.views is not None:
            groups[(source.platform, source.format, age_group)].append(source)
    for (_, _, label), cohort in groups.items():
        baseline = median(source.views for source in cohort)
        if len(cohort) < 3 or baseline <= 0:
            continue
        for source in cohort:
            source.relative_views = round(source.views / baseline, 2)
            source.comparison_count = len(cohort)
            source.comparison_median_views = baseline
            source.comparison_label = label + " at statistics snapshot"


def build_context(user_id: str, platform: IdeaPlatform | None = None, *, now: datetime | None = None) -> ChannelContext:
    now = _date(now) or datetime.now(timezone.utc)
    profile = accounts.get_user(user_id) or {}
    linked = accounts.list_accounts(user_id)
    warnings = [
        "Published view counts are lifetime snapshots, not equal-age outcomes or forecasts.",
        "Draft reviews are AI judgments, not evidence of published performance.",
    ]
    account_context = []
    for account in linked[:5]:
        audience = account.get("audience") or {}
        cleaned = {}
        if isinstance(audience, dict):
            for key in ("age_range", "interests", "language"):
                if value := text(audience.get(key), 250):
                    cleaned[key] = value
            countries = audience.get("top_countries")
            if isinstance(countries, list):
                cleaned["top_countries"] = [text(c, 60) for c in countries[:5] if text(c, 60)]
            female = _number(audience.get("percent_female"))
            if female is not None and female <= 100:
                cleaned["percent_female"] = female
        account_context.append(ChannelAccount(
            platform=text(account.get("platform"), 30), followers=_number(account.get("followers"), integer=True),
            typical_views=_number(account.get("typical_views")), audience=cleaned,
            refreshed_at=_iso(account.get("updated_at")),
        ))
    posts = db.query(
        "SELECT platform, external_id, caption, format, posted_at, loaded_at, views, likes, comments, shares "
        "FROM POSTS WHERE user_id = %s ORDER BY posted_at DESC LIMIT %s", (user_id, POST_LIMIT),
    )
    published = _published(posts[:POST_LIMIT], now)
    compare_views(published)
    # Retain recent content and a few stronger observations from eligible cohorts.
    stronger = sorted((p for p in published if p.relative_views is not None), key=lambda p: p.relative_views, reverse=True)[:6]
    chosen = published[:24]
    known = {p.id for p in chosen}
    chosen += [p for p in stronger if p.id not in known]
    chosen_ids = {p.id for p in chosen}
    chosen += [p for p in published if p.id not in chosen_ids][:max(0, MAX_POST_SOURCES-len(chosen))]
    sources = chosen[:MAX_POST_SOURCES]
    reports = db.query(
        "SELECT id, caption, report, created_at FROM ANALYSES WHERE user_id = %s ORDER BY created_at DESC LIMIT %s",
        (user_id, REVIEW_LIMIT),
    )
    review_captions = set()
    unreadable = False
    for row in reports[:REVIEW_LIMIT]:
        report = _json(row.get("report"), dict)
        caption = text(row.get("caption"))
        if not report or not caption or not re.fullmatch(r"[0-9a-f]{32}", str(row.get("id", ""))):
            unreadable = True
            continue
        key = normalized(caption)
        if key in review_captions:
            continue
        review_captions.add(key)
        variants = report.get("platforms")
        variants = [p for p in variants if isinstance(p, dict)] if isinstance(variants, list) else []
        preferred = next((p for p in variants if p.get("id") == platform), variants[0] if variants else {})
        used_gemini = _truth(preferred.get("geminiUsed"))
        sources.append(ChannelSource(
            id=f"analysis:{row['id']}", kind="analyzed_draft", platform=text(preferred.get("id"), 30) or "unknown",
            title=caption[:140], text=caption, summary=text(report.get("summary"), 1000) if used_gemini else "Model-only draft; video content was not reviewed.",
            review_kind="gemini" if used_gemini else "model_only",
            review_notes=(_notes(preferred.get("strengths")) + _notes(preferred.get("opportunities")))[:6],
            updated_at=_iso(row.get("created_at")), url=f"/analysis/{row['id']}",
        ))
    # Include older /score drafts when there is no equivalent saved analysis.
    drafts = db.query(
        "SELECT id, caption, platforms, content_review, suggestions, gemini_used, created_at FROM DRAFTS "
        "WHERE user_id = %s ORDER BY created_at DESC LIMIT %s", (user_id, REVIEW_LIMIT),
    )
    for row in drafts[:REVIEW_LIMIT]:
        caption = text(row.get("caption"))
        key = normalized(caption)
        if not caption or key in review_captions or len(sources)-len(chosen) >= REVIEW_LIMIT:
            continue
        review_captions.add(key)
        review = _json(row.get("content_review"), dict) or {}
        used_gemini = _truth(row.get("gemini_used"))
        draft_platforms = text(row.get("platforms"), 100).split(",")
        source_platform = platform if platform in draft_platforms else draft_platforms[0]
        sources.append(ChannelSource(
            id=f"draft:{text(row.get('id'), 64)}", kind="scored_draft", platform=source_platform or "unknown",
            title=caption[:140], text=caption, review_kind="gemini" if used_gemini else "model_only",
            summary=text(review.get("summary"), 1000) if used_gemini else "Model-only draft; video content was not reviewed.",
            review_notes=_notes(_json(row.get("suggestions"), list)), updated_at=_iso(row.get("created_at")),
        ))
    if unreadable:
        warnings.append("Some saved reports could not be read and were excluded.")
    published_count = sum(s.kind == "published_post" for s in sources)
    distinct_count = len({normalized(s.text) for s in sources if normalized(s.text)})
    if not published_count:
        warnings.append("No published posts are available; ideas can use draft content but cannot identify successful published topics.")
    if distinct_count < 5:
        warnings.append("There is limited content history. Add more posts or video analyses for more context.")
    target_account = "youtube" if platform == "shorts" else platform
    if target_account and not any(a.platform == target_account for a in account_context):
        warnings.append("No account is linked for the target platform; audience details for that platform are unknown.")
    updates = [s.updated_at for s in sources if s.updated_at] + [a.refreshed_at for a in account_context if a.refreshed_at]
    return ChannelContext(
        creator=CreatorProfile(display_name=text(profile.get("display_name"), 120),
                               account_type=text(profile.get("account_type"), 30) or None, niche=text(profile.get("niche"), 250) or None),
        target_platform=platform, accounts=account_context, sources=sources[:40], published_posts=published_count,
        draft_reviews=len(sources)-published_count, distinct_content=distinct_count, can_generate=distinct_count >= 2,
        history_status="insufficient" if distinct_count < 2 else "limited" if distinct_count < 5 else "available",
        last_updated=max(updates) if updates else None, collected_at=now.isoformat(), warnings=warnings,
    )
