"""Collect a bounded, reproducible public-channel pilot for thumbnail ablation.

python -m data.loaders.youtube_thumbnail_pilot --channels 100 --videos-per-channel 150
This is a convenience sample with current lifetime stats, not seven-day outcomes.
"""

import argparse
import json
import random
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pandas as pd
from dotenv import load_dotenv
import os

from data.loaders.youtube_api import YouTube, QuotaExceeded, channel_info, channel_videos

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--handles-file", type=Path, default=ROOT / "data/samples/youtube_pilot_channels.txt")
    parser.add_argument("--channels", type=int, default=100)
    parser.add_argument("--videos-per-channel", type=int, default=150)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path, default=ROOT / "data/raw/youtube_thumbnail_pilot")
    parser.add_argument("--prepare", action="store_true", help="Also prepare data/processed/youtube_thumbnail_pilot.parquet")
    args = parser.parse_args()
    if not (10 <= args.channels <= 200 and 1 <= args.videos_per_channel <= 200 and 1 <= args.workers <= 12):
        parser.error("channels must be 10-200, videos-per-channel 1-200, workers 1-12")
    key = os.getenv("YOUTUBE_API_KEY")
    if not key:
        parser.error("Set YOUTUBE_API_KEY in the root .env")
    handles = list(dict.fromkeys(l.strip() for l in args.handles_file.read_text().splitlines() if l.strip() and not l.startswith("#")))
    random.Random(args.seed).shuffle(handles)
    handles = handles[:args.channels]
    args.output.mkdir(parents=True, exist_ok=True)
    yt = YouTube(key)
    try:
        # The common preparation code uses the same category vocabulary as existing models.
        categories = ROOT / "data/raw/youtube/US_category_id.json"
        if not categories.exists():
            categories.parent.mkdir(parents=True, exist_ok=True)
            categories.write_text(json.dumps(yt.get("videoCategories", part="snippet", regionCode="US")))
        ids = []
        for index, handle in enumerate(handles):
            items = yt.get("channels", part="id", forHandle=handle).get("items", [])
            if items:
                ids.append(items[0]["id"])
            if (index + 1) % 20 == 0:
                print(f"Resolved {index + 1}/{len(handles)} handles", flush=True)
        ids = list(dict.fromkeys(ids))
        channels = []
        for start in range(0, len(ids), 50):
            channels.extend(channel_info(yt, ids[start:start + 50]))
        todo = [c for c in channels if not (args.output / f"{c['channel_id']}.parquet").exists()]
        def collect(channel):
            rows = channel_videos(yt, channel, args.videos_per_channel)
            if rows:
                pd.DataFrame(rows).to_parquet(args.output / f"{channel['channel_id']}.parquet", index=False)
            return len(rows)
        total = 0
        with ThreadPoolExecutor(args.workers) as pool:
            for index, count in enumerate(pool.map(collect, todo), start=1):
                total += count
                if index % 10 == 0 or index == len(todo):
                    print(f"Collected {index}/{len(todo)} channels, {total:,} videos; approximately {yt.units} API calls", flush=True)
        manifest = {"source": "YouTube Data API v3", "sampling": "manually selected public handles; convenience sample, not representative",
                    "handles": handles, "resolved_channel_ids": ids, "videos_per_channel": args.videos_per_channel,
                    "seed": args.seed, "collected_at": datetime.now(timezone.utc).isoformat(), "api_calls_this_run": yt.units}
        (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2))
        print(f"Raw pilot saved to {args.output}", flush=True)
        if args.prepare:
            from data.prepare import _prepare_youtube_api
            prepared = _prepare_youtube_api(sorted(args.output.glob("*.parquet")))
            destination = ROOT / "data/processed/youtube_thumbnail_pilot.parquet"
            destination.parent.mkdir(parents=True, exist_ok=True)
            prepared.to_parquet(destination, index=False)
            print(f"Prepared {len(prepared):,} posts from {prepared.creator_id.nunique()} creators -> {destination}", flush=True)
    except (QuotaExceeded, httpx.HTTPError, ValueError, KeyError):
        raise SystemExit("YouTube collection stopped. Completed channel files were saved; check quota/API access and retry") from None
    finally:
        yt.client.close()


if __name__ == "__main__":
    main()
