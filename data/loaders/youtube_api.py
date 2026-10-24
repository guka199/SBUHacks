"""Collect a YouTube training set from the YouTube Data API v3: whole upload histories, with subscriber counts.

Why: the Kaggle trending dataset only has hits (no flops) and no subscriber counts, the strongest
pre-upload predictor. Here we take channels that appear in that dataset as seeds, and pull each
channel's RECENT uploads - hits and flops - plus channel stats.

Usage (from repo root; needs YOUTUBE_API_KEY in .env):
    python -m data.loaders.youtube_api --channels 1500 --videos-per-channel 100
Output: data/raw/youtube_api/part_*.parquet (git-ignored). Safe to re-run: finished channels are skipped.

Quota: ~2 units per 50 videos (playlistItems + videos) + 1 per 50 channels. The free daily quota is
10,000 units, i.e. a few hundred thousand videos. Stops cleanly when the quota runs out.
"""

import argparse
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pandas as pd
from dotenv import load_dotenv

BASE = "https://www.googleapis.com/youtube/v3"
RAW = Path(__file__).resolve().parents[1] / "raw"
OUT = RAW / "youtube_api"
SEEDS = RAW / "youtube" / "US_youtube_trending_data.csv"


class QuotaExceeded(Exception):
    pass


class YouTube:
    def __init__(self, key: str):
        self.key = key
        self.client = httpx.Client(timeout=30)
        self.units = 0

    def get(self, endpoint: str, **params) -> dict:
        for attempt in range(4):
            r = self.client.get(f"{BASE}/{endpoint}", params={**params, "key": self.key})
            self.units += 1
            if r.status_code == 200:
                return r.json()
            reason = (r.json().get("error", {}).get("errors") or [{}])[0].get("reason", "") if r.content else ""
            if reason in ("quotaExceeded", "dailyLimitExceeded"):
                raise QuotaExceeded()
            if r.status_code == 404 or reason in ("playlistNotFound", "channelNotFound"):
                return {"items": []}
            time.sleep(2**attempt)  # transient error: back off and retry
        print(f"  skipping a {endpoint} call after repeated errors (HTTP {r.status_code})", flush=True)
        return {"items": []}


def iso_duration_seconds(value: str | None) -> float | None:
    """'PT1H2M3S' -> 3723"""
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", value or "")
    if not m:
        return None
    d, h, mi, s = (int(x or 0) for x in m.groups())
    return float(d * 86400 + h * 3600 + mi * 60 + s)


def channel_info(yt: YouTube, channel_ids: list[str]) -> list[dict]:
    items = yt.get("channels", part="snippet,statistics,contentDetails", id=",".join(channel_ids), maxResults=50)["items"]
    out = []
    for c in items:
        stats = c.get("statistics", {})
        out.append({
            "channel_id": c["id"],
            "uploads": c.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads"),
            "subscribers": None if stats.get("hiddenSubscriberCount") else int(stats.get("subscriberCount", 0)),
            "channel_video_count": int(stats.get("videoCount", 0)),
            "channel_view_count": int(stats.get("viewCount", 0)),
            "channel_published_at": c.get("snippet", {}).get("publishedAt"),
            "channel_country": c.get("snippet", {}).get("country"),
        })
    return out


def channel_videos(yt: YouTube, channel: dict, max_videos: int) -> list[dict]:
    if not channel["uploads"]:
        return []
    ids, token = [], None
    while len(ids) < max_videos:
        page = yt.get("playlistItems", part="contentDetails", playlistId=channel["uploads"],
                      maxResults=min(50, max_videos - len(ids)), pageToken=token)
        ids += [i["contentDetails"]["videoId"] for i in page.get("items", [])]
        token = page.get("nextPageToken")
        if not token:
            break

    rows, collected_at = [], datetime.now(timezone.utc).isoformat()
    for start in range(0, len(ids), 50):
        for v in yt.get("videos", part="snippet,statistics,contentDetails,status", id=",".join(ids[start:start + 50]))["items"]:
            sn, st, cd = v.get("snippet", {}), v.get("statistics", {}), v.get("contentDetails", {})
            if sn.get("liveBroadcastContent", "none") != "none" or "viewCount" not in st:
                continue  # live/upcoming streams and hidden stats
            rows.append({
                "video_id": v["id"],
                **{k: channel[k] for k in channel if k != "uploads"},
                "title": sn.get("title", ""),
                "description_length": len(sn.get("description", "")),
                "tags": "|".join(sn.get("tags", [])),
                "category_id": sn.get("categoryId"),
                "published_at": sn.get("publishedAt"),
                "default_language": sn.get("defaultAudioLanguage") or sn.get("defaultLanguage"),
                "duration_sec": iso_duration_seconds(cd.get("duration")),
                "definition": cd.get("definition"),
                "has_captions": cd.get("caption") == "true",
                "made_for_kids": v.get("status", {}).get("madeForKids"),
                "thumbnail_url": f"https://i.ytimg.com/vi/{v['id']}/hqdefault.jpg",
                "views": int(st.get("viewCount", 0)),
                "likes": int(st["likeCount"]) if "likeCount" in st else None,  # outcome only, never an input
                "comments": int(st["commentCount"]) if "commentCount" in st else None,
                "collected_at": collected_at,
            })
    return rows


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--channels", type=int, default=1500)
    parser.add_argument("--videos-per-channel", type=int, default=100)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    key = os.environ.get("YOUTUBE_API_KEY")
    if not key:
        raise SystemExit("Set YOUTUBE_API_KEY in .env")
    OUT.mkdir(parents=True, exist_ok=True)

    seeds = pd.read_csv(SEEDS, usecols=["channelId"])["channelId"].drop_duplicates().sample(frac=1, random_state=42)
    done = set()
    for part in OUT.glob("part_*.parquet"):
        done |= set(pd.read_parquet(part, columns=["channel_id"])["channel_id"])
    todo = [c for c in seeds if c not in done][: max(0, args.channels - len(done))]
    print(f"{len(done)} channels already collected; collecting {len(todo)} more "
          f"(up to {args.videos_per_channel} videos each)")

    yt = YouTube(key)
    part_no = len(list(OUT.glob("part_*.parquet")))
    started, total_videos = time.time(), 0
    try:
        for start in range(0, len(todo), 50):
            channels = channel_info(yt, todo[start:start + 50])
            with ThreadPoolExecutor(args.workers) as pool:
                batches = list(pool.map(lambda c: channel_videos(yt, c, args.videos_per_channel), channels))
            rows = [r for batch in batches for r in batch]
            if rows:
                pd.DataFrame(rows).to_parquet(OUT / f"part_{part_no:04d}.parquet", index=False)
                part_no += 1
            total_videos += len(rows)
            print(f"  {start + len(channels):>5}/{len(todo)} channels | {total_videos:,} videos | "
                  f"~{yt.units:,} quota units | {time.time() - started:.0f}s", flush=True)
    except QuotaExceeded:
        print("Daily quota reached - progress saved. Re-run tomorrow (or with another key) to continue.")
    print(f"Done: {total_videos:,} new videos -> {OUT.relative_to(RAW.parent.parent)}/")


if __name__ == "__main__":
    main()
