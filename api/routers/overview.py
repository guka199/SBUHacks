"""Signed-in user's cross-platform dashboard: linked accounts side by side, weekly reach, top posts, draft scores.

Session-scoped (no user id in the URL) and storage-agnostic (Snowflake or local SQLite via api.services.db).
Takeaways are computed from the numbers - never generated - and only compare like with like.
"""

import json
import statistics
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from api.analysis_schemas import (DashboardOut, DashboardPlatform, DashboardPost, DashboardWeek, DraftScore)
from api.services import accounts, db
from api.services.auth import require_user_id

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])
NAMES = {"youtube": "YouTube", "tiktok": "TikTok", "instagram": "Instagram", "linkedin": "LinkedIn",
         "shorts": "YouTube Shorts"}
WEEKS = 12


def _when(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "")).replace(tzinfo=None)
    except ValueError:
        return None


def _post_url(platform: str, external_id: str | None, profile_url: str | None) -> str | None:
    if platform == "youtube" and external_id:
        return f"https://www.youtube.com/watch?v={external_id}"
    return profile_url


def _platforms(user_id: str) -> list[DashboardPlatform]:
    out = []
    for a in accounts.list_accounts(user_id):
        followers, views = a.get("followers"), a.get("typical_views") or a.get("avg_views")
        interactions = sum(a.get(k) or 0 for k in ("avg_likes", "avg_comments", "avg_shares"))
        basis = "view" if views else "follower" if followers else None
        denominator = views if basis == "view" else followers
        out.append(DashboardPlatform(
            platform=a["platform"], handle=a.get("handle"), displayName=a.get("display_name"),
            profileUrl=a.get("profile_url"), connection=a.get("connection") or "manual", followers=followers,
            typicalViews=views, postsPerWeek=a.get("posts_per_week"),
            avgLikes=a.get("avg_likes"), avgComments=a.get("avg_comments"), avgShares=a.get("avg_shares"),
            reachPerFollower=round(views / followers, 3) if views and followers else None,
            engagementRate=round(interactions / denominator, 4) if interactions and denominator else None,
            engagementBasis=basis if interactions and denominator else None,
            updatedAt=str(a["updated_at"]) if a.get("updated_at") else None,
        ))
    return out


def _posts(user_id: str, profiles: dict[str, str | None]) -> tuple[list[DashboardWeek], list[DashboardPost]]:
    rows = db.query("SELECT platform, external_id, caption, posted_at, views, likes, comments, shares "
                    "FROM POSTS WHERE user_id = %s", (user_id,))
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(weeks=WEEKS)
    weekly: dict[tuple[str, str], list[int]] = defaultdict(list)
    for r in rows:
        posted = _when(r.get("posted_at"))
        if posted and posted >= since and r.get("views") is not None:
            monday = (posted - timedelta(days=posted.weekday())).date().isoformat()
            weekly[(r["platform"], monday)].append(int(r["views"]))
    weeks = [DashboardWeek(platform=p, week=w, posts=len(v), medianViews=int(statistics.median(v)))
             for (p, w), v in sorted(weekly.items(), key=lambda kv: (kv[0][1], kv[0][0]))]
    ranked = sorted((r for r in rows if r.get("views") is not None), key=lambda r: r["views"], reverse=True)[:5]
    top = [DashboardPost(platform=r["platform"], caption=" ".join((r.get("caption") or "").split())[:160],
                         views=r["views"], likes=r.get("likes"), comments=r.get("comments"),
                         postedAt=str(r["posted_at"]) if r.get("posted_at") else None,
                         url=_post_url(r["platform"], r.get("external_id"), profiles.get(r["platform"])))
           for r in ranked]
    return weeks, top


def _draft_scores(user_id: str) -> list[DraftScore]:
    """Average predicted score per platform across the user's saved video and post reports."""
    scores: dict[str, list[float]] = defaultdict(list)
    for row in db.query("SELECT report FROM ANALYSES WHERE user_id = %s", (user_id,)):
        try:
            report = json.loads(row["report"])
        except (TypeError, ValueError):
            continue
        if report.get("kind") == "post":
            best: dict[str, float] = {}
            for variant in report.get("variants", []):
                for p in variant.get("platforms", []):
                    best[p["id"]] = max(best.get(p["id"], 0.0), float(p["score"]))
            for platform, value in best.items():
                scores[platform].append(value)
        else:
            for p in report.get("platforms", []):
                scores[p["id"]].append(float(p["score"]))
    return sorted((DraftScore(platform=p, average=round(statistics.fmean(v), 1), reports=len(v))
                   for p, v in scores.items()), key=lambda d: d.average, reverse=True)


def _takeaways(platforms: list[DashboardPlatform], drafts: list[DraftScore]) -> list[str]:
    notes = []
    reach = sorted((p for p in platforms if p.reachPerFollower), key=lambda p: p.reachPerFollower, reverse=True)
    if len(reach) >= 2 and reach[-1].reachPerFollower:
        ratio = reach[0].reachPerFollower / reach[-1].reachPerFollower
        if ratio >= 1.2:
            notes.append(f"{NAMES[reach[0].platform]} reaches {ratio:.1f}x more people per follower than "
                         f"{NAMES[reach[-1].platform]}.")
    for basis in ("view", "follower"):
        same = sorted((p for p in platforms if p.engagementBasis == basis), key=lambda p: p.engagementRate,
                      reverse=True)
        if len(same) >= 2:
            notes.append(f"Highest engagement per {basis}: {NAMES[same[0].platform]} "
                         f"({same[0].engagementRate:.1%} vs. {same[-1].engagementRate:.1%} on "
                         f"{NAMES[same[-1].platform]}).")
    busiest = max((p for p in platforms if p.postsPerWeek), key=lambda p: p.postsPerWeek, default=None)
    weakest = min((p for p in platforms if p.engagementRate), key=lambda p: p.engagementRate, default=None)
    if busiest and weakest and busiest.platform == weakest.platform and len(platforms) >= 2:
        notes.append(f"You post most often on {NAMES[busiest.platform]} ({busiest.postsPerWeek:.0f}/week), "
                     "but it has your lowest engagement.")
    if len(drafts) >= 2 and drafts[0].average - drafts[-1].average >= 5:
        notes.append(f"Your drafts score highest for {NAMES.get(drafts[0].platform, drafts[0].platform)} "
                     f"(avg {drafts[0].average:.0f}) and lowest for "
                     f"{NAMES.get(drafts[-1].platform, drafts[-1].platform)} (avg {drafts[-1].average:.0f}).")
    return notes


@router.get("", response_model=DashboardOut)
def dashboard(user_id: str = Depends(require_user_id)) -> DashboardOut:
    platforms = _platforms(user_id)
    weeks, top = _posts(user_id, {p.platform: p.profileUrl for p in platforms})
    drafts = _draft_scores(user_id)
    strongest = max((p for p in platforms if p.reachPerFollower), key=lambda p: p.reachPerFollower, default=None)
    return DashboardOut(platforms=platforms, weekly=weeks, topPosts=top, draftScores=drafts,
                        takeaways=_takeaways(platforms, drafts),
                        strongest=strongest.platform if strongest else None)
