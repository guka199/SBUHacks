"""YouTube Data API v3: pull a channel's recent videos with their stats."""

import os

import httpx

BASE = "https://www.googleapis.com/youtube/v3"


def fetch_channel_videos(channel_id: str, max_videos: int = 50) -> list[dict]:
    key = os.environ["YOUTUBE_API_KEY"]
    with httpx.Client(timeout=20) as client:
        channel = client.get(
            f"{BASE}/channels",
            params={"part": "contentDetails,statistics", "id": channel_id, "key": key},
        ).json()["items"][0]
        uploads = channel["contentDetails"]["relatedPlaylists"]["uploads"]
        subscribers = int(channel["statistics"].get("subscriberCount", 0))

        video_ids: list[str] = []
        page_token = None
        while len(video_ids) < max_videos:
            resp = client.get(
                f"{BASE}/playlistItems",
                params={
                    "part": "contentDetails",
                    "playlistId": uploads,
                    "maxResults": min(50, max_videos - len(video_ids)),
                    "pageToken": page_token,
                    "key": key,
                },
            ).json()
            video_ids += [i["contentDetails"]["videoId"] for i in resp.get("items", [])]
            page_token = resp.get("nextPageToken")
            if not page_token:
                break

        posts = []
        for start in range(0, len(video_ids), 50):
            batch = video_ids[start : start + 50]
            items = client.get(
                f"{BASE}/videos",
                params={"part": "snippet,statistics", "id": ",".join(batch), "key": key},
            ).json()["items"]
            for v in items:
                stats, snip = v["statistics"], v["snippet"]
                posts.append(
                    {
                        "platform": "youtube",
                        "format": "video",
                        "external_id": v["id"],
                        "caption": snip["title"],
                        "posted_at": snip["publishedAt"],
                        "thumbnail_url": snip["thumbnails"]["high"]["url"],
                        "views": int(stats.get("viewCount", 0)),
                        "likes": int(stats.get("likeCount", 0)),
                        "comments": int(stats.get("commentCount", 0)),
                        "shares": 0,  # not exposed by the public API
                        "followers": subscribers,
                    }
                )
    return posts


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
