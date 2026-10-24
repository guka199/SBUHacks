# Backend and data setup

Snowflake is the application's only datastore. YouTube/CSV imports, raw audit records, connected
accounts, completed predictions and data contributions live there. ML training still uses local parquet.
The scoring endpoints continue to work if storage is unavailable; they return `storage_warning` when
a requested history save fails. No media bytes or API keys are stored with predictions.

## 1. Credentials

Create a Snowflake trial through the [MLH Snowflake link](https://mlh.link/snowflake). The event lists a
[Snowflake API prize](https://www.mlh.com/events/sbuhacks-5f/prizes); PostPilot uses Cortex AI functions
for sentiment, embeddings, semantic search and a dashboard briefing.

Snowflake login uses a **key pair** for the service user (password-only and token logins are not used).
One-time setup: run `data/sql/000_snowflake_setup.sql` in a Snowsight SQL file (select ALL text, then run) with
your public key filled in; it creates the `POSTPILOT_WH` warehouse, `POSTPILOT.APP` schema, `POSTPILOT_APP` role and
`POSTPILOT_SVC` user. Teammates get their own user with their own key (see AGENTS.md).

Edit the **repo root** `.env` (never paste keys into source files):

```dotenv
SNOWFLAKE_ACCOUNT=your-organization-your-account
SNOWFLAKE_USER=POSTPILOT_SVC
SNOWFLAKE_PRIVATE_KEY_PATH=.secrets/snowflake_key.p8
SNOWFLAKE_WAREHOUSE=POSTPILOT_WH
SNOWFLAKE_DATABASE=POSTPILOT
SNOWFLAKE_SCHEMA=APP
SNOWFLAKE_ROLE=POSTPILOT_APP
SNOWFLAKE_CORTEX_MODEL=llama3.3-70b
CORTEX_ENRICH_ON_INGEST=true
CORTEX_MAX_POSTS_PER_IMPORT=25
YOUTUBE_API_KEY=
```

Core app tables (USERS, ACCOUNTS, POSTS, DRAFTS) and the `@MEDIA` stage are defined in `api/services/db.py` and
created at API startup. `python -m data.setup` creates those plus the analytics tables below.

The Google key must have **YouTube Data API v3** enabled; a Gemini key by itself does not provide YouTube
access. See Google's [YouTube setup guide](https://developers.google.com/youtube/v3/getting-started).
Public channel stats do not require OAuth; this imports public posts and does not verify account ownership.

After editing `.env`, restart the API. The frontend needs `NEXT_PUBLIC_API_URL` in `web/.env.local`.
For the current local setup that is `http://127.0.0.1:8010`, and root `CORS_ORIGINS` must include
`http://127.0.0.1:3010`. Keep backend keys out of `NEXT_PUBLIC_*` variables.

## 2. Create the schema and verify it

With the Python environment active, from the repo root:

```bash
python -m data.setup
# Only if the configured warehouse does not exist and your role can create it:
python -m data.setup --create-warehouse
python -m data.setup --check
```

The setup command reuses the configured database/schema (or creates them when absent), creates seven tables and applies additive
migrations. It preserves existing rows. It uses the current role; grant that role privileges on the configured
warehouse/database/schema as needed. The optional warehouse is X-Small, auto-resumes, and suspends after 60 seconds.

For Cortex, an account administrator must grant the application role `SNOWFLAKE.CORTEX_USER`
(or `SNOWFLAKE.AI_FUNCTIONS_USER`) and `USE AI FUNCTIONS ON ACCOUNT`, or the relevant per-function
privileges. The selected completion model must be enabled and the region must support the functions.
See the [current Snowflake access requirements](https://docs.snowflake.com/en/user-guide/snowflake-cortex/aisql-privileges-and-access).
The app uses `AI_SENTIMENT`, `AI_EMBED` and `AI_COMPLETE`, which work with new accounts without relying
on the legacy `SNOWFLAKE.CORTEX.*` function names.

## 3. Import data

Validate an export without any network requests:

```bash
python -m data.loaders.load_csv data/samples/demo_posts.csv --user-id demo --dry-run
```

The bundled file has **10 labeled sample posts across four platforms**. Seed them under the demo user,
with dates shifted into the last 30 days, so the dashboard and weekly briefing have data:

```bash
python -m data.seed_demo --user-id demo
```

Keep original dates when importing real exports:

```bash
python -m data.loaders.load_csv export.csv --user-id demo --platform tiktok
python -m data.loaders.load_csv export.csv --user-id demo --platform tiktok --map 'desc=caption,playCount=views'
```

Canonical columns are `platform,external_id,caption,posted_at,format,thumbnail_url,views,likes,comments,shares,followers`.
`platform` is required in the CSV or as a form/CLI argument. A mixed-platform file must omit the platform argument.
Counts must be nonnegative integers (commas are accepted); dates may be ISO timestamps or Unix seconds/milliseconds.
Times are stored as UTC. Missing counts become zero; missing followers stay null.

Use the platform's stable `external_id` when available. Without an ID, both caption and timestamp are required;
an ID is deterministically generated from platform, caption, timestamp and format. Refreshed metrics update the
same post, but edited caption/date/format can only be recognized as the same post when a stable ID is supplied.
The last row wins for duplicate IDs within one import. Unknown columns remain in the raw audit payload.
Limits: 10 MB per UTF-8 CSV and 10,000 rows. Invalid imports are rejected before writing any rows.

The API provides the same workflow:

```bash
export POSTPILOT_API_URL=http://127.0.0.1:8010
curl -sS "$POSTPILOT_API_URL/data/status"
curl -sS "$POSTPILOT_API_URL/data/status?check_connection=true"
curl -sS -F user_id=demo -F file=@data/samples/demo_posts.csv "$POSTPILOT_API_URL/ingest/csv"
curl -sS -H 'Content-Type: application/json' \
  -d '{"user_id":"demo","channel_id":"@GoogleDevelopers","max_videos":20}' \
  "$POSTPILOT_API_URL/ingest/youtube"
```

YouTube accepts a channel ID, `@handle`, `/@handle` URL, or `/channel/UC...` URL, and fetches 1-200 recent
public videos using the uploads playlist. It handles pagination, private/deleted videos, hidden subscriber counts,
empty channels, unavailable stats and quota failures. YouTube shares are not public and are stored as zero.

Imports return `posts_loaded`, `inserted`, `updated`, `duplicates_skipped`, `batch_id`, `enriched_posts`, `warnings`.
`posts_loaded` counts distinct posts in this batch, including updated posts. Repeat an import: inserted should be
zero, updated should equal the distinct imported count, and dashboard totals should be unchanged. Raw audit rows
intentionally accumulate on every successful import. The raw audit and current posts are committed together.
The MERGE key is `(user_id,platform,external_id)`; original duplicates already present from the old append-only loader
are not automatically deleted. Avoid simultaneous imports of the same user's identical export; Snowflake standard
tables do not enforce uniqueness constraints.
Legacy posts without an external ID remain visible with a null ID, but must be reimported through the new loader
before Cortex enrichment can match them reliably.

## 4. Dashboard and Cortex contract for the frontend teammate

`GET /dashboard/{user_id}?days=30` returns:

- `platforms`: post counts, total views and average engagement per platform (existing contract preserved).
- `by_format`: the same metrics grouped by platform and format.
- `weekly`: the same metrics grouped by platform and Monday-start week (`YYYY-MM-DD`).
- `recent_posts`: the latest 20 posts with optional Cortex sentiment labels.
- `accounts`, `total_posts`, `last_import_at`.

Omitting `days` includes all history. Engagement is `(likes+comments+shares)/views`, with followers as the
denominator when views are zero/missing. A zero/missing denominator contributes no rate to the average.
This is an approximate cross-platform metric, not proof of one platform's algorithm being better.

Additional routes (typed helpers are in `web/lib/api.ts`):

| Route | Use |
| --- | --- |
| `POST /dashboard/{user_id}/insights?days=30` | Cortex `AI_COMPLETE` briefing grounded in that user's dashboard facts. |
| `POST /data/enrich` with `{"user_id":"demo","limit":25}` | Process a bounded batch of pending captions. |
| `POST /data/{user_id}/similar` with `{"caption":"study tips","platform":"tiktok","limit":5}` | Semantic examples from the same user's posts, using Cortex embeddings. |
| `GET /dashboard/{user_id}/predictions?limit=20` | Saved score history (one row per platform). |

Ingestion automatically enriches up to 25 pending posts (configurable, max 100). Original captions remain intact;
Cortex sees the first 1,000 characters. Changed captions invalidate old semantic matches/sentiment until refreshed.
Failure of Cortex returns an import warning while preserving saved posts. Disable automatic calls with
`CORTEX_ENRICH_ON_INGEST=false`; explicit enrichment/insights/search still work. Insights and similarity search
are explicit operations and can consume Cortex credits. The completion model is configurable; the embedding model
is fixed at `snowflake-arctic-embed-m` to match the table's 768-dimensional vector type.

`/predict` accepts optional `user_id`; `/score` accepts optional multipart `user_id`. When supplied, a completed score
is stored with its model/content breakdown, SHAP factors, suggestions and comparison. Responses add `prediction_id`
and `storage_warning`. The web scoring helper currently supplies `demo`, matching the dashboard's demo identity.
The uploaded video/image itself is not saved. A history save never changes the calculated score.

User IDs currently select demo data; **they are not authentication**. Before public deployment, connect the team's
verified login/wallet identity to these routes server-side instead of accepting an arbitrary user ID from the caller.

## 5. Verification

```bash
python -m unittest tests.test_backend_data -v
cd web && npx tsc --noEmit && npm run lint
```

The automated tests mock external services and exercise validation, repeat-import identities, pagination, secret-safe
provider errors, transaction rollback, response shapes and storage/Cortex fallbacks. They do not substitute for live SQL
execution. Once credentials are present, run `data.setup --check`, seed the sample twice and confirm its total remains
10, query dashboard data, request Cortex insights, retrieve semantic examples, and submit a score with `user_id=demo`
to verify prediction history. Then test a public YouTube channel and a real platform CSV export.

### Local live verification — 2026-10-24

- Application role `POSTPILOT_APP`: all seven tables created and readable in `POSTPILOT.PUBLIC`.
- First demo import: 10 inserted, 10 Cortex-enriched, no warnings. Second: zero inserted, 10 updated,
  zero requiring enrichment, no warnings. Dashboard remains at 10 sample posts across four platforms.
- Dashboard API and website table verified; an unrelated empty user sees zero posts.
- Cortex semantic search returned two matching examples. `llama3.3-70b` insights returned a readable briefing.
- `@GoogleDevelopers` imported one public video with enrichment under `backend-check-youtube`.
- Multipart `/ingest/csv` loaded and enriched all 10 bundled sample rows under `backend-check-csv`, with no warnings.
- A real Gemini-backed `/score` request saved Instagram and YouTube results to history for `demo`,
  with no scoring or storage warning. This check used a caption; a real video upload remains to be checked.
- 29 backend regression tests pass. The live checks caught and fixed the connector's unsupported
  `executemany` rewrite for `INSERT ... SELECT` and JSON-encoded Cortex briefing text.

Local API: `http://127.0.0.1:8010`; website: `http://127.0.0.1:3010/dashboard` (click **Load my stats**).
The sample metrics are demo data, not the user's connected social accounts. Frontend controls for imports,
history, charts and insights still need to be connected by the frontend teammate using `web/lib/api.ts`.
