# YouTube thumbnail prediction experiment

This adds learned visual inputs to CatBoost, separately from Gemini's existing content review.
Frozen OpenCLIP `ViT-B-32 / laion2b_s34b_b79k` produces 512 normalized image features.
The same preprocessing and feature order are used during training and API inference.

## Measured result

On 2026-10-24, the public-channel convenience sample produced 14,277 raw videos. Existing preparation
rules retained 8,645 posts from 96 creators, aged 30–730 days; all thumbnails were available.
The creator-disjoint split was 6,296 train / 839 validation / 1,510 test posts.

| Target | Metadata: test Spearman | With images: test Spearman | Metadata: within-account Spearman | With images: within-account Spearman |
| --- | ---: | ---: | ---: | ---: |
| Reach percentile | 0.7391 | 0.7437 | 0.1790 | 0.2229 |
| Versus account average | 0.3254 | 0.3483 | 0.2781 | 0.3140 |

These are correlations, not accuracy percentages. Paired creator-bootstrap intervals for the gains
include zero. The relative model also declined on validation (within-account Spearman 0.3771→0.3632).
Neither met the predefined evidence rule: validation primary gain ≥0.01 and paired primary test
interval entirely above zero. **A significant improvement has not been demonstrated.**

Existing production bundles were preserved. Detailed paired intervals, metrics and input fingerprints
are in `models/benchmark/thumbnails/report.md` and `results.json`. The pilot used different data from the
original 70K-post training set, so its metrics must not be compared directly with the original model's.
The matched pilot arms share the same posts, caption encoder, CatBoost settings and creator split.

Limitations: manually selected, mostly prominent English-language channels; current lifetime outcomes;
only 20 eligible test creators for within-account metrics; and thumbnails that may have been edited
after publication. This is retrospective evidence, not a prospective or seven-day forecast.

## Reproduce

From the repo root with Python 3.11–3.12:

```bash
pip install -r api/requirements-visual.txt
python -m data.loaders.youtube_thumbnail_pilot --channels 110 --videos-per-channel 150 --prepare
python -m data.thumbnail_embeddings --data data/processed/youtube_thumbnail_pilot.parquet
python -m ml.benchmark --thumbnail-ablation \
  --thumbnail-data data/processed/youtube_thumbnail_pilot.parquet \
  --thumbnail-cache data/processed/youtube_thumbnail_embeddings.parquet
```

The loader uses root `.env` `YOUTUBE_API_KEY`; the initial collection used approximately 694 API calls.
It records handles, resolved channel IDs, seed and collection time in an ignored raw-data manifest.
Finished channels, images and embedding checkpoints are reused. A fresh collection has updated
outcomes; exact reproduction requires the recorded data/cache fingerprints. You can supply the
original real YouTube parquet to the caching and benchmark commands instead of collecting a pilot.

Unavailable images are excluded from both comparison arms. The caption encoder fits only training
captions; validation is for early stopping. Test labels and creator IDs are never input features.
The relative model still excludes `log_creator_typical_views` to prevent the known leakage.
Exported candidate bundles are checked against their batch predictions through the actual API
feature-building path. Use `ml.benchmark --thumbnail-ablation` for this comparison.

CLIP runs in a separate interpreter to avoid the macOS PyTorch/tree-library OpenMP conflict.
Encoder contract v1 pins `open_clip_torch==3.3.0`. Weights are cached once under ignored
`data/processed/thumbnail_cache/weights/`. Raw data, images and embeddings live under ignored
`data/raw/` and `data/processed/`; candidate bundles live under ignored `models/candidates/`.
These are training/runtime artifacts; they are not committed or inserted as application records.

## Try locally

After running the commands above, explicitly make the experiment available on the server:

```bash
YOUTUBE_THUMBNAILS_ENABLED=true \
YOUTUBE_THUMBNAIL_TARGETS=score,relative \
uvicorn api.main:app --host 127.0.0.1 --port 8010
```

On **Score a post**, choose YouTube, upload the thumbnail you plan to publish, and check
**Try experimental YouTube thumbnail prediction**. The checkbox is off by default. Results that use
the reach candidate are labeled experimental. A separate video can be attached; Gemini sees both
the video and the selected thumbnail for its content review.

API: multipart `/score` accepts `thumbnail` (a still image ≤5 MB) and `use_thumbnail_model=true`.
`/predict` accepts `use_thumbnail_model=true` and an existing public YouTube `thumbnail_url`.
Remote image requests allow only bounded `https://i.ytimg.com/vi/<id>/<known-size>.jpg`/`.webp`
URLs, with no redirects. Upload custom images through `/score`; arbitrary URLs and embedding vectors
are not accepted. API encoding uses cached weights offline. Video frames are not used as a substitute
for missing thumbnails, because the training inputs are selected thumbnails.

`scores[].thumbnail_used` refers to the reach model; `scores[].vs_account.thumbnail_used` refers to
the separate relative model. `thumbnail_warning` reports unavailable candidates/encoder failures.
Absent images or failed extraction use the existing model. The pilot's relative reliability label is
capped at moderate. Server opt-in makes candidates available; it does not certify an improvement.

Default configuration keeps visual prediction disabled. Before promoting a candidate, collect a
broader prospective sample with thumbnails frozen before publication and evaluate a fresh holdout.

## Checks

The implementation passed 46 backend/thumbnail unit checks, frontend TypeScript/lint, real isolated
CLIP+candidate upload checks (two different images produced different predictions), missing-image
fallback, and a live HTTP Gemini+thumbnail score with no analysis warning. The API process did not
import PyTorch. The local demo server exposes only the reach candidate; the relative candidate remains
available on disk for experiments but declined on validation. See `models/benchmark/thumbnails/api_check.json`.

```bash
python -m unittest tests.test_thumbnails tests.test_backend_data -v
cd web && npx tsc --noEmit && npm run lint
```
