# PostPilot

See how your content performs on every platform, predict how a new post will do before you publish it, and get specific changes that raise engagement. Built at SBUHacks 2026.

**Stack:** Next.js (TypeScript) · FastAPI (Python) · XGBoost + SHAP · Snowflake + Cortex · ElevenLabs · Solana (devnet)

## Repo layout

| Folder | What lives there | Owner |
| --- | --- | --- |
| `web/` | Next.js website: landing, dashboard, score, rewards; `app/api/reward` sends Solana tokens | Frontend |
| `api/` | FastAPI backend: ingest, dashboard, predict, voice, contribute | Data / backend |
| `ml/` | Training only: `train.py`, `evaluate.py`, notebooks | ML |
| `shared/` | `features.py`, used by **both** `ml/` and `api/` | ML |
| `data/` | `sql/` table scripts, `loaders/` to fill Snowflake, `samples/` demo data | Data |
| `models/` | Trained model files (`engagement_<platform>.json`) | ML |

## Setup

Requires Python 3.11+ and Node 20+. Run everything from the repo root.

```bash
cp .env.example .env            # fill in your keys
cp .env web/.env.local          # Next.js reads env from web/
```

**Backend + ML**

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r ml/requirements.txt     # includes api requirements
python -m data.prepare                 # needs downloads in data/raw/ (see AGENTS.md)
python -m ml.benchmark --smoke         # quick check that every model runs (~2 min)
python -m ml.train                     # trains the chosen model type per platform into models/
uvicorn api.main:app --reload          # http://localhost:8000/docs
```

`/predict` works without a trained model: it returns fixed fake scores so the frontend can be built in parallel.

**Website**

```bash
cd web && npm install && npm run dev   # http://localhost:3000
```

## Snowflake

1. Run `data/sql/001_create_tables.sql` in a Snowflake worksheet.
2. Load data: `python -m data.loaders.load_csv data/samples/demo_posts.csv` (Kaggle datasets go in `data/raw/`, which is git-ignored).
3. Run `data/sql/002_enrich_with_cortex.sql` to add sentiment, embeddings and the `TRAINING_DATA` view.
4. Training reads local `data/processed/` (see AGENTS.md "Training data and labels").

## Solana rewards (devnet)

Create a payout wallet and a reward token once with the Solana CLI and `spl-token`, fund the wallet with devnet SOL, then put its secret key and the mint address in `.env`. Never use mainnet keys here.

## Rules

- Never commit `.env` or any key. Add new key names to `.env.example`.
- One branch per feature, small PRs, `main` always runs.
- Change features only in `shared/features.py`, then retrain.
- Keep `web/lib/api.ts` types in sync with `api/schemas.py`.
