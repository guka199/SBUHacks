"""Posting plan: target country + planned time + the creator's audience -> timing and localisation advice.

Time-zone conversions happen here (never in the LLM); Gemini only judges and suggests.
"""

import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import pytz

from api.analysis_schemas import PostingAdvice, PostingIn, PostingPlatform, PostingWindow
from api.services import accounts, gemini

# ISO code -> name; pytz's tz-database names are unusual for a few countries ("Britain (UK)")
COUNTRY_NAMES = {**pytz.country_names, "GB": "United Kingdom", "KR": "South Korea", "KP": "North Korea",
                 "RU": "Russia", "IR": "Iran", "SY": "Syria", "VN": "Vietnam", "TW": "Taiwan", "CZ": "Czechia",
                 "BO": "Bolivia", "VE": "Venezuela", "TZ": "Tanzania", "MD": "Moldova", "LA": "Laos"}
NAME_TO_CODE = {name.lower(): code for names in (pytz.country_names, COUNTRY_NAMES) for code, name in names.items()}
NAME_TO_CODE.update({"usa": "US", "uk": "GB", "united states of america": "US", "england": "GB", "korea": "KR",
                     "great britain": "GB"})


def country_zone(code: str) -> str:
    """The country's main time zone (pytz lists the most populous first, e.g. US -> America/New_York)."""
    return pytz.country_timezones[code.lower()][0]


def valid_zone(name: str | None) -> str | None:
    if not name:
        return None
    try:
        ZoneInfo(name)
        return name
    except (ZoneInfoNotFoundError, ValueError):
        return None


def validate(plan: PostingIn) -> PostingIn:
    if plan.country and plan.country not in COUNTRY_NAMES:
        raise ValueError("unknown country")
    if plan.plannedTime is not None:
        if plan.plannedTime.tzinfo is None:
            raise ValueError("planned time needs a UTC offset")
        if not 2000 <= plan.plannedTime.year <= 2100:
            raise ValueError("planned time out of range")
    return plan.model_copy(update={"timezone": valid_zone(plan.timezone)})


def _code(name: str) -> str | None:
    name = name.strip()
    if name.upper() in COUNTRY_NAMES:
        return name.upper()
    return NAME_TO_CODE.get(name.lower())


def _profile(user_id: str, formats: list[str]) -> tuple[str, bool, str | None]:
    """(profile text, has audience demographics, the audience's top country code if one is known)."""
    wanted = {"youtube" if f == "shorts" else f for f in formats}
    linked = accounts.list_accounts(user_id)
    relevant = [a for a in linked if a["platform"] in wanted] or linked
    has_audience = any(v not in (None, "", []) for a in relevant for v in (a.get("audience") or {}).values())
    top = next((c for a in relevant for name in (a.get("audience") or {}).get("top_countries") or []
                if (c := _code(name))), None)
    return accounts.audience_summary(user_id) or "no linked accounts", has_audience, top


def _fmt(moment: datetime) -> str:
    return moment.strftime("%a %d %b, %H:%M")


def _shift(clock: str, day: datetime, src: ZoneInfo, dst: ZoneInfo) -> str | None:
    """'HH:MM' on `day` in src -> 'HH:MM' in dst, with (+1 day)/(-1 day) when the date changes."""
    match = re.fullmatch(r"(\d{1,2}):(\d{2})", clock.strip())
    if not match or int(match[1]) > 24 or int(match[2]) > 59:
        return None
    base = datetime(day.year, day.month, day.day, tzinfo=src) + timedelta(hours=int(match[1]), minutes=int(match[2]))
    moved = base.astimezone(dst)
    delta = (moved.date() - base.date()).days
    return moved.strftime("%H:%M") + (f" ({delta:+d} day)" if delta else "")


def advise(user_id: str, formats: list[str], caption: str, plan: PostingIn) -> PostingAdvice | None:
    """None when there is nothing to plan with (no country, no time, no audience data)."""
    profile, has_audience, top_country = _profile(user_id, formats)
    if not (plan.country or plan.plannedTime or has_audience):
        return None
    country = plan.country or top_country
    poster_zone = plan.timezone
    audience_zone = country_zone(country) if country else (poster_zone or "UTC")
    aud, poster = ZoneInfo(audience_zone), ZoneInfo(poster_zone) if poster_zone else None

    planned_aud = planned_poster = None
    if plan.plannedTime:
        planned_aud = _fmt(plan.plannedTime.astimezone(aud))
        planned_poster = _fmt(plan.plannedTime.astimezone(poster)) if poster else None
    planned_text = "not chosen yet - recommend windows only" if not plan.plannedTime else (
        f"{planned_aud} {audience_zone} (audience time)" + (f" = {planned_poster} {poster_zone} (creator's time)"
                                                             if planned_poster else ""))
    country_text = (f"{COUNTRY_NAMES[country]} ({country})" + ("" if plan.country else
                    " - not chosen by the creator; this is their audience's top country") if country
                    else "not specified")
    result = gemini.plan_posting(formats, caption, country_text, audience_zone, planned_text, profile)

    day = (plan.plannedTime or datetime.now(timezone.utc)).astimezone(aud)
    platforms = []
    for item in result.platforms:
        name = item.platform.strip().lower()
        if name not in formats or any(p.platform == name for p in platforms):
            continue
        windows = [PostingWindow(days=w.days, start=w.start, end=w.end,
                                 startLocal=_shift(w.start, day, aud, poster) if poster and poster_zone != audience_zone else None,
                                 endLocal=_shift(w.end, day, aud, poster) if poster and poster_zone != audience_zone else None)
                   for w in item.windows[:2]]
        platforms.append(PostingPlatform(platform=name, rating=item.rating if plan.plannedTime else "unknown",
                                         reason=item.reason, windows=windows))
    if not platforms:
        raise ValueError("Gemini returned no posting advice")
    platforms.sort(key=lambda p: formats.index(p.platform))
    return PostingAdvice(
        country=country, countryName=COUNTRY_NAMES.get(country) if country else None, audienceTimezone=audience_zone,
        posterTimezone=poster_zone, plannedTime=plan.plannedTime, plannedAudience=planned_aud,
        plannedPoster=planned_poster, hasAudienceData=has_audience, summary=result.summary,
        audienceFit=result.audience_fit, platforms=platforms, suggestions=result.suggestions[:4],
    )
