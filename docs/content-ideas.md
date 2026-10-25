# Follow-up content ideas

The signed-in creator can open `/ideas`, inspect the history used, select a target platform and generate 3–5 next-post ideas. Each has a title, hook, outline, approach, rationale and server-attached references to their own posts/reviews. Ideas are retained, can be saved for later or dismissed, and survive refresh.

## Context builder

`api/services/channel_context.py` reads only the current user's records:

- `USERS`: display name, creator/business type and niche. Email, password hashes and wallet details are excluded.
- `ACCOUNTS`: follower count, typical views, selected audience fields and refresh date. Arbitrary account extras are excluded.
- `POSTS`: latest 50 stored posts; at most 30 become sources, retaining recent content plus a few stronger eligible observations.
- `ANALYSES` and `DRAFTS`: at most 10 combined reviews, deduplicated by normalized caption. Summaries and edit notes are reused; raw media is never resent.

At most 40 sources are supplied, with bounded titles, captions, summaries and notes. At least two distinct normalized captions are required for generation. Fewer than five are labeled limited history. This is a data-availability label, not statistical confidence.

Published outcomes and unpublished reviews have distinct source kinds. Draft model scores are deliberately not included as performance evidence. Model-only reviews say content was not reviewed. Incomplete saved-report JSON is skipped with a disclosure.

Comparative view ratios are descriptive: same user, platform, known stored format and broad age cohort at the statistics snapshot, at least three observations and a positive median. Age at capture is used rather than today's age, so stale statistics do not appear to describe a mature video. Snapshots taken before seven days, small cohorts, missing capture/publication dates, unknown formats and zero medians do not receive a ratio. Lifetime snapshots do not establish equal-age performance, causation, a growth forecast or guaranteed audience demand.

The context preview shows which content is available and the latest stored dates. **Refresh context** rereads app storage; it does not refresh the YouTube API. Use the Accounts refresh controls for that separately.

## Generation and evidence

`api/services/ideas.py` uses the existing Gemini credential/model through the Interactions API. Output is bounded to 4,096 tokens and validated as structured JSON. No new model is trained and no scoring feature/model artifacts change.

The server checks the requested count and platform, distinct normalized titles and outlines, exact references to supplied source IDs, and duplicate titles against the latest 50 prior ideas (including dismissed ideas). Existing source captions cannot be repeated verbatim as titles. Semantic similarity is not a guarantee; the prompt asks for new angles rather than rewording.

Gemini supplies source IDs only. Source excerpts, dates, outcome values and links are attached from the owner's stored context, never accepted from the generated output. YouTube links require a valid video-ID shape; report links require a saved UUID. This verifies provenance to the app's stored history, not ownership of a public YouTube channel or the truth of manually imported statistics.

The prompt treats stored text as source data, excludes performance promises and invented audience questions/trends, and asks for rationales about content connections. AI-generated prose can still be wrong; displayed statistics remain separate server-supplied evidence. Do not represent idea quality as an evaluated prediction model.

If Gemini is unavailable, output is malformed, citations are invalid or history is insufficient, the endpoint returns an error and never substitutes fixture ideas.

## Storage and endpoints

`db.init()` creates `CONTENT_IDEAS` in the configured Snowflake namespace or the existing local SQLite fallback. Each row has an opaque ID, owner ID, batch ID, platform, JSON payload, status and timestamp. Payloads retain the supporting context/evidence snapshot so a saved idea still explains its origin after channel data is refreshed. Source freshness dates remain visible. Full account deletion includes ideas; unlinking one social account preserves previously generated ideas and their evidence snapshots.

All routes require the signed session cookie. The client cannot choose an owner. Reads and status updates include `user_id` in the database predicate. Responses are private/no-store.

| Endpoint | Request / response |
| --- | --- |
| `GET /ideas/context?platform=youtube` | Sanitized context, source list, history counts and limitations. Platform is optional. |
| `POST /ideas/generate` | `{ "platform": "youtube", "count": 3 }`; platform may be null, count is 3–5. Returns updated context and stored ideas. |
| `GET /ideas?platform=youtube&status=saved` | Latest 50 matching ideas. Without status, dismissed ideas are excluded. |
| `PATCH /ideas/{id}` | `{ "status": "saved" }`; accepted statuses: suggested, saved, dismissed. |

Platform IDs are `youtube`, `shorts`, `tiktok`, `instagram`, `linkedin`. This feature creates proposed content, not publishing actions or external account connections. Nika's account-linking work can independently improve the history available. Draft and published data use existing services; video scoring, timestamps/snippets, model training and thumbnail comparison are separate team tasks.

Python schemas: `api/idea_schemas.py`. Browser schemas/client: `frontend/src/lib/ideas.ts`. UI: `frontend/src/app/ideas/`. Existing same-origin `/backend` forwarding carries the session cookie.

## Checks

Run mock-only Python checks with `SNOWFLAKE_ACCOUNT= GEMINI_API_KEY= .venv/bin/python -m unittest tests.test_content_ideas tests.test_frontend_adapter tests.test_backend_data -q`. Frontend: `npm run check` and `npm run build` in `frontend/`.

Tests cover owner scoping, excluded private fields, separation of draft reviews from outcomes, age/format/platform cohorts, sparse/invalid data, duplicate history, citation validation, platform/count validation, persistence ownership and link restrictions. Live provider/storage verification uses an explicitly labeled temporary history fixture and deletes its test accounts/data; it evaluates integration, not the effectiveness of the creative ideas.

Completed: 57 Python tests and 14 frontend tests passed, together with lint, TypeScript, production build and Python compilation. A live HTTP check through the frontend proxy used real Gemini and Snowflake to verify empty-history guards, profile/posts/draft context, three distinct source-grounded ideas, save/reload/dismiss and cross-user isolation. Both temporary accounts and their ideas were removed.

Generation is synchronous. Leaving the page cancels the browser request but accepted server work may finish and appear in history. The last 50 titles are only a recent deduplication window; semantic duplicates and simultaneous generation are not fully prevented.
