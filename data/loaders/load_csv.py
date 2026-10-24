"""Validate and upsert a platform CSV into Snowflake.

python -m data.loaders.load_csv data/samples/demo_posts.csv --user-id demo
python -m data.loaders.load_csv export.csv --user-id demo --platform tiktok --map 'desc=caption'
python -m data.loaders.load_csv export.csv --user-id demo --dry-run
"""

import argparse
from pathlib import Path

from dotenv import load_dotenv

from api.routers.ingest import save_batch
from api.services.errors import InvalidImport, ServiceError
from api.services.posts import read_csv

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    load_dotenv(ROOT / '.env')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path')
    parser.add_argument('--user-id', default='demo')
    parser.add_argument('--platform', help='Required only if the CSV has no platform column')
    parser.add_argument('--map', default='', help="Column renames: 'theirs=ours,theirs2=ours2'")
    parser.add_argument('--dry-run', action='store_true', help='Validate only; make no network requests')
    args = parser.parse_args()
    try:
        mapping = {}
        for pair in filter(None, args.map.split(',')):
            if '=' not in pair:
                raise InvalidImport('--map must contain comma-separated theirs=ours pairs')
            source, target = pair.split('=', 1)
            mapping[source.strip()] = target.strip()
        batch = read_csv(Path(args.path).read_bytes(), args.user_id, args.platform, mapping)
        if args.dry_run:
            print(f'Valid: {len(batch.frame)} posts; {batch.duplicates_skipped} duplicate rows skipped')
            print('Platforms:', batch.frame.groupby('platform').size().to_dict())
        else:
            print(save_batch(args.user_id, batch, 'csv_cli').model_dump_json())
    except (ServiceError, OSError) as exc:
        raise SystemExit(str(exc)) from None


if __name__ == '__main__':
    main()
