# ViralPilot frontend + backend

The cinematic application in `frontend/` now calls the existing FastAPI scorer through an authenticated report adapter. `web/` remains the original interface. The thumbnail experiment is still a separate PR.

## Run

From the repository root, keep provider credentials and `SESSION_SECRET` in the ignored root `.env`. Never copy provider credentials into frontend variables.

```sh
source .venv/bin/activate
pip install -r ml/requirements.txt
uvicorn api.main:app --reload --port 8000
```

If Snowflake access is pending, explicitly start with local storage:

```sh
SNOWFLAKE_ACCOUNT= uvicorn api.main:app --reload --port 8000
```

This overrides the account only for that process, preserving `.env`. Users, reports and media are then stored in ignored `data/local.db` and `data/uploads/`. Local accounts/data do not automatically migrate to Snowflake when switching back. With Snowflake configured, the API creates `ANALYSES` alongside the existing app tables and stores media in the `ANALYSIS_MEDIA` internal stage (server-side encryption for browser playback). The original `MEDIA` stage is preserved for existing drafts.

In a second terminal:

```sh
cd frontend
npm ci
npm run dev
```

The default is live mode. `/demo`, sample-video processing, and the homepage walkthrough remain clearly labeled illustrative experiences. For a fully offline demo, set `NEXT_PUBLIC_DEMO_MODE=true` in `frontend/.env.local` and restart.

The frontend calls same-origin `/backend/*`; Next.js forwards it to server-only `API_URL` (default `http://127.0.0.1:8000`). This preserves the session cookie for uploads, reports, rewrites, and video playback. Requests allow 200 MB videos, with a 205 MB proxy buffer for multipart overhead and a ten-minute request timeout. Hosting providers may impose smaller limits.

This checkout currently uses frontend port 3010 and API port 8010, configured by ignored `frontend/.env.local`; the running API uses the shared Snowflake database through the verified personal key-pair login.

## User flow

1. Create an account at `/signup` or sign in at `/login`.
2. Optionally open `/accounts` to fetch a YouTube channel's public statistics or enter other platform statistics/audience details. These become model and Gemini context.
3. Open `/analyze`, select a video, add its caption/title, select target formats, and analyze.
4. Review actual combined/model/Gemini scores, general content feedback, and model-only warnings when applicable.
5. In the optimizer, choose a tone and **Generate copy**. This calls Gemini using the actual caption/review and saves the returned hook, title, caption, description, CTA and edit suggestions.
6. Return through `/reports`. Each report has an authenticated `/analysis/<id>` link; its video can be replayed after refresh. Export includes the generated copy.
7. `/settings` supports profile/password changes, sign-out and password-confirmed deletion. Deletion includes reports and stored videos.

## Adapter contract

Python contract: `api/analysis_schemas.py`. Browser validation: `frontend/src/lib/contracts.ts`.

All `/api/analyses` routes require the existing signed session cookie and constrain reads/updates to the current user. Responses are private and not cached.

| Endpoint | Behavior |
| --- | --- |
| `POST /api/analyses` | Multipart `video`, JSON `platforms`, JSON `metadata` (`name`, `durationSeconds`, `width`, `height`), and `caption`. Returns a synchronous complete job `{id,status,progress,stage,result}`. |
| `GET /api/analyses` | Current user's latest 50 report summaries. |
| `GET /api/analyses/{id}` | Complete saved report in the job envelope. |
| `GET /api/analyses/{id}/video` | Owner-only local video stream, or a short-lived Snowflake media URL. |
| `POST /api/analyses/{id}/rewrite` | JSON `{platform,tone}`; tone is `direct`, `playful`, or `educational`. Generates and saves publishing copy. |

The adapter calls `/score`'s existing implementation, so it shares the trained CatBoost models, linked-account context, Gemini review, blend weight, and model-only fallback. Missing trained models produce a 503 instead of a fabricated live score.

`shorts` maps to `youtube`. Both use the same trained YouTube model with the real supplied duration; its existing short indicator comes from duration. Shorts is reviewed separately by Gemini with `format=short`; the other selections use `format=video`. Selecting both does not imply two distinct trained YouTube models.

## Honest reporting boundaries

- Hook, visual quality and clarity come directly from Gemini's overall review and are labeled accordingly. They are shared within the same review, not independently measured per-platform metrics.
- `/score` does not provide pacing or format-fit sub-scores; these stay null and render as unavailable.
- Timed observations come from Gemini: for videos it returns up to 5 `moments` (MM:SS ranges that are `unclear`, hurt `pacing` or need to `improve`, each with problem + fix). `gemini.clean_moments` drops times outside the video. The report maps them to `observations` (timeline markers, "Moments that matter") and the **Overall suggestions** section, which lists the whole-video edits (`overallSuggestions`) plus playable "Clips to fix" (each plays only its range). Model-only reports have no observations.
- Original publishing copy is not invented by a mapper. The initial report keeps the supplied caption and actual edit suggestions. The optimizer generates the other fields on demand using Gemini.
- A failed Gemini review remains a genuine statistical-model report with a visible warning. Rewrite failures are errors and never substitute demo copy. Provider keys remain on the API server.
- Media container headers and upload sizes are checked; duration/dimensions are validated browser-supplied metadata, not a server-side codec probe.
- Creation is synchronous. Cancel stops the browser request, but accepted server work may finish and appear in saved reports. An upload or rewrite timeout does not prove the server stopped.
- JSON rewrites are last-writer-wins under simultaneous updates to the same report.

## Checks for this integration

- 40 Python tests passed (29 backend regression tests + 11 new adapter tests); provider/database calls are mocked in unit tests.
- 10 frontend tests, lint, TypeScript and production build passed; Python syntax compilation passed.
- Personal Snowflake key-pair login verified against POSTPILOT.APP with POSTPILOT_APP / POSTPILOT_WH.
- Live HTTP checks through the frontend proxy: sign-up/session cookie, linked-account write, uploaded video + trained model + Gemini scoring, saved report reload/list, original video header served from Snowflake, actual Gemini rewrite and persistence, and anonymous report/video access rejected.
- Temporary live-check users and their associated data are deleted after each run.
- Live validation found an unbounded malformed Gemini rewrite; generation is now capped at 2,048 output tokens with short-copy instructions, required schema fields and length bounds. The corrected provider request succeeded.

Snowflake presigned media needs server-side stage encryption: [official GET_PRESIGNED_URL documentation](https://docs.snowflake.com/en/sql-reference/functions/get_presigned_url). A separate SSE stage avoids changing the existing draft stage.

## Thumbnails

`POST /api/analyses` also accepts up to 3 `thumbnails` form files (JPEG/PNG/WebP, 10 MB each). Gemini compares them per format; the report's `thumbnails` = `{summary, items[{index, name, mimeType, width, height, scores, reasons, strengths, improvements}], picks[{platform, index, reason}]}` (`null` when none were uploaded or Gemini failed - then a warning explains it). Images: `GET /api/analyses/{id}/thumbnails/{index}` (owner-scoped; Snowflake serves a presigned URL).
