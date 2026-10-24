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
| YouTube | 0.108 [0.080, 0.138] | 0.547 | 1.24 — weak |
| TikTok | 0.038 [0.032, 0.042] | 0.525 | 1.09 — ~no signal |

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

Done: scaffold, all API routes, Snowflake schema, CSV/YouTube ingestion, basic pages, Solana reward route,
data download + cleaning (`data/prepare.py`), 13-model benchmark framework (`ml/`), per-platform models trained and served by `/predict`.

Open:
- [ ] Phantom wallet connect (`@solana/wallet-adapter-react`) — replace text input on `/rewards`; wallet = login/user_id
- [ ] Dashboard charts (Recharts) by platform, format and week
- [ ] Thumbnail/clip upload on `/score` + CLIP thumbnail embeddings
- [ ] Write Solana tx signature back to `CONTRIBUTIONS.tx_signature`
- [ ] Gemini: test `/score` live with a real VIDEO (caption-only and image tested live: ~3-6 s)
- [ ] Caption embeddings as model features (sentence-transformers or Cortex `EMBED_TEXT_768`)
- [ ] CLIP features from YouTube thumbnails
- [ ] Load processed data into Snowflake (sampled, ~200K rows/platform)
- [ ] Demo account with good sample data; rehearse 3-minute demo; backup video

**Demo flow:** connect YouTube + upload a TikTok CSV → dashboard compares → score a draft → apply a
suggestion, score rises → play ElevenLabs briefing → share data, receive Solana tokens.
