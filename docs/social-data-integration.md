# Public social data integration

**Current scope update:** The user chose to stop using PhantomBuster. Automatic
LinkedIn collection is disabled by default and locally using
`PHANTOMBUSTER_ENABLED=false`, even if credentials/agent IDs are present. Import,
refresh, scheduling and queued worker steps cannot contact the provider while
disabled. Existing manual LinkedIn statistics remain supported. Active collection
scope is Instagram/TikTok through Apify and the existing YouTube API.

The earlier LinkedIn sections below describe inactive implementation/setup history,
not a requirement to configure or use PhantomBuster. The user reported connecting
the agents, but live acceptance did not complete: the first profile attempt timed
out due to an incorrect milliseconds setting, which was corrected to 600000 ms.
The subsequent provider containers finished and exposed different status/export
fields; polling and schema mappings were updated, but no successful LinkedIn
snapshot was saved before the user stopped this work. No LinkedIn live-success
claim is made. No further provider runs are requested.

Branch: `feature/social-data-integration`, based on latest default branch
`origin/main` at `96caef285a8310856a5841ac8feca8247c64440d` (October 24, 2026).
The user has authorized a checkpoint push to the feature branch. Main must not be pushed or merged without separate approval.

## What is implemented and what is verified

The API accepts an authorized profile URL, queues durable provider work, polls
runs, normalizes public profile/post data and atomically updates the app's
ACCOUNTS, POSTS and SOCIAL_SNAPSHOTS tables. The latest successful sample and
historical snapshots remain readable during refreshes and after failures.
Provider errors never become invented statistics. Existing YouTube linking,
manual entry, audience settings, scorer and analysis/report APIs remain available.
No UI files, 3D effects, model bundles, training code or feature definitions changed.

Verification is **offline**: synthetic actor/export fixtures, httpx mock provider
responses, actual isolated SQLite persistence, signed session ownership, worker
steps, concurrency, restart recovery, transaction rollback and regression tests.
These are not live provider captures. Apify and PhantomBuster keys are now saved
in the ignored local `.env`. Read-only authentication checks returned HTTP 200
for both providers. PhantomBuster initially had no configured agents; two agents
have now been created and their IDs saved locally. LinkedIn account connection
inside PhantomBuster and live export verification remain pending. The user supplied
public Instagram/TikTok test URLs and both live imports succeeded (details below).
New social tables/transactions have not been exercised
against live Snowflake. LinkedIn export mappings require verification against the
team's configured agents; no universal LinkedIn export schema is assumed.

## Run locally

Python 3.11+. From the repository root:

```sh
python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m pip install -r api/requirements.txt
# Copy .env.example to .env only if you do not already have a .env.
python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Set `SESSION_SECRET` for signed login cookies. For purely local testing leave
`SNOWFLAKE_ACCOUNT` empty; startup creates the existing SQLite `data/local.db`.
For Snowflake use the team's existing settings and role with CREATE TABLE and
read/write access in the app schema. `db.init()` adds the three SOCIAL_* tables;
no existing table is dropped. Existing Snowflake data setup remains
`python -m data.setup` (see backend-data.md).

Enable `SOCIAL_WORKER_ENABLED=true` in `.env` and restart the API before importing.
The worker is disabled by default to avoid unexpectedly enabling paid collection
on an existing server. Import and refresh return 503 if disabled. Existing
YouTube/manual routes and stored statistics remain available when it is disabled.
No scraping is automatically started just by setting credentials.

Open `http://localhost:8000/docs`. Use the existing `/auth/signup` or `/auth/login`
route first. Same-origin Swagger requests send the signed `pp_session` cookie;
there is no bearer token to paste into Swagger. HTTPS deployments should use
`COOKIE_SECURE=true` and appropriate existing CORS settings. Frontend proxy
`/backend/accounts/...` can expose these endpoints when the team adds UI controls.

Do not copy provider keys to browser/Next public environment variables.

## Credentials and agent setup

Required for Instagram/TikTok:

```dotenv
APIFY_API_TOKEN=<Apify account API token with actor/dataset access>
```

The fixed actors are `apify/instagram-scraper` and
`clockworks/tiktok-scraper`. Ensure the account has access/credits and verify their
current input/output in the Apify console. Instagram uses `resultsType=details`
with one profile and its embedded `latestPosts`; it does not promise a full feed.
TikTok selects the requested creator's latest videos, disables related videos
and media downloads, and sets `resultsPerPage` to the requested ceiling.
Run timeout is 600 seconds and requested memory is 1024 MB. Provider plans and
saved agent settings determine actual cost; this is not a billing quota system.

Required for personal LinkedIn profiles:

```dotenv
PHANTOMBUSTER_API_KEY=<workspace API key>
PHANTOMBUSTER_LINKEDIN_PROFILE_AGENT_ID=<configured profile extraction agent ID>
PHANTOMBUSTER_LINKEDIN_POSTS_AGENT_ID=<configured activity/post extraction agent ID>
```

Configure the authorized LinkedIn connection **inside PhantomBuster**, using its
supported connection workflow/extension. ViralPilot neither collects LinkedIn
passwords/session cookies nor retrieves saved agent arguments. Disable unrelated
contact/email enrichment. Configure extraction agents, not message/post/engagement
automation agents. Verify each with one authorized profile in the provider UI.

For each `PROFILE`, `POSTS` or optional `COMPANY` agent:

1. Inspect the provider's API setup to confirm the profile URL input argument.
   Set `PHANTOMBUSTER_LINKEDIN_<KIND>_INPUT_KEY` (default `spreadsheetUrl`; also
   supports `profileUrl`/`companyUrl`). This must match the saved Phantom, not its
   human-readable form label. Saved authorization options are retained using
   single-use `bonusArgument`; `saveArgument=false` and `maxInstanceCount=1`.
2. Set a conservative saved extraction limit. Optionally set `<KIND>_LIMIT_KEY`
   to `numberOfPosts`, `numberOfProfiles`, `numberOfLinesPerLaunch`,
   `numberOfAddsPerLaunch` or `numberMaxOfPosts` when supported
   by that Phantom. For profile/company agents use a saved limit of ONE profile;
   for posts use the desired bounded sample. The API also caps imported rows at
   `max_posts` (1–100), but that does not cap a misconfigured agent's remote work.
3. Keep current-run results rather than a cumulative multi-profile export.
   Repeated refreshes must actually revisit the profile; disable saved
   skip-previously-processed behavior if the chosen Phantom supports it. Turn off
   provider-side scheduling when using ViralPilot scheduling to avoid two clocks.
4. Download a small authorized export and confirm/map columns. Set
   `PHANTOMBUSTER_LINKEDIN_<KIND>_FIELD_MAP` to a JSON object mapping **adapter
   target names to actual exported column names**, e.g.
   `{"profileUrl":"linkedinProfile","followersCount":"numberOfFollowers"}`
   ONLY if those source columns exist and mean exactly that in your export.
   Missing metrics stay null; do not map connections or employee count to followers.
5. Result transport supports a JSON row array, a JSON-encoded row array, a
   `resultObject` wrapper, or a result object containing `jsonUrl`/`csvUrl`.
   Exports must be UTF-8 JSON/CSV, <=8 MiB and <=10,000 rows. Unknown envelopes fail
   explicitly. Exact trusted export hosts only; default is
   `phantombuster.s3.amazonaws.com`. Add a verified provider export host via
   `PHANTOMBUSTER_EXPORT_HOSTS` if your account uses another hostname.
   Downloads do not follow redirects and never forward the API key to export hosts.

The general official API guide documents `X-Phantombuster-Key-1`; the current
endpoint reference UI also lists `X-Phantombuster-Key`. Default is Key-1. If your
workspace's API example requires the other spelling, set
`PHANTOMBUSTER_KEY_HEADER=X-Phantombuster-Key`. No credential is put in URL params.

Company pages are opt-in using `PHANTOMBUSTER_LINKEDIN_COMPANY_AGENT_ID` configured
for LinkedIn Company Scraper, with its own INPUT_KEY/LIMIT_KEY/FIELD_MAP. It imports
company identity and available explicit follower count. Company activity is not
implemented in this adapter and is reported as a warning. Person activity imports
exclude non-authored activity and rows without a matching author profile URL.

### LinkedIn adapter export contract

This is deliberately an explicit adapter contract, not a claim of a universal
Phantom schema. Agent changes must be reviewed before live use. Additional aliases
accepted by the normalizer are shown in its source.

Profile JSON (synthetic):

```json
[
  {
    "profileUrl": "https://www.linkedin.com/in/viralpilot-fixture",
    "fullName": "Synthetic Creator",
    "followersCount": 2500
  }
]
```

Company: `companyUrl`, `companyName`, optional `followersCount`.
Activity JSON/CSV columns:

```json
[
  {
    "profileUrl": "https://www.linkedin.com/in/viralpilot-fixture",
    "postId": "li-fixture-1",
    "postUrl": "https://www.linkedin.com/feed/update/urn:li:activity:1000000000000000001/",
    "postContent": "Synthetic production lessons",
    "postDate": "2026-09-01T12:00:00Z",
    "likeCount": 75,
    "commentCount": 8,
    "repostCount": 4,
    "type": "post"
  }
]
```

`profileUrl` or `authorProfileUrl` must identify the **author**, not the person
who liked/commented. Accepted `type` values are post/article (case shown in source)
or absent for an agent explicitly configured for authored posts. A nonempty export
with no accepted authored rows fails instead of claiming success. Dates must be
ISO timestamps or numeric Unix seconds/milliseconds; relative dates stay null.
The API does not infer exact times from phrases such as "one week ago".

## Authenticated endpoints

Every new route requires an existing signed user session; request bodies cannot
select another user, provider token or arbitrary actor/agent ID.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/accounts` | Existing successful/manual linked account summaries |
| GET | `/accounts/imports` | Imported profile records including pending job IDs and schedules |
| GET | `/accounts/providers/status` | Credential-presence booleans and worker config; no secrets or live check |
| POST | `/accounts/import` | Validate profile URL/permission and enqueue/reuse import (202) |
| GET | `/accounts/jobs/{id}` | Owner-only job status, phase, stage progress, safe error and snapshot ID |
| POST | `/accounts/{platform}/refresh` | Enqueue/reuse the saved profile (202); body `{}` |
| GET | `/accounts/{platform}/stats` | Last successful normalized snapshot |
| GET | `/accounts/{platform}/posts?offset=0&limit=30` | Paginate latest collected sample, max limit 100 |
| GET | `/accounts/{platform}/history?limit=10` | Newest snapshots with snapshot IDs, max limit 100 |
| PUT | `/accounts/{platform}/schedule` | `{ "interval_hours": 24 }`; null disables; 6–720 hours |
| DELETE | `/accounts/{platform}` | Existing unlink extended to remove jobs/history/import schedule |

Supported platforms: `instagram`, `tiktok`, `linkedin`, `youtube`. URLs must be
HTTPS public profile URLs for the selected platform, without query params,
credentials, ports or fragments. One imported profile per user/platform; unlink
before changing its URL. Instagram content/login URLs and arbitrary hosts are
rejected. YouTube supports `/@handle` and `/channel/UC...` here; its existing
link route remains available separately.

Example import (synthetic profile; use your own authorized URL for a real run):

```json
{
  "platform": "tiktok",
  "profile_url": "https://www.tiktok.com/@viralpilot_fixture",
  "authorized": true,
  "max_posts": 30
}
```

202 response (illustrative ID/time):

```json
{
  "id": "example-job-id",
  "platform": "tiktok",
  "status": "queued",
  "phase": "queued",
  "progress": 0,
  "created_at": "2026-10-24 12:00:00",
  "updated_at": "2026-10-24 12:00:00",
  "error": null,
  "snapshot_id": null
}
```

`progress` is a stage indicator, not an estimated percent of remote scraping.
Jobs move through queued, launch-intent, polling, results and complete phases.
LinkedIn personal profiles run profile then posts agents. No interim raw export
is saved; only normalized public profile data is retained between those agents.

Missing credentials/disabled worker: 503. Invalid URL/body: 422. Other owner's
job or absent successful snapshot: 404. Changed profile/uncertain launch: 409.
After a completed/failed request, refresh cooldown is 15 minutes (429).
Repeated active imports return the existing job and do not launch another run.

## Normalized data and metric semantics

Types live in `api/social_schemas.py`: `ImportRequest`, `SocialPost`,
`SocialSnapshot`, `HistoricalSnapshot`, `JobOut`, `RefreshRequest`, `ScheduleRequest`.
Example selected fields from the actual synthetic Instagram fixture:

```json
{
  "platform": "instagram",
  "username": "viralpilot_fixture",
  "profile_url": "https://www.instagram.com/viralpilot_fixture",
  "external_id": "fixture-ig-creator",
  "display_name": "Synthetic Creator",
  "followers": 12500,
  "following": 210,
  "total_posts": 84,
  "data_source": "apify",
  "visibility": "public_metrics",
  "posts": [
    {
      "post_id": "ig-fixture-1",
      "url": null,
      "caption": "A synthetic editing tutorial",
      "posted_at": "2026-09-01T12:00:00Z",
      "format": "video",
      "views": 45000,
      "likes": 3200,
      "comments": 140,
      "shares": null
    }
  ]
}
```

Actual responses also include collection-time `last_updated`, `warnings`,
`metrics` and all sampled posts. Historical timestamps are UTC. Account total
posts and imported sample size are distinct. Stable provider post IDs (or stable
post URLs where supported) deduplicate rows; missing identities are skipped.
Bad/negative/abbreviated counts are null, known zero remains zero.

| Platform | Followers | Public post counters | Limits |
| --- | --- | --- | --- |
| Instagram | `followersCount` | `videoViewCount`, `likesCount`, `commentsCount` | Embedded latest posts only; shares unavailable |
| TikTok | `authorMeta.fans` | `playCount`, `diggCount`, `commentCount`, `shareCount` | Requires matching creator rows; empty/private result cannot establish a profile |
| LinkedIn | Explicit mapped follower field if available | Authored post likes, comments, reposts if exported | No private views/impressions; no connections-to-followers inference |
| YouTube | Subscribers unless hidden | Raw API `viewCount`, `likeCount`, `commentCount` | Shares/watch time unavailable; uses existing `fetch_channel` |

Averages use only known values and each reports `<metric>_sample_size`.
`typical_views` is median sampled views, preferring posts at least 7 days old.
Aggregate `engagement_rate` requires all of likes/comments/shares per included
post. It is a **fraction**, not percent. Prefer summed interactions divided by
summed positive known views; otherwise use known followers times the complete
post count. `engagement_basis`, `engagement_components` and
`engagement_sample_size` explain the calculation. For Instagram/YouTube it is
normally null because shares are unavailable; available likes/comments remain
usable separately. Zero-view posts are excluded from view-based engagement.

`posts_per_week` describes intervals in the dated sample, and
`posting_hours_utc` is an observed frequency histogram. Neither is a claim about
the optimal time to publish. Missing dates do not contribute to these fields.

## Persistence, reliability and deployment

- `SOCIAL_LINKS`: saved request, latest/active job, latest snapshot, optional schedule.
- `SOCIAL_JOBS`: durable phase/status, provider IDs, retry timing, deadline and safe errors.
- `SOCIAL_SNAPSHOTS`: immutable normalized JSON per successful job.
- `ACCOUNTS`: refreshed public statistics; existing audience and unrelated extra
  metadata preserved. `POSTS`: upsert by `(user_id,platform,external_id)`; previously
  observed posts remain until unlink. GET posts returns the latest sample, while
  the existing dashboard can read retained POSTS. Raw exports, contact details,
  session credentials and console logs are not persisted.

Snapshot, account, post and success-status writes share `db.transaction()` and
commit together. On failure the last successful data remains. Completion checks
the active link and user inside the same transaction, so deletion/unlink cannot
be undone by an in-flight response. Deletion removes local records; an already
accepted provider job may still finish remotely and must be stopped in its console.

The opt-in poller runs in the FastAPI lifespan, at most five jobs per tick,
sequentially. It waits around five seconds between ticks; remote calls can make
that longer. Network I/O is async, database/YouTube operations use a thread pool.
Schedules persist while the API is down and resume after restart; one due run is
queued, without replaying every missed interval. Failed scheduled attempts are
retried at the next scheduled interval; configuration presence is visible through
the status endpoint. Refreshes share cooldown and active-job checks.

**Run exactly one API process with this worker enabled.** The shared DB lock
serializes imports and completion in this process. SQLite transactions enforce
local atomicity; standard Snowflake table primary keys are informational. This
is not a distributed queue/lease implementation. `WEB_CONCURRENCY != 1` is rejected
when enabled, but launch commands must also use `--workers 1`. Multiple replicas
or a separate worker process require a proper distributed claim/lock mechanism
before enabling social collection. API requests can otherwise race into paid
duplicate runs. Do not deploy multiple copies against the same database yet.

Provider IDs are persisted for restart-safe polling. A launch-intent marker is
saved before a paid POST. A POST timeout/ambiguous server response or restart
before the ID is saved becomes `needs_attention`; there is no automatic replay.
Inspect the provider console and wait/abort/reconcile the old run before sending
`{"acknowledge_uncertain_launch":true}` to refresh (cooldown still applies).
Provider GET errors retry with bounded exponential backoff; 429 respects numeric
Retry-After (15–3600 seconds), at most five retries. Failed/aborted remote runs
are errors, not empty successes. Jobs have a 30-minute local deadline; remote
run deadlines/aborts remain provider-side. No guaranteed cancellation or billing
reconciliation is claimed.

## AI/ML integration

No model retraining, new features or model schema changes. Imported account
followers and median views go into existing `accounts.model_context()`;
Instagram also supplies following/total posts. Existing explicitly supplied
prediction values still override account defaults. Missing values are omitted
from model context rather than replaced with fabricated numbers.

`accounts.audience_summary()` adds bounded public-history context from
`ACCOUNTS.extra.social_data`: source, as-of time, sample metrics, posting-hour
distribution and up to five short recent captions. It labels external text as
untrusted data. Existing `/score` passes this to Gemini. Gemini can use this
context for creator-specific ideas/recommendations without pretending to have
private analytics or proven best posting times. Follow-up idea generation remains
the existing scoring/suggestion flow; no new standalone ideas endpoint is added.

## Tests and live acceptance checklist

```sh
python -m unittest tests.test_social_integration -v
python -m unittest discover -s tests -v
python -m compileall -q api tests
```

The new tests isolate SQLite and environment settings and do not call paid
services. Full discovery includes existing data/model/adapter regression tests.
An existing private-key-path assertion was made portable for Windows; credential
loading behavior is unchanged.

Before declaring live integration successful:

1. Set tokens/agent IDs, authorized provider connection, input keys, saved limits
   and verified export mappings. Confirm export hosts/header using your workspace.
2. Start a single API process with worker enabled. Authenticate in `/docs`.
3. Import one authorized profile per platform with a small sample. Record job/run
   status, inspect real normalized counters against provider results and check nulls.
4. Repeat after cooldown; verify stable post IDs, a second snapshot, preserved
   audience settings and creator context in a real prediction/review.
5. Exercise optional schedule and expiry/auth failure. Confirm prior data survives.
6. Verify Snowflake transactions/schema with the team's role and namespace.

### Live Instagram/TikTok acceptance results

Collected October 25, 2026 around 00:48 UTC (October 24 local New York time),
using the two public profiles supplied by the user. Exactly one actor run per
profile was launched, with a three-post sample ceiling; no repeated scraping or
scheduled refresh was enabled.

| Profile | Public followers returned | Account total posts | Posts saved | Result |
| --- | --- | --- | --- | --- |
| Instagram `cristiano` | 679,812,464 | 4,148 | 3 | succeeded |
| TikTok `leagueoflegends` | 1,900,000 | 932 | 3 | succeeded |

Numbers are provider observations at collection time, not permanent values.
Instagram sampled posts exposed likes/comments, with unavailable views/shares
remaining null. TikTok supplied views/likes/comments/shares. Small samples can
include pinned content and are not representative performance estimates.

Validation used the actual FastAPI import/status/stats/posts/history endpoints,
signed sessions, actual Apify HTTP launches/polling/datasets, and actual SQLite
transactions. Stats, posts, history and job retrieval returned HTTP 200;
unauthenticated stats returned 401. Six posts were saved. A separate read-only
dataset check confirmed saved followers and post counters matched provider fields.
Existing model-context helpers exposed imported followers and supported median
views/following/total-post fields. No Gemini generation or model prediction was
called during this collection test.

All test records are isolated in ignored `.secrets/social-validation.db`, under
a dedicated test user, with an ignored summary and rerunnable validation script.
Production Snowflake, existing users and their linked profiles were not modified.
The runner reuses its saved job IDs on repeat, rather than launching fresh runs.
No raw contact exports, session cookies or API credentials are in the summary.

Still pending: live LinkedIn account connection/exports, new Snowflake transaction verification,
scheduled live refresh/second snapshot after cooldown, and real review generation
using imported context. Offline tests cover refresh/history/failure paths.

### LinkedIn agent setup progress

The official public script metadata was fetched through `/scripts/fetch-all` and
`/scripts/fetch` (no configured agent arguments or session cookies were retrieved).
The current schemas confirm `spreadsheetUrl`, Profile Scraper's
`numberOfAddsPerLaunch`, and Activity Extractor's `numberMaxOfPosts`. The adapter's
allowed limit fields and regression tests now cover those exact parameters.

Created via `/agents/save` and verified through `/agents/fetch-all?withArgument=false`:

- `ViralPilot - LinkedIn Profile`: configured for one profile, no contact/email
  enrichment, no CRM publishing.
- `ViralPilot - LinkedIn Posts`: configured for up to three authored Post activities,
  recent ordering, reprocessing enabled, one profile input.

Both agents use manual launch settings and the user-supplied public test profile
`https://www.linkedin.com/in/imdadul-islam-sohel-311b8a425/`. Their IDs and matching
input/limit settings are stored only in the ignored root `.env`.
The API schema requires a provider-managed identity or authorized LinkedIn session;
that connection must be completed inside each agent's PhantomBuster setup, using
the supported connection UI/extension. No LinkedIn scraper was launched yet.
Live output columns/metrics remain unverified until that step is complete.

At agent creation, 77 tests passed, including the verified limit parameter names.
The current checkpoint has 81 passing tests, including provider-disable safeguards
and native export/status mappings. The user subsequently authorized saving this
checkpoint to its feature branch; no main merge is authorized.

## Official sources reviewed

- [Apify Instagram actor output](https://apify.com/apify/instagram-scraper)
  and [input schema](https://apify.com/apify/instagram-scraper/input-schema)
- [Apify TikTok actor output](https://apify.com/clockworks/tiktok-scraper)
  and [input schema](https://apify.com/clockworks/tiktok-scraper/input-schema)
- [Apify run API](https://docs.apify.com/api/v2/actors-runs-post)
- [PhantomBuster launch API](https://hub.phantombuster.com/reference/post_agents-launch),
  [container status](https://hub.phantombuster.com/reference/get_containers-fetch),
  [result object](https://hub.phantombuster.com/reference/get_containers-fetch-result-object)
- [PhantomBuster general API/auth guide](https://hub.phantombuster.com/docs/api)
- [Authorized LinkedIn connection](https://support.phantombuster.com/hc/en-us/articles/24572365472786-How-to-Connect-Your-LinkedIn-Account-to-PhantomBuster)
- [Company Scraper capabilities](https://landing.phantombuster.com/linkedin-company-scraper)

Provider fields/plans evolve. Keep a sanitized, consented real fixture and update
the mappings/tests when the team verifies its configured agents; never commit
tokens, private contact exports or session cookies.
