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
                   "handle": snippet.get("customUrl") or snippet.get("title"), "followers": subscribers}
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
