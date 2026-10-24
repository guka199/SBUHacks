"""Load the labeled demo sample under one user, shifted into the last 30 days.

python -m data.seed_demo [--user-id demo] [--dry-run]
"""

import argparse
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

from api.routers.ingest import save_batch
from api.services.errors import ServiceError
from api.services.posts import read_csv

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    load_dotenv(ROOT / '.env')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--user-id', default='demo')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    try:
        batch = read_csv((ROOT / 'data/samples/demo_posts.csv').read_bytes(), args.user_id)
        newest = batch.frame['posted_at'].max().normalize()
        yesterday = pd.Timestamp.now(tz='UTC').tz_localize(None).normalize() - pd.Timedelta(days=1)
        batch.frame['posted_at'] += yesterday - newest
        if args.dry_run:
            print(f'Demo: {len(batch.frame)} sample posts for {args.user_id}, {batch.frame.posted_at.min()} to {batch.frame.posted_at.max()}')
        else:
            print(save_batch(args.user_id, batch, 'demo_sample').model_dump_json())
    except ServiceError as exc:
        raise SystemExit(str(exc)) from None


if __name__ == '__main__':
    main()
