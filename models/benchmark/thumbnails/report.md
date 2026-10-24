# YouTube thumbnail ablation

Matched rows, creator-disjoint split, identical caption encoder and CatBoost parameters; early stopping on validation only.

Retrospective convenience-sample pilot. Current thumbnails can have been edited after publication. This does not establish prospective performance or a seven-day forecast.

Available-image cohort: 8,645/8,645 posts; 96 creators.
Seed: 42. Split: {'train': 6296, 'valid': 839, 'test': 1510}. Both arms exclude the same unavailable images.

## score

| Variant | Validation primary | Test Spearman | Test within-account Spearman | Features |
| --- | ---: | ---: | ---: | ---: |
| metadata | 0.3632 | 0.7391 | 0.1790 | 64 |
| thumbnail | 0.4205 | 0.7437 | 0.2229 | 576 |

Paired test rank delta 95% CI: (-0.015294089783395769, 0.026171368433377067).
Paired within-account delta 95% CI: (-0.00024740044679586853, 0.07932072553774563).
Candidate evidence criterion met: **False** (validation gain >=0.01 and paired primary test CI entirely above zero).

## relative

| Variant | Validation primary | Test Spearman | Test within-account Spearman | Features |
| --- | ---: | ---: | ---: | ---: |
| metadata | 0.3771 | 0.3254 | 0.2781 | 63 |
| thumbnail | 0.3632 | 0.3483 | 0.3140 | 575 |

Paired test rank delta 95% CI: (-0.00959768364743692, 0.06375392669797511).
Paired within-account delta 95% CI: (-0.01148627049263924, 0.0758220182062757).
Candidate evidence criterion met: **False** (validation gain >=0.01 and paired primary test CI entirely above zero).

## Deployment

Existing served model files were not replaced. Candidate bundles are in ignored `models/candidates/`.
Visual serving is opt-in with `YOUTUBE_THUMBNAILS_ENABLED=true`; keep it disabled unless the evidence and cohort suit the use case.
Requests must also explicitly set `use_thumbnail_model=true` (the website checkbox is off by default).
Request-time image failures or absent images fall back to the existing metadata model.
