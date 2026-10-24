# PostPilot

See how your content performs on every platform, predict how a new post will do before you publish it, and get specific changes that raise engagement. Built at SBUHacks 2026.

**Stack:** Next.js (TypeScript) · FastAPI (Python) · XGBoost + SHAP · Snowflake + Cortex · ElevenLabs · Solana (devnet)

## ViralPilot frontend (latest cinematic interface)

The completed ViralPilot website is in **frontend/** on main. The existing web/, api/, data/, ml/, models/, shared/ and tests/ code is preserved. Both interfaces remain in this monorepo.

Requires Node.js22+ and npm:

```sh
cd frontend
npm ci
npm run dev
# checks: npm run check
# production: npm run build && npm start
```

Open http://localhost:3000. The frontend now connects to FastAPI through the same-origin `/backend` proxy: sign in, link accounts, upload a draft, review scores, generate publishing copy, and reopen saved reports. Start the API on port 8000; see [Frontend/backend setup](docs/frontend-backend.md) for live/local storage and configuration. `/demo` remains a labeled sample. Provider secrets belong only in the root `.env`.

[FRONTEND_HANDOFF.txt](FRONTEND_HANDOFF.txt) is the canonical ten-section team guide. [Frontend README](frontend/README.md), [asset sources/licenses](frontend/ASSET_NOTICES.md) and [browser QA](frontend/QA_REPORT.md) cover the implementation. Set frontend/ as the project root when running or deploying this interface. The original integrated web/ app remains available through its existing commands below.

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

See [Backend/data setup and API contract](docs/backend-data.md) for Snowflake/PAT credentials, YouTube keys,
repeatable migrations, CSV import formats, dashboard queries and Cortex access.

```bash
python -m data.setup                 # create tables and apply additive migrations
python -m data.setup --check         # verify connection and all seven tables
python -m data.seed_demo             # 10 sample posts for user "demo", with recent dates
python -m unittest tests.test_backend_data -v
```

`POST /ingest/youtube` and `POST /ingest/csv` update existing posts rather than appending duplicates.
The dashboard API provides platform/format/week aggregates, recent posts and accounts. Snowflake Cortex
adds sentiment, semantic search and an on-demand briefing. Scores with a user ID are saved to prediction history;
the scoring page currently uses `demo`. Live services require credentials in `.env` and schema setup.
Training continues to read local `data/processed/` (see AGENTS.md "Training data and labels").

## Solana rewards (devnet)

Create a payout wallet and a reward token once with the Solana CLI and `spl-token`, fund the wallet with devnet SOL, then put its secret key and the mint address in `.env`. Never use mainnet keys here.

## Rules

- Never commit `.env` or any key. Add new key names to `.env.example`.
- One branch per feature, small PRs, `main` always runs.
- Change features only in `shared/features.py`, then retrain.
- Keep `web/lib/api.ts` types in sync with `api/schemas.py`.
