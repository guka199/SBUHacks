"""Read a public channel's uploads without spending search.list quota."""

import os
import re
from dataclasses import dataclass
from urllib.parse import unquote, urlparse

import httpx

from api.services.errors import ConfigurationError, InvalidImport, ServiceError

BASE = "https://www.googleapis.com/youtube/v3"


@dataclass
class ChannelImport:
    account: dict
    posts: list[dict]


def channel_filter(value: str) -> dict:
    value = value.strip()
    if "://" in value or value.startswith(("youtube.com/", "www.youtube.com/")):
        parsed = urlparse(value if "://" in value else "https://" + value)
        if parsed.hostname not in ("youtube.com", "www.youtube.com", "m.youtube.com"):
            raise InvalidImport("Use a YouTube channel URL, @handle, or channel ID")
        parts = [unquote(p) for p in parsed.path.split("/") if p]
        if len(parts) >= 2 and parts[0] == "channel":
            value = parts[1]
        elif len(parts) >= 2 and parts[0] == "user":
            return {"forUsername": parts[1]}
        elif parts and parts[0].startswith("@"):
            value = parts[0]
        else:
            raise InvalidImport("Use a /channel/UC... or /@handle YouTube URL")
    if re.fullmatch(r"UC[A-Za-z0-9_-]{22}", value):
        return {"id": value}
    if value.startswith("@") and len(value) > 1 and not any(c.isspace() for c in value):
        return {"forHandle": value}
    raise InvalidImport("Use a YouTube channel ID (UC...), @handle, or channel URL")


def _get(client: httpx.Client, endpoint: str, key: str, **params) -> dict:
    try:
        response = client.get(f"{BASE}/{endpoint}", params={**params, "key": key})
        data = response.json()
    except (httpx.RequestError, ValueError):
        # httpx exception strings can contain the API key in the request URL.
        raise ServiceError("YouTube could not be reached. Please try again later", 502) from None
    if not isinstance(data, dict):
        raise ServiceError("YouTube returned an unexpected response. Please try again later", 502)
    if response.status_code != 200 or "error" in data:
        reasons = [item.get("reason") for item in data.get("error", {}).get("errors", [])]
        if any(r in ("quotaExceeded", "dailyLimitExceeded") for r in reasons):
            raise ServiceError("YouTube API quota is exhausted; try again after its quota resets", 502)
        raise ServiceError("YouTube rejected the request. Check that YOUTUBE_API_KEY is valid and the YouTube Data API v3 is enabled", 502)
    return data


def fetch_channel(channel_id: str, max_videos: int = 50) -> ChannelImport:
    selected = channel_filter(channel_id)
    key = os.getenv("YOUTUBE_API_KEY")
    if not key:
        raise ConfigurationError("Add YOUTUBE_API_KEY to the repo's .env, enable YouTube Data API v3, and restart the API")
    if not 1 <= max_videos <= 200:
        raise InvalidImport("max_videos must be between 1 and 200")
    with httpx.Client(timeout=20) as client:
        items = _get(client, "channels", key, part="snippet,contentDetails,statistics", **selected).get("items", [])
        if not items:
            raise ServiceError("YouTube channel not found or not public", 404)
        channel = items[0]
        uploads = channel.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads")
        stats = channel.get("statistics", {})
        subscribers = None if stats.get("hiddenSubscriberCount") else stats.get("subscriberCount")
        subscribers = int(subscribers) if subscribers is not None else None
        snippet = channel.get("snippet", {})
        account = {"platform": "youtube", "external_id": channel["id"],
                   "handle": snippet.get("customUrl") or snippet.get("title"), "followers": subscribers,
                   "display_name": snippet.get('title'), "total_posts": int(stats['videoCount']) if stats.get('videoCount') is not None else None}
        if not uploads:
            return ChannelImport(account, [])
        video_ids, page_token, seen_tokens = [], None, set()
        while len(video_ids) < max_videos:
            params = {"part": "contentDetails", "playlistId": uploads, "maxResults": min(50, max_videos - len(video_ids))}
            if page_token:
                params["pageToken"] = page_token
            response = _get(client, "playlistItems", key, **params)
            for item in response.get("items", []):
                video_id = item.get("contentDetails", {}).get("videoId")
                if video_id and video_id not in video_ids:
                    video_ids.append(video_id)
            page_token = response.get("nextPageToken")
            if not page_token or page_token in seen_tokens:
                break
            seen_tokens.add(page_token)
        posts = []
        for start in range(0, len(video_ids), 50):
            videos = _get(client, "videos", key, part="snippet,statistics", id=",".join(video_ids[start:start + 50]))
            for video in videos.get("items", []):
                stats, snippet = video.get("statistics", {}), video.get("snippet", {})
                if not snippet.get("publishedAt"):
                    continue
                thumbnails = snippet.get("thumbnails", {})
                thumbnail = next((thumbnails[name].get("url") for name in ("high", "medium", "default") if name in thumbnails), None)
                posts.append({"platform": "youtube", "format": "video", "external_id": video["id"],
                              "caption": snippet.get("title", ""), "posted_at": snippet["publishedAt"],
                              "thumbnail_url": thumbnail, "views": stats.get("viewCount", 0),
                              "likes": stats.get("likeCount", 0), "comments": stats.get("commentCount", 0),
                              "shares": 0, "followers": subscribers, "_raw_payload": video})
    return ChannelImport(account, posts[:max_videos])


def fetch_channel_videos(channel_id: str, max_videos: int = 50) -> list[dict]:
    return fetch_channel(channel_id, max_videos).posts


# ----------------------------------------------------------------------------- account linking

CATEGORY_NAMES = {
    "1": "Film & Animation", "2": "Autos & Vehicles", "10": "Music", "15": "Pets & Animals", "17": "Sports",
    "19": "Travel & Events", "20": "Gaming", "22": "People & Blogs", "23": "Comedy", "24": "Entertainment",
    "25": "News & Politics", "26": "Howto & Style", "27": "Education", "28": "Science & Technology",
    "29": "Nonprofits & Activism",
}


class ChannelNotFound(Exception):
    pass


def _duration_seconds(value: str | None) -> float | None:
    """'PT1H2M3S' -> 3723"""
    import re

    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", value or "")
    if not m:
        return None
    d, h, mi, s = (int(x or 0) for x in m.groups())
    return float(d * 86400 + h * 3600 + mi * 60 + s)


def _channel_lookup(text: str) -> dict:
    """Turn a channel URL, @handle or channel id into channels.list lookup params."""
    import re

    text = text.strip()
    if m := re.search(r"(UC[\w-]{22})", text):
        return {"id": m.group(1)}
    if m := re.search(r"youtube\.com/user/([\w.-]+)", text):
        return {"forUsername": m.group(1)}
    if m := re.search(r"youtube\.com/(?:c/)?@?([\w.-]+)", text):
        return {"forHandle": "@" + m.group(1).lstrip("@")}
    return {"forHandle": "@" + text.lstrip("@").split("/")[0]}


def channel_summary(channel: str, max_videos: int = 50) -> dict:
    """Public stats of a channel + metrics over its recent uploads (no login needed; uses YOUTUBE_API_KEY).

    Returns account fields (followers = subscribers, typical_views = median views of uploads older than 7 days,
    engagement_rate = (likes + comments) / views over recent uploads, posts_per_week, ...) plus "posts".
    """
    from datetime import datetime, timezone
    from statistics import median

    key = os.environ["YOUTUBE_API_KEY"]
    with httpx.Client(timeout=20) as client:
        def get(endpoint: str, **params) -> dict:
            r = client.get(f"{BASE}/{endpoint}", params={**params, "key": key})
            r.raise_for_status()
            return r.json()

        items = get("channels", part="snippet,statistics,contentDetails", **_channel_lookup(channel)).get("items", [])
        if not items:
            raise ChannelNotFound(f"No YouTube channel found for {channel!r}")
        c = items[0]
        snippet, stats = c.get("snippet", {}), c.get("statistics", {})
        uploads = c["contentDetails"]["relatedPlaylists"]["uploads"]

        ids = [i["contentDetails"]["videoId"] for i in
               get("playlistItems", part="contentDetails", playlistId=uploads, maxResults=min(50, max_videos)).get("items", [])]
        videos = get("videos", part="snippet,statistics,contentDetails", id=",".join(ids)).get("items", []) if ids else []

    now = datetime.now(timezone.utc)
    posts = []
    for v in videos:
        st, sn = v.get("statistics", {}), v.get("snippet", {})
        if "viewCount" not in st:
            continue
        published = datetime.fromisoformat(sn["publishedAt"].replace("Z", "+00:00"))
        duration = _duration_seconds(v.get("contentDetails", {}).get("duration"))
        posts.append({
            "external_id": v["id"], "caption": sn.get("title", ""), "posted_at": published,
            "age_days": (now - published).total_seconds() / 86400,
            "format": "short" if duration is not None and duration <= 180 else "video",
            "category": CATEGORY_NAMES.get(sn.get("categoryId", ""), "Other"),
            "thumbnail_url": f"https://i.ytimg.com/vi/{v['id']}/hqdefault.jpg",
            "views": int(st.get("viewCount", 0)), "likes": int(st.get("likeCount", 0)),
            "comments": int(st.get("commentCount", 0)),
        })

    mature = [p for p in posts if p["age_days"] >= 7] or posts  # newest videos are still gaining views
    total_views = sum(p["views"] for p in posts)
    span_weeks = (max(p["age_days"] for p in posts) - min(p["age_days"] for p in posts)) / 7 if len(posts) > 1 else 0
    categories = [p["category"] for p in posts]
    return {
        "external_id": c["id"],
        "handle": snippet.get("customUrl") or c["id"],
        "display_name": snippet.get("title"),
        "profile_url": f"https://www.youtube.com/channel/{c['id']}",
        "followers": None if stats.get("hiddenSubscriberCount") else int(stats.get("subscriberCount", 0)),
        "total_posts": int(stats.get("videoCount", 0)),
        "avg_views": total_views / len(posts) if posts else None,
        "typical_views": float(median(p["views"] for p in mature)) if mature else None,
        "avg_likes": sum(p["likes"] for p in posts) / len(posts) if posts else None,
        "avg_comments": sum(p["comments"] for p in posts) / len(posts) if posts else None,
        "avg_shares": None,  # not available from the public API
        "engagement_rate": sum(p["likes"] + p["comments"] for p in posts) / total_views if total_views else None,
        "posts_per_week": len(posts) / span_weeks if span_weeks > 0 else None,
        "extra": {
            "country": snippet.get("country"),
            "channel_views": int(stats.get("viewCount", 0)),
            "channel_created": snippet.get("publishedAt"),
            "thumbnail": snippet.get("thumbnails", {}).get("default", {}).get("url"),
            "shorts_share": round(sum(p["format"] == "short" for p in posts) / len(posts), 2) if posts else None,
            "top_categories": sorted(set(categories), key=categories.count, reverse=True)[:3],
            "recent_videos_analyzed": len(posts),
        },
        "posts": posts,
    }
