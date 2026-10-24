# AGENTS.md — shared context for AI coding tools

Read this before making changes. It is the single source of truth for every teammate's AI assistant
(Claude Code, Cursor, Copilot, Codex, ...). When a decision changes, update this file in the same PR.

## Project

**PostPilot** — SBUHacks 2026 hackathon project (24h). One place for content creators and business pages to:

1. **Compare engagement across platforms** (YouTube, TikTok, Instagram, LinkedIn) in one dashboard.
2. **Score a draft before publishing** with a **combined score**: our own XGBoost model + Gemini (see Scoring).
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
| `ml/` | Python, XGBoost, SHAP | Training only (`train.py`, `evaluate.py`, `notebooks/`). Never imported by `api/`. |
| `shared/` | Python | `features.py` — feature building used by BOTH `ml/` and `api/`. |
| `data/` | SQL, Python | `sql/` table + Cortex scripts, `loaders/` into Snowflake, `samples/` demo CSV. |
| `models/` | — | Trained models `engagement_<platform>.json`, written by `ml/train.py`, read by `api/services/model.py`. |

## Scoring: our model + Gemini (decided)

A draft gets two scores, combined into one (start with **60% model + 40% Gemini**, tune later):

| Part | Looks at | Why |
| --- | --- | --- |
| **Our XGBoost model** (one per platform, `models/engagement_<platform>.json`) | caption stats, timing, account context (followers, duration, category, ...) | Learned from ~1.2M real posts and their outcomes |
| **Gemini API** (at request time, not trained) | the actual image / video / caption content: hook, visual quality, clarity, trend fit | Our datasets have no usable images or videos, so content judgment comes from Gemini |

Gemini also receives the model's top SHAP factors and writes ONE merged suggestion list.
Gemini is not built yet (`GEMINI_API_KEY` in `.env`); it is independent of the model and can be built in parallel.

## Training data and labels

Raw downloads in `data/raw/<platform>/` (git-ignored; see "Getting the data"). `python -m data.prepare` writes
`data/processed/<platform>.parquet` (git-ignored) in one shared format: core columns + `extra` (JSON) for
platform-only fields.

| Platform | Source | Posts | Label (`relative`) |
| --- | --- | --- | --- |
| TikTok | Hugging Face `The-data-company/TikTok-10M`, 1 of 10 parquet parts | 585K | log views vs. the same creator's OTHER posts (creators with ≥3 posts) |
| Instagram | Hugging Face `vargr/main_instagram` | 549K | (likes + comments) / followers (accounts ≥100 followers) |
| YouTube | Kaggle `rsrishav/youtube-trending-video-dataset`, US files only | 41K | log views vs. the same channel's other videos |
| LinkedIn | Kaggle `shreyasajal/linkedin-influencers-data` | 32K | (reactions + comments) / followers — only 67 people, unreliable |

`virality_score` = percentile of `relative` within the platform (0–100). This is what the models predict.
Do not use the Kaggle `yakhyojon/tiktok` dataset (likely synthetic). TikTok cover URLs have expired;
YouTube thumbnail URLs still work (usable for CLIP).

**Current results** (test set = creators never seen in training; full numbers in `models/metrics_<platform>.json`):

| Platform | Spearman | Top-25% precision (random 0.25) |
| --- | --- | --- |
| Instagram | 0.67 | 0.58 — mostly account size (small accounts have higher engagement rate) |
| LinkedIn | 0.29 | 0.89 — not trustworthy (67 creators) |
| YouTube | 0.05 | 0.26 — ~no signal |
| TikTok | 0.03 | 0.27 — ~no signal, even with 420K training rows |

Takeaway: caption stats and timing don't predict whether a video beats its creator's average — the content does.
That is why Gemini judges content. Next model experiments: caption embeddings, then CLIP on YouTube thumbnails.

**Pipeline:** `data/raw` → `data.prepare` → `ml.train` → `models/` → `/predict` (features via
`shared/features.py`, XGBoost score, SHAP factors) → [Gemini content score + merged suggestions] → web.
Snowflake holds the app's data (user posts, predictions, contributions); training currently reads local parquet.

## Commands (run from repo root unless noted)

```bash
source .venv/bin/activate
pip install -r ml/requirements.txt               # ml deps include api deps
uvicorn api.main:app --reload                    # API on :8000, docs at /docs
python -m data.prepare [tiktok youtube instagram linkedin]  # data/raw -> data/processed + labels (~20 s)
python -m ml.train [platforms] [--sample 60000]  # train per platform (~40 s for all rows)
python -m ml.evaluate                            # print saved test metrics
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

Done: scaffold, all API routes, Snowflake schema, CSV/YouTube ingestion, basic pages, Solana reward route,
data download + cleaning (`data/prepare.py`), per-platform XGBoost models trained and served by `/predict`.

Open:
- [ ] Phantom wallet connect (`@solana/wallet-adapter-react`) — replace text input on `/rewards`; wallet = login/user_id
- [ ] Dashboard charts (Recharts) by platform, format and week
- [ ] Thumbnail/clip upload on `/score` + CLIP thumbnail embeddings
- [ ] Write Solana tx signature back to `CONTRIBUTIONS.tx_signature`
- [ ] **Gemini content scoring**: send draft image/video + caption + SHAP factors → content score + suggestions; combine with model score
- [ ] Caption embeddings as model features (sentence-transformers or Cortex `EMBED_TEXT_768`)
- [ ] CLIP features from YouTube thumbnails
- [ ] Load processed data into Snowflake (sampled, ~200K rows/platform)
- [ ] Demo account with good sample data; rehearse 3-minute demo; backup video

**Demo flow:** connect YouTube + upload a TikTok CSV → dashboard compares → score a draft → apply a
suggestion, score rises → play ElevenLabs briefing → share data, receive Solana tokens.
