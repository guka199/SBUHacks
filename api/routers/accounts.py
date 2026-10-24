"""Link social accounts to the signed-in user.

    GET    /accounts                     the user's linked accounts
    POST   /accounts/youtube             link a YouTube channel automatically (public stats via YOUTUBE_API_KEY)
    PUT    /accounts/{platform}          save stats typed in by the user (TikTok, Instagram, LinkedIn - or YouTube)
    PATCH  /accounts/{platform}/audience update just the target-audience details
    DELETE /accounts/{platform}          unlink

TikTok, Instagram and LinkedIn only share follower/engagement stats with approved developer apps, so those are
entered manually from each platform's own analytics for now.
"""

import os

import httpx
from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from api.schemas import AccountOut, Audience, ManualAccountIn, Platform, YouTubeConnectIn
from api.services import accounts, youtube
from api.services.auth import require_user_id

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _out(account: dict) -> AccountOut:
    return AccountOut(**{k: account.get(k) for k in AccountOut.model_fields if account.get(k) is not None}
                      | {"updated_at": str(account.get("updated_at"))})


def _audience(audience: Audience | None) -> dict:
    return audience.model_dump(exclude_none=True) if audience else {}


@router.get("", response_model=list[AccountOut])
def list_accounts(user_id: str = Depends(require_user_id)) -> list[AccountOut]:
    return [_out(a) for a in accounts.list_accounts(user_id)]


@router.post("/youtube", response_model=AccountOut)
async def connect_youtube(req: YouTubeConnectIn, user_id: str = Depends(require_user_id)) -> AccountOut:
    if not os.getenv("YOUTUBE_API_KEY"):
        raise HTTPException(503, "YouTube linking isn't configured (YOUTUBE_API_KEY)")
    try:
        summary = await run_in_threadpool(youtube.channel_summary, req.channel)
    except youtube.ChannelNotFound as e:
        raise HTTPException(404, str(e)) from None
    except httpx.HTTPError as e:
        raise HTTPException(502, f"YouTube API error: {e}") from None

    posts = summary.pop("posts")
    existing = accounts.get_account(user_id, "youtube") or {}
    summary["audience"] = _audience(req.audience) or existing.get("audience") or {}
    account = accounts.save_account(user_id, "youtube", {**summary, "connection": "api"})
    accounts.save_posts(user_id, "youtube", posts, summary.get("followers"))
    return _out(account)


@router.put("/{platform}", response_model=AccountOut)
def save_manual(platform: Platform, req: ManualAccountIn, user_id: str = Depends(require_user_id)) -> AccountOut:
    numbers = req.model_dump(exclude={"audience", "handle", "profile_url"})
    if any(v is not None and v < 0 for v in numbers.values()):
        raise HTTPException(422, "Numbers can't be negative")
    fields = {
        **numbers,
        "connection": "manual",
        "handle": req.handle.strip().lstrip("@"),
        "display_name": req.handle.strip(),
        "profile_url": req.profile_url,
        "typical_views": req.avg_views,
        "engagement_rate": accounts.engagement_rate(req.followers, req.avg_views, req.avg_likes,
                                                    req.avg_comments, req.avg_shares),
        "audience": _audience(req.audience),
    }
    return _out(accounts.save_account(user_id, platform, fields))


@router.patch("/{platform}/audience", response_model=AccountOut)
def update_audience(platform: Platform, audience: Audience, user_id: str = Depends(require_user_id)) -> AccountOut:
    account = accounts.get_account(user_id, platform)
    if not account:
        raise HTTPException(404, f"No {platform} account linked")
    account["audience"] = _audience(audience)
    return _out(accounts.save_account(user_id, platform, account))


@router.delete("/{platform}")
def unlink(platform: Platform, user_id: str = Depends(require_user_id)) -> dict:
    accounts.delete_account(user_id, platform)
    return {"ok": True}
