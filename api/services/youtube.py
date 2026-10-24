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
