# AGENTS.md — shared context for AI coding tools

Read this before making changes. It is the single source of truth for every teammate's AI assistant
(Claude Code, Cursor, Copilot, Codex, ...). When a decision changes, update this file in the same PR.

## Project

**PostPilot** — SBUHacks 2026 hackathon project (24h). One place for content creators and business pages to:

1. **Compare engagement across platforms** (YouTube, TikTok, Instagram, LinkedIn) in one dashboard.
2. **Score a draft before publishing**: predict engagement per platform from caption, timing, thumbnail.
3. **Get 2–3 specific suggestions** (from SHAP feature impacts) and see the score change when applied.

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

**Pipeline:** load posts → Snowflake `POSTS` → Cortex enrichment (`POST_FEATURES`, `TRAINING_DATA` view)
→ `ml/train.py` → `models/` → `/predict` (features via `shared/features.py`, XGBoost score, SHAP factors
→ suggestions) → web.

**Target variable:** engagement rate = (likes + comments + shares) / views (fallback: followers).
Not raw views — it compares fairly across platforms and account sizes.

## Commands (run from repo root unless noted)

```bash
source .venv/bin/activate
pip install -r ml/requirements.txt               # ml deps include api deps
uvicorn api.main:app --reload                    # API on :8000, docs at /docs
python -m ml.train --csv data/samples/demo_posts.csv   # train without Snowflake
python -m ml.train                               # train from Snowflake TRAINING_DATA
python -m ml.evaluate --csv data/samples/demo_posts.csv
python -m data.loaders.load_csv <file.csv> [--platform tiktok --map "theirs=ours,..."]
cd web && npm run dev                            # website on :3000
cd web && npx tsc --noEmit && npm run lint       # check web before committing
```

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

Done: scaffold, all API routes, Snowflake schema, CSV/YouTube ingestion, training + evaluation scripts,
basic pages, Solana reward route.

Open:
- [ ] Phantom wallet connect (`@solana/wallet-adapter-react`) — replace text input on `/rewards`; wallet = login/user_id
- [ ] Dashboard charts (Recharts) by platform, format and week
- [ ] Thumbnail/clip upload on `/score` + CLIP thumbnail embeddings
- [ ] Suggestions via Cortex `COMPLETE` instead of the fixed `FEATURE_HINTS` list
- [ ] Write Solana tx signature back to `CONTRIBUTIONS.tx_signature`
- [ ] Load Kaggle TikTok/Instagram datasets and train real models
- [ ] Demo account with good sample data; rehearse 3-minute demo; backup video

**Demo flow:** connect YouTube + upload a TikTok CSV → dashboard compares → score a draft → apply a
suggestion, score rises → play ElevenLabs briefing → share data, receive Solana tokens.
