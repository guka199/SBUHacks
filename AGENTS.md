# AGENTS.md — shared context for AI coding tools

Read this before making changes. It is the single source of truth for every teammate's AI assistant
(Claude Code, Cursor, Copilot, Codex, ...). When a decision changes, update this file in the same PR.

## Project

**PostPilot** — SBUHacks 2026 hackathon project (24h). One place for content creators and business pages to:

1. **Compare engagement across platforms** (YouTube, TikTok, Instagram, LinkedIn) in one dashboard.
2. **Score a draft before publishing** with a **combined score**: our own trained model + Gemini (see Scoring).
3. **Get 2–3 specific suggestions** (SHAP factors + Gemini's content review) and see the score change when applied.

Inspired by CreatorML (YC W23, shut down 2024): it was YouTube-only and big-channel-only. We are
cross-platform and aimed at small creators and local businesses.

**Sponsor tech (each must do real work in the demo):**
- **Snowflake** — the only data store; Cortex for sentiment, embeddings and suggestion text.
- **ElevenLabs** — spoken weekly briefing + hook tester (same hook in several voices).
- **Solana (devnet only)** — users earn SPL tokens for sharing anonymized post data, which grows the training set.

## Architecture

One monorepo. Do not split it.

| Folder | Language | Purpose |
| --- | --- | --- |
| `web/` | TypeScript, Next.js 16 App Router, Tailwind v4 | Website. Pages: `/`, `/dashboard`, `/score`, `/rewards`. `app/api/reward/route.ts` sends Solana tokens server-side. |
| `api/` | Python, FastAPI | Backend. Routers: `ingest`, `dashboard`, `predict`, `voice`, `contribute`. Services: `snowflake`, `youtube`, `elevenlabs`, `model`. |
| `ml/` | Python: scikit-learn, XGBoost, LightGBM, CatBoost, PyTorch | Training (see "Model selection"). `data.py` splits + features, `models.py` registry of 13 candidate models behind one `fit`/`predict` interface, `torch_models.py` deep nets, `metrics.py`, `benchmark.py` compares all models, `train.py` trains the chosen one, `preflight.py` checks, `isolation.py` runs each benchmark model in its own process. |
| `shared/` | Python | Used by BOTH `ml/` and `api/`: `features.py` (per-platform features), `text_features.py` (caption topics: TF-IDF → SVD), `bundle.py` (`ModelBundle` = model + exact feature columns + caption encoder). |
| `data/` | SQL, Python | `sql/` table + Cortex scripts, `loaders/` into Snowflake, `samples/` demo CSV. |
| `models/` | — | `<platform>.joblib` bundles + `metrics_<platform>.json` (from `ml/train.py`, loaded by `api/services/model.py`); `benchmark/report.md` + `results.csv` (from `ml/benchmark.py`). |

## Scoring: our model + Gemini (decided)

A draft gets two scores, combined into one (start with **60% model + 40% Gemini**, tune later):

| Part | Looks at | Why |
| --- | --- | --- |
| **Our model** (one per platform, `models/<platform>.joblib`; type chosen by `ml.benchmark`) | caption stats, timing, account context (followers, duration, category, ...) | Learned from ~1.2M real posts and their outcomes |
| **Gemini API** (at request time, not trained) | the actual image / video / caption content: hook, visual quality, clarity, trend fit | Our datasets have no usable images or videos, so content judgment comes from Gemini |

Gemini also receives the model's top SHAP factors and writes ONE merged suggestion list.
Built: `POST /score` (multipart: caption, platforms, optional image/video, context JSON) in `api/routers/score.py`,
Gemini call in `api/services/gemini.py` (google-genai Interactions API, structured JSON output, files >18 MB via
the Files API). Blend weight `SCORE_MODEL_WEIGHT` (default 0.6), model `GEMINI_MODEL` (default `gemini-3.5-flash-lite`: ~3 s per review; `gemini-3.8-flash` took 2–5 min in testing).
Without `GEMINI_API_KEY`, or if Gemini fails, `/score` returns model-only scores plus a `warning` (never an error).
`/predict` stays model-only. The `/score` web page uploads media and shows combined + model + content scores.

## Users & linked accounts (built)

- **Sign up / sign in / settings**: `api/routers/auth.py` (`/auth/signup|login|logout`, `GET|PATCH /auth/me` profile,
  `POST /auth/password`, `POST /auth/delete-account` - password-confirmed; deletes the user's rows in every table and
  their `@MEDIA/<user_id>/` files). Web: `/settings` (name in the nav links there). Passwords hashed with scrypt; session =
  HMAC-signed httpOnly cookie `pp_session` (secret: `SESSION_SECRET` in `.env`). Web: `/signup`, `/login`,
  `web/lib/auth.tsx` (`useAuth()`), every `fetch` sends `credentials: "include"`.
- **Linked accounts**: `api/routers/accounts.py`, one per platform per user. YouTube links automatically from a channel
  URL/@handle (`youtube.channel_summary`: subscribers, typical views = median of uploads older than 7 days, engagement,
  posts/week, Shorts share, top categories; recent videos saved to POSTS). TikTok/Instagram/LinkedIn: manual stats form
  (their APIs need approved developer apps). Target audience (age range, % female, countries, interests, language)
  for every platform. Web page: `/accounts`.
- **Scoring uses them**: `/predict` and `/score` fill missing model inputs (followers, typical views, ...) per platform
  from the signed-in user's linked accounts (`accounts.model_context`); request values win. Gemini gets a one-line
  creator/audience profile (`accounts.audience_summary`).
- **Storage (live in Snowflake)**: `api/services/db.py` - Snowflake when `SNOWFLAKE_ACCOUNT` is set, otherwise local
  SQLite `data/local.db` (git-ignored). Tables (auto-created at API startup in POSTPILOT.APP): USERS, ACCOUNTS,
  DRAFTS (every draft a signed-in user scores: caption, scores, suggestions, Gemini review), POSTS (linked YouTube
  videos). Uploaded images/videos go to the internal stage `@MEDIA/<user_id>/` (locally `data/uploads/`).
  Use `db.query` / `db.execute` / `db.execute_many` (bulk inserts: one round trip) with `%s` placeholders.
  **Reserved words in Snowflake** (`following`, `connection`, ...) can't be column names - `accounts.COLUMNS` maps them.
- **Snowflake access**: service user `POSTPILOT_SVC` (role `POSTPILOT_APP`, warehouse `POSTPILOT_WH`) with key-pair
  auth: private key `.secrets/snowflake_key.p8` (git-ignored; `SNOWFLAKE_PRIVATE_KEY_PATH`). Setup script:
  `data/sql/000_snowflake_setup.sql`. In Snowsight, select ALL text then run (Run alone executes only the
  statement under the cursor). Teammates need their own key pair registered on the user (`ALTER USER ... SET
  RSA_PUBLIC_KEY_2 = '...'` allows a second key).

## Training data and labels

Raw downloads in `data/raw/<platform>/` (git-ignored; see "Getting the data"). `python -m data.prepare` writes
`data/processed/<platform>.parquet` (git-ignored) in one shared format: core columns + `extra` (JSON) for
platform-only fields.

| Platform | Source | Posts | Label (`relative`) |
| --- | --- | --- | --- |
| TikTok | Hugging Face `The-data-company/TikTok-10M`, 1 of 10 parquet parts | 585K | the post's own log views; INPUT `creator_typical_views` = geometric mean of the creator's OTHER posts (hidden on 20% of rows so blank input works). Creators with ≥3 posts |
| Instagram | Hugging Face `vargr/main_instagram` | 549K | (likes + comments) / followers (accounts ≥100 followers) |
| YouTube | **YouTube Data API v3** (`python -m data.loaders.youtube_api`): full recent upload histories of 1,199 channels seeded from the Kaggle trending dataset | 70K (of 129K collected; only videos 30–730 days old) | the video's own log views; INPUTS subscribers (`followers`) + `creator_typical_views` (each hidden on 20% of rows), age (drafts scored at 90 days), duration, Short or not, category |
| LinkedIn | Kaggle `shreyasajal/linkedin-influencers-data` | 32K | (reactions + comments) / followers — only 67 people, unreliable |

`virality_score` = percentile of `relative` within the platform (0–100). This is what the models predict.
Do not use the Kaggle `yakhyojon/tiktok` dataset (likely synthetic). TikTok cover URLs have expired;
YouTube thumbnail URLs still work (usable for CLIP).

## Model selection (decided: CatBoost)

`python -m ml.benchmark` compared 13 model types on the same creator-grouped splits (100K train / 50K test posts per
platform; test creators never seen in training). Full tables: `models/benchmark/report.md`.

| Model | Mean rank (TikTok, YouTube, Instagram) | Mean Spearman | Tied with best |
| --- | --- | --- | --- |
| **CatBoost** | **1.3** | **0.269** | **3/3** |
| XGBoost | 3.3 | 0.266 | 2/3 |
| LightGBM | 4.0 | 0.263 | 1/3 |
| FT-Transformer (deep) | 4.3 | 0.258 | 2/3 — but ~110 s to train, no SHAP |
| Random forest / extra trees | 7.0–7.7 | 0.254 | 1/3 |
| Neural nets (MLP, ResNet) | 7.3–9.0 | 0.247–0.255 | 0–1/3 |
| KNN | 12.3 | 0.174 | 0/3 |

CatBoost: best everywhere, least overfitting of the boosters, fast (<1 ms/post), SHAP works (suggestions).
Gradient-boosted trees beat deep learning on this tabular data, as is typical. LinkedIn is reported, not ranked.

**Served models** (CatBoost on ALL data, `python -m ml.evaluate`):

| Platform | Spearman [95% CI] | AUC (viral = top 25%) | Lift@25 |
| --- | --- | --- | --- |
| Instagram | 0.675 [0.669, 0.679] | 0.831 | 2.32 — mostly account size |
| LinkedIn | 0.455 [0.166, 0.653] | 0.705 | 1.25 — very uncertain (67 creators) |
| YouTube | 0.774 [0.736, 0.814] | 0.885 | 2.63 — typical views alone 0.79; model adds duration, description, age (0.82 when both account inputs are given; 0.35 with neither) |
| TikTok | 0.435 [0.425, 0.444] | 0.711 | 1.83 — almost all from the account's typical views (alone: 0.48 on rows that have it); blank input: 0.21 |

**Second prediction: "vs. your average"** (`python -m ml.train --target relative` -> `models/<platform>_relative.joblib`).
Label `account_relative` = log(post result / the creator's typical result on OTHER posts). Returned per platform as
`vs_account` {ratio, percent, reliability, expected_views} by `/predict` and `/score`; shown separately on the Score
page, NOT blended into the 0-100 score. `log_creator_typical_views` is never an input here (within one creator it is
a function of the post's own views = leakage; see `LEAKY_FOR_RELATIVE` in `ml/data.py`).

| Platform | Ranks an account's own posts (Spearman) | Above/below-average accuracy (base) | Reliability label |
| --- | --- | --- | --- |
| YouTube | 0.27 (189 channels) | 59.7% (53.3%) | moderate |
| LinkedIn | 0.25 (14 people) | 59.4% (53.2%) | moderate (tiny sample) |
| Instagram | 0.11 | 53.3% (50.1%) | moderate |
| TikTok | 0.04 | 51.4% (53.5%) | low - UI says "too uncertain to call" |

Leakage checks done on YouTube: 0 channels shared across splits, no outcome columns as inputs, typical views from PAST
videos only gives Spearman 0.81 (no time leak). Within-channel ranking of the 0-100 model: 0.23.

TikTok was reframed from "beat your own average" (Spearman 0.04) to "expected reach for this account" by adding the
creator's typical views as an input (`creator_typical_views` in `/predict` and `/score` context; a field on the Score page).
Scores are percentiles vs. TikTok-10M, which skews popular (median ~450K views), so small accounts score low.

Takeaway: caption stats and timing barely predict whether a video beats its creator's average; the content does.
That is why Gemini judges the content. More model capacity does not help (the benchmark shows it) - only new
information would (e.g. CLIP features from YouTube thumbnails).

**Pipeline:** `data/raw` → `data.prepare` → `ml.benchmark` (pick a model type) → `ml.train` → `models/<platform>.joblib`
→ `/predict` (features via `shared/features.py`, model score, SHAP factors) → [Gemini content score + merged suggestions] → web.
Snowflake holds the app's data (user posts, predictions, contributions); training currently reads local parquet.

## Commands (run from repo root unless noted)

```bash
source .venv/bin/activate
pip install -r ml/requirements.txt               # ml deps include api deps
uvicorn api.main:app --reload                    # API on :8000, docs at /docs
python -m data.prepare [tiktok youtube instagram linkedin]  # data/raw -> data/processed + labels (~20 s)
python -m ml.preflight                           # check data, libraries, GPU before training (~3 s)
python -m ml.benchmark --smoke                   # every model x platform on tiny data: catches errors (~2 min)
python -m ml.benchmark                           # full comparison -> models/benchmark/report.md (~40 min)
python -m ml.train [platforms] [--model NAME]    # train the chosen model type on all data -> models/<platform>.joblib
python -m ml.evaluate                            # metrics of the models the API serves
python -m data.loaders.load_csv <file.csv> [--platform tiktok --map "theirs=ours,..."]
cd web && npm run dev                            # website on :3000
cd web && npx tsc --noEmit && npm run lint       # check web before committing
```

**Getting the data** (into `data/raw/<platform>/`):
- Instagram: `curl -L -o data/raw/instagram/main_instagram.parquet https://huggingface.co/datasets/vargr/main_instagram/resolve/main/data/train-00000-of-00001-b6868cb1ddbd5c6a.parquet`
- TikTok: `curl -L -o data/raw/tiktok/tiktok_part0.parquet https://huggingface.co/datasets/The-data-company/TikTok-10M/resolve/main/data/train-00000-of-00010.parquet`
- YouTube: `kagglehub.dataset_download("rsrishav/youtube-trending-video-dataset", path="US_youtube_trending_data.csv")` (+ `US_category_id.json`)
- LinkedIn: download `influencers_data.csv` from Kaggle `shreyasajal/linkedin-influencers-data`

macOS: XGBoost needs `brew install libomp`. Use Python 3.11–3.12 if torch/open_clip fail to install.

## Rules

- **Never commit secrets.** Keys live in `.env` (git-ignored); add new key NAMES to `.env.example`.
  Next.js reads `web/.env.local` (a copy of `.env`).
- **Features change only in `shared/features.py`.** `FEATURE_COLUMNS` order is what saved models expect —
  changing it means retraining.
- **Keep `web/lib/api.ts` types in sync with `api/schemas.py`.** Change both in the same commit.
- `/predict` must keep working without a trained model (returns fake scores) so the frontend is never blocked.
- Solana: **devnet only**. The payout wallet's secret key is only ever used server-side.
- Don't commit datasets (put downloads in `data/raw/`, git-ignored). Model files < ~50 MB are fine.
- Next.js 16 has breaking changes vs. older versions: read `web/AGENTS.md` and `web/node_modules/next/dist/docs/`
  before writing Next.js code.
- **macOS: PyTorch cannot share a process with XGBoost/LightGBM** (two OpenMP runtimes: deadlock or segfault,
  tested both orders). `ml.benchmark` runs every model in its own process; the API serves ONE model type.
- New model? Add it to the registry in `ml/models.py`, then `python -m ml.benchmark --smoke` before any long run.
- Compare models only through `ml.benchmark` (same creator-grouped split, same metrics, test set untouched).
- Prefer working end-to-end over polished parts: a weak model wired into the app beats a great unconnected one.
- One branch per feature, small PRs, `main` always runs.

## Ownership

| Area | Owner |
| --- | --- |
| `ml/`, `shared/` | ML lead |
| `data/`, `api/` ingestion + dashboard | Data / backend |
| `web/` | Frontend |
| ElevenLabs, Solana, pitch | Integrations / pitch |

## Status and TODO

Done: scaffold, data download + cleaning, YouTube API collector, 13-model benchmark, CatBoost score + vs-average models
for all platforms, `/predict` + `/score` with Gemini (live, gemini-3.5-flash-lite), Score page (media upload,
combined/model/content scores, vs-your-average). **Models are frozen - next is building the app.**

Backend/data implementation: `python -m data.setup` creates/migrates the configured Snowflake namespace;
password or PAT (`SNOWFLAKE_TOKEN`) auth; validated YouTube/CSV imports MERGE by `(user_id,platform,external_id)`
and preserve raw payloads in the same transaction. `data.seed_demo` loads 10 labeled recent sample posts.
Dashboard response now includes `by_format`, `weekly`, `recent_posts`, `accounts`, `total_posts`, `last_import_at`.
Cortex routes: `POST /data/enrich`, `POST /data/{user_id}/similar`, `POST /dashboard/{user_id}/insights`.
Uses current `AI_SENTIMENT`, `AI_EMBED`, `AI_COMPLETE`; enrichment is bounded and optional after ingestion.
Scores with a user ID persist to `PREDICTIONS`; web scoring defaults to `demo`; response fields `prediction_id` and
`storage_warning` report saves without blocking scoring. History: `GET /dashboard/{user_id}/predictions`.
`GET /data/status` exposes configuration readiness (variable names only), optional `?check_connection=true`.
Live validation completed 2026-10-24 using the `POSTPILOT_APP` role: all seven tables created, 10 demo posts
loaded and enriched; repeating the seed updated 10/inserted zero and kept the dashboard at 10 posts.
Dashboard HTTP/UI, Cortex sentiment/embeddings/semantic search/insights, a one-video public YouTube import,
and a 10-row multipart CSV import under separate validation users,
and a real Gemini score saved to history for two platforms all succeeded. An empty user's dashboard returned zero.
Fixed live connector INSERT batching and JSON-encoded Cortex briefing text; 29 backend regression tests pass.
Manual administrator provisioning: `data/sql/000_app_access.sql`. Setup/API handoff: `docs/backend-data.md`.
Regression checks: `python -m unittest tests.test_backend_data -v`. User IDs select demo data; verified authentication
must be connected by the login/wallet implementation before public deployment.

Next (in order):
- [ ] **Solana**: Phantom connect on `/rewards` (window.phantom.solana, no extra deps) + a script that creates the devnet
      payout wallet and reward token and writes `REWARD_WALLET_SECRET_KEY` / `REWARD_MINT_ADDRESS` to `.env`
- [x] **Snowflake live**: key-pair service user, POSTPILOT.APP tables, users/accounts/drafts + Cortex analytics
- [ ] **Dashboard UI**: wire YouTube/CSV controls and chart the backend's `platforms`, `by_format`, `weekly` data
- [ ] **ElevenLabs**: needs `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`; weekly briefing + hook tester
- [ ] Copy `.env` to `web/.env.local` (Next.js reads env from web/)
- [ ] Test `/score` with a real video upload
- [ ] Demo: sample account with good data, rehearse 3-minute flow, backup video
- Later (models): CLIP thumbnail features for YouTube; re-run full `ml.benchmark` (report reflects old TikTok/YouTube data)

**Demo flow:** connect YouTube + upload a TikTok CSV → dashboard compares → score a draft → apply a
suggestion, score rises → play ElevenLabs briefing → share data, receive Solana tokens.


## ViralPilot frontend integration (October24,2026)

The user authorized merging the cinematic ViralPilot frontend into main. It lives in frontend/ within this same monorepo; the original web/ and all backend/ML/data code are preserved. Use cd frontend && npm ci && npm run dev for this interface (Node22+). Check with npm run check and npm run build there. frontend/AGENTS.md has its Next.js guide requirement. Root FRONTEND_HANDOFF.txt is the canonical team guide; frontend/ASSET_NOTICES.md retains artist/license attribution. The interface now defaults to live mode through the same-origin /backend proxy; /demo and the homepage walkthrough remain illustrative. The authenticated /api/analyses adapter reuses the existing scorer and saves owner-scoped reports/media in the app database. Setup and revised contract: docs/frontend-backend.md (supersedes the original API section of FRONTEND_HANDOFF.txt). Do not silently remove the working web/ integrations or expose backend keys through NEXT_PUBLIC variables.

## Frontend/API integration

- Feature branch: codex/frontend-api-integration. No model retraining or changes to served bundles.
- frontend/ now has signup/login, accounts, settings, reports and real upload/report/optimizer requests.
- api/routers/analyses.py + api/analysis_schemas.py mirror frontend/src/lib/contracts.ts. POST creation is synchronous and returns a complete job; GET/list/video/rewrite all require the existing signed user session and enforce owner scope.
- ANALYSES is created by db.init() in Snowflake or SQLite. Account deletion includes reports/media. Video endpoints serve local files or short-lived Snowflake ANALYSIS_MEDIA stage URLs; this separate SSE stage supports browser playback while preserving the original MEDIA stage.
- Real /score hook/visual-quality/clarity values are displayed. No made-up pacing/format scores. Timestamps are Gemini's own `moments` (unclear / pacing / improve, validated against the duration by `gemini.clean_moments`), shown as timeline markers, "Moments that matter" and the results page's **Overall suggestions** section (whole-video edits + playable "Clips to fix").
- **Thumbnails**: the upload page takes 0-3 optional thumbnails (JPEG/PNG/WebP, ≤10 MB each, decoded with Pillow). `gemini.compare_thumbnails` scores each one per chosen format (with that format's aspect ratio/crop context) in parallel with the video review; the report's `thumbnails` holds per-platform scores, strengths/improvements and `picks` (highest score per platform). Images are stored next to the video (`<report id>_thumb<i>.<ext>` in ANALYSIS_MEDIA) and served by `GET /api/analyses/{id}/thumbnails/{index}`. If Gemini fails, the report still completes with a warning and no thumbnail section.
- Second local dev server: `NEXT_DIST_DIR=.next/test API_URL=http://127.0.0.1:8010 npx next dev -p 3010` (Next allows one dev server per build folder; it adds `.next/test` paths to `tsconfig.json` - don't commit that). Model-only review warnings stay visible; missing model bundles fail explicitly. Publishing copy is generated on request from the actual caption/review using Gemini, then persisted.
- Shorts maps to the same YouTube trained model with actual duration, with a separate Gemini format review. Models and feature contracts are unchanged.
- Browser uploads are limited to 200 MB. Next rewrites /backend/* to server-only API_URL, with 205 MB multipart buffer and ten-minute timeout; no provider keys in frontend env.
- Local frontend :3010 and API :8010 now use the shared Snowflake POSTPILOT.APP database through the verified personal key-pair login (POSTPILOT_DEV_MIKHAEL / POSTPILOT_APP / POSTPILOT_WH). Prior configuration is backed up only in ignored .secrets/; other provider credentials are preserved. Local SQLite accounts do not automatically migrate to Snowflake.
- Cancel ends the client request; accepted server work may still finish. Simultaneous report rewrites are last-writer-wins. Browser-supplied metadata is validated but not probed by a server codec tool.
- Checks passed: 40 Python tests (29 existing + 11 adapter), 10 frontend tests, lint/typecheck/build and Python syntax compilation. Personal key-pair Snowflake login and the live frontend-proxy signup/account/scoring/report/media/rewrite/ownership flow were exercised. Temporary test accounts and data are removed. Gemini rewrites use required bounded fields and a 2,048-output-token cap after a live malformed-output failure was fixed.

## First-five-seconds review

- User authorized merging/pushing this work to main after checks. Starting point: `feature/five-second-hook-review` combines team main `9c26d87` and saved social checkpoint `644f03f` in `42e56d9`. Preserve subsequent remote main changes; no force push.
- `api/services/hooks.py` + `api/hook_schemas.py` add an optional Gemini editorial rubric, exposed as `/score` content.hook_analysis and `/api/analyses` result.hookAnalysis. Same Gemini request, no new ML model/features/blend changes. Keep native TypeScript schemas in frontend/src/lib/contracts.ts and web/lib/api.ts synchronized.
- Review window is 0 to min(5, reported duration); four criteria have nullable ratings/evidence. Mean only assessed criteria. This is not ECR, measured retention or a calibrated audience probability. No SnapUGC weights/training/data included.
- Dashboard HookReview shows observed/proposed opening, copy, grounded spans and bounded clip playback. Old reports and absent/failed Gemini have honest unavailable states. Invalid optional-hook output must not discard valid whole-video/thumbnail results. Homepage, 3D and cinematic timeline are unchanged.
- Verification: 100 Python tests, 12 frontend tests, lint/typecheck/production build; real Gemini reviewed an original 8-second QA video and saved/reopened the result through an isolated SQLite API. Desktop/phone browser checks and copy/playback passed. All keys, QA users/files/tools/reports remain ignored and production Snowflake/users are untouched.
- Full contract, research context and limits: docs/hook-analysis.md. PhantomBuster remains disabled.

## Social-data integration checkpoint

- Branch `feature/social-data-integration`, initially based on main `96caef2`. User authorized a checkpoint commit/push of this branch, followed by fetching the team's latest code. Do not push/merge main without separate approval.
- Current provider scope: Instagram/TikTok via Apify and existing YouTube. User dropped PhantomBuster; keep `PHANTOMBUSTER_ENABLED=false` (default and local `.env`). No further LinkedIn provider calls/runs unless explicitly requested. Existing manual LinkedIn statistics remain supported.
- `api/social_schemas.py` and `api/routers/social_accounts.py` add authenticated asynchronous import, jobs, stats, posts, history and schedules. `/docs` is the test interface. Existing frontend/model contracts remain intact.
- `api/services/apify.py`, `phantombuster.py` (inactive), `social_http.py`, `social_normalize.py`, `social_store.py`, `social_jobs.py` implement bounded provider requests, nullable public metrics, durable launch intent/recovery and atomic snapshots. Three additive SOCIAL_* tables live in `db.SCHEMA`.
- Imported data updates ACCOUNTS/POSTS and existing model/Gemini context, preserving audience settings and unrelated metadata. No retraining, model bundle changes or feature-definition changes in this checkpoint.
- `SOCIAL_WORKER_ENABLED=true` is opt-in. Run exactly one API process (`--workers 1`); process-local DB lock does not provide distributed Snowflake uniqueness/leases. Standard Snowflake PKs are informational.
- Ambiguous paid launches/restarts require `needs_attention` review and explicit refresh acknowledgment. Known run IDs survive restart; per-stage IDs are retained. Last-good data survives failure. User deletion/unlink prevents in-flight responses from resurrecting account records.
- Provider keys are only in ignored local `.env`. Never print secrets, retrieve saved agent arguments/cookies, or commit `.secrets/` test data, downloaded references or provider outputs.
- Live Apify acceptance succeeded for user-supplied Instagram cristiano and TikTok leagueoflegends, three posts each. Actual import/status/stats/posts/history endpoints and isolated SQLite storage passed; counters matched provider datasets and unsigned stats returned 401. Imported model-context values verified without ML/Gemini calls. Production Snowflake/users were untouched.
- LinkedIn experiment did NOT produce a successful saved snapshot. The first profile attempt timed out because the agent timeout uses milliseconds; it was corrected to 600000 ms. Later containers finished, exposing v2 endType metadata and native export fields. Mappings/status handling were updated before the user stopped this integration. Manual agents remain in the provider account; the app integration is disabled.
- `tests/fixtures/social/` contains synthetic fixtures, not real creator exports. Full guide: `docs/social-data-integration.md`. Regression command: `python -m unittest discover -s tests -v`; checkpoint has 81 passing tests, compileall and clean diff checks. New Snowflake transactions, scheduled live refresh and real review generation using imported context remain unverified.
