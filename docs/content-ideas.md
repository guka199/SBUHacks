# Follow-up content ideas

The signed-in creator can open `/ideas`, inspect the history used, select a target platform and generate 3–5 next-post ideas. Each has a title, hook, outline, approach, rationale and server-attached references to their own posts/reviews. Ideas are retained, can be saved for later or dismissed, and survive refresh.

## Creator direction and channel memory

The direction editor saves optional preferences for the signed-in creator across platforms:

- Main goal: grow an audience, start conversations, support sales, or build a continuing series; null means no specific goal.
- Goal details, style notes and intended-audience notes: up to 500 characters each.
- Time available to film **one idea**, in whole minutes from 5 to 480, or unspecified. This is a production constraint, not video duration or a measured time estimate.
- Up to ten topics to avoid, each at most 100 characters.

The page follows three steps: choose a goal, select a platform and generate, then review ideas. Goal cards and quick filming-time choices keep setup short; optional notes and channel memory/sources expand on demand. **Save & generate ideas** saves valid unsaved preferences before calling generation in the same action. A separate **Save preferences** button remains available. Unsaved edits survive platform/filter/context refreshes within the page; invalid edits block generation and unsaved edits block manual memory refresh until saved/discarded. The backend uses stored preferences, never a client-supplied owner. If saving succeeds but generation fails, preferences remain saved. PUT replaces the whole preference object; empty strings, empty lists and null clear values. Existing ideas keep the preferences used when they were created. Changing preferences does not invalidate the content memory.

New generation scrolls to and focuses the results heading, respecting reduced-motion preferences. Dismissed ideas can be restored with **Undo** in the visible notification. History readiness and empty states offer specific next actions; errors have a data-reload action. These controls use existing endpoints and do not change source selection or generation rules.

Channel memory is a reusable Gemini summary of the same bounded history: themes, tentative style observations, and topics already covered. Every observation must cite 1–4 IDs from the current creator's supplied sources. The server checks references and attaches its own dated source snapshots. Style may be empty when evidence is insufficient. Captions do not establish visual style, and draft reviews do not establish published success. Memory is an AI inference, not a trained model or verified audience demand. User-supplied style/audience notes take priority over these inferences.

**Build/Refresh memory** makes a Gemini call using global channel context. **Generate ideas** automatically builds missing or stale memory before its idea-generation call. A current memory is reused. Ordinary context/list/preferences reads do not call Gemini. The first generation or a changed history therefore needs an extra provider call and can take longer. Provider failures remain explicit; no fixture or stale-memory substitution is used for generation.

Freshness uses a versioned semantic fingerprint of source IDs/captions, canonical bounded review text across platforms, niche/account type and cleaned audience fields. It excludes view counters, collection timestamps, derived ages and creator preferences. Source selection still retains some stronger observations, so changes in selected sources can indirectly invalidate memory when statistics change. Switching target platforms alone does not invalidate it. Freshness is checked again after memory generation; a history change during the call is displayed as stale, and idea generation requires a current memory before continuing. Malformed memory is treated as a rebuildable cache; database failures and damaged creator preferences are not silently ignored.

`api/services/creator_memory.py` implements extraction, fingerprinting and persistence. `IDEA_PREFERENCES` and `CHANNEL_MEMORIES` are created at API startup in Snowflake or SQLite, and full account deletion removes both. SQLite uses an atomic conflict update; Snowflake uses MERGE. Final writes and account deletion share an in-process lock with an owner-existence check. This is coordination for the current single-process API, not a distributed multi-worker deletion guarantee. Saved memory retains dated evidence after unlink/refresh and is marked stale when the selected history changes.

Goal-specific instructions shape the proposal: accessible introductions for growth, genuine participation for engagement, real supplied offers for sales, and connected installments for series. Unknown products/offers are never supplied by the application. Budget and topic/style constraints are prompt instructions; natural-language adherence and filming feasibility still require creator judgment.

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

### Fresh signals and a balanced idea mix

Generation accepts `use_trends` (default true), `region_code` (two uppercase country-code letters, default US), and optional `trend_topic` (2–100 characters). The Ideas page exposes an opt-out, market and topic. An omitted topic uses the creator's niche or first memory theme; research sends only that short topic, platform, market and date window, not saved captions, reviews, identity, goals or audience notes. An omitted platform uses the first supported linked account, then a known history platform. The result discloses the platform actually researched.

`api/services/idea_trends.py` collects up to six dated external signals with a 14-day lookback:

- **YouTube:** `search.list` for the topic, ordered by view count, followed by `videos.list` for actual title, publication date and current lifetime views. Live/upcoming and out-of-window videos are excluded. These are recent public examples, **not measured rising trends**. `regionCode` means available in that country; it does not establish local popularity. Existing `YOUTUBE_API_KEY` is reused.
- **Shorts, TikTok, Instagram Reels and LinkedIn:** Gemini Interactions with the native Google Search grounding tool, using the same Gemini credential. YouTube also tries this if its API has no usable results. Only a real search-tool invocation with actual URL-citation annotations qualifies. The cited span must itself contain a dated record for the exact requested platform and country code within the lookback. Unicode offsets use the SDK's documented UTF-8 byte indexes. URLs come from annotations, never model-supplied free-text links. Publication dates and market relevance are **reported by grounded research**, not independently verified metadata or native platform analytics. Undated, future, out-of-window, uncited and mismatched records are excluded. A short video is not automatically considered a native Short.

The current app has no approved TikTok/Instagram/LinkedIn trend-feed integration. Public web coverage can be incomplete, and a valid citation does not prove platform-wide popularity or independently establish every natural-language claim. The UI labels reported dates, check times, API-verified dates and coverage notes. It displays Google-provided search suggestions in a sandboxed iframe without scripts or same-origin privileges; retrieved text is never inserted into the app's own HTML. External links are HTTPS only; the server never fetches arbitrary citation URLs. `GEMINI_TRENDS_MODEL` optionally overrides the research model; no additional provider key is required. Official references: [Google Search grounding](https://ai.google.dev/gemini-api/docs/google-search), [YouTube search](https://developers.google.com/youtube/v3/docs/search/list).

Research has a bounded, owner-scoped in-process LRU cache (128 keys, six hours for usable results, ten minutes for unavailable results). Expiry is also bounded by each source's publication window: exact timestamps for API videos, the last 14 calendar dates for date-only web reports. Checks/expiry/cache reuse are disclosed. Full account deletion clears that owner's cache, and a delayed research completion checks owner existence under the creator lifecycle lock before caching. Cache entries disappear on API restart; evidence used for saved ideas is retained in their database payloads. GET context/list never triggers research.

Each new idea has `idea_kind`: `follow_up`, `trend_inspired`, or `evergreen`. Every batch must include a follow-up and an evergreen idea; generation is instructed to include a trend-inspired idea when the fresh evidence fits the creator. An irrelevant or avoided topic must not be forced. A trend-inspired idea requires 1–3 exact external source IDs **and** 1–4 personal-history source IDs, with the idea platform matching its external evidence. Other kinds cannot claim external trend citations. If signals are unavailable/disabled, only follow-ups and evergreen ideas are allowed and coverage is disclosed. If sources exist but none are used, a warning states that explicitly. No fixture trend data or fabricated rankings/growth are substituted.

New ideas retain `idea_kind`, their server-attached `trend_sources`, dated `trend_research` metadata/search suggestions and nullable `feedback`. The batch context contains all fetched sources; per-idea research metadata omits that full source list to avoid redundant evidence, while the idea retains its specific citations. Older ideas default to null kind/research/feedback and an empty external-source list. Old snapshots are dated evidence, not an assertion that their topic is still current.

**Useful idea?** stores `useful`, `not_useful` or null via the private feedback route. **Compare idea usefulness** summarizes ratings by kind for only the ideas currently displayed, including that limitation. It measures subjective usefulness, not engagement, causal impact or prediction accuracy. Feedback does not yet retrain or change generation automatically.

`api/services/ideas.py` uses the existing Gemini credential/model through the Interactions API. Output is bounded to 4,096 tokens and validated as structured JSON. No new model is trained and no scoring feature/model artifacts change.

The server checks the requested count and platform, distinct normalized titles and outlines, exact references to supplied source IDs, and duplicate titles against the latest 50 prior ideas (including dismissed ideas). Existing source captions cannot be repeated verbatim as titles. Semantic similarity is not a guarantee; the prompt asks for new angles rather than rewording.

The provider schema constrains the array to the exact requested count, requires complete idea fields and constrains a selected platform. Invalid structured output or application validation triggers at most one regeneration with a fixed validation reason; raw rejected output is not reused. Provider authentication/quota/network errors are not retried here. Nothing is saved until the entire batch passes validation. Exhausted validation returns a specific incomplete/repeated-batch message; logs omit raw provider responses and private content.

Gemini supplies source IDs only. Source excerpts, dates, outcome values and links are attached from the owner's stored context, never accepted from the generated output. YouTube links require a valid video-ID shape; report links require a saved UUID. This verifies provenance to the app's stored history, not ownership of a public YouTube channel or the truth of manually imported statistics.

The prompt treats stored text as source data, excludes performance promises and invented audience questions/trends, and asks for rationales about content connections. AI-generated prose can still be wrong; displayed statistics remain separate server-supplied evidence. Do not represent idea quality as an evaluated prediction model.

If Gemini is unavailable, output is malformed, citations are invalid or history is insufficient, the endpoint returns an error and never substitutes fixture ideas.

## Storage and endpoints

`db.init()` creates `CONTENT_IDEAS` in the configured Snowflake namespace or the existing local SQLite fallback. Each row has an opaque ID, owner ID, batch ID, platform, JSON payload, status and timestamp. Payloads retain the supporting context/evidence snapshot so a saved idea still explains its origin after channel data is refreshed. Source freshness dates remain visible. Full account deletion includes ideas; unlinking one social account preserves previously generated ideas and their evidence snapshots.

All routes require the signed session cookie. The client cannot choose an owner. Reads and status updates include `user_id` in the database predicate. Responses are private/no-store.

| Endpoint | Request / response |
| --- | --- |
| `GET /ideas/context?platform=youtube` | Sanitized context, source list, history counts and limitations. Platform is optional. |
| `GET /ideas/preferences` | `{ "preferences": { ... }, "updated_at": null-or-timestamp }`; empty defaults before the first save. |
| `PUT /ideas/preferences` | Full replacement: `{ "goal": "series", "goal_details": "Weekly piano practice", "filming_minutes": 30, "style_notes": "Calm demonstrations", "audience_notes": "Beginner pianists", "topics_to_avoid": [] }`. Returns saved preferences and timestamp. |
| `POST /ideas/memory/refresh` | `{}`; returns global `ChannelContext` with the saved memory and its freshness. Requires the same history/Gemini readiness as generation. Extra owner/request fields are rejected. |
| `POST /ideas/generate` | `{ "platform": "youtube", "count": 3 }`; platform may be null, count is 3–5. Returns updated context and stored ideas. |
| `POST /ideas/generate` (research options) | Also accepts `{ "use_trends": true, "region_code": "US", "trend_topic": "Minecraft challenges" }`; combine with platform/count. Returns `context.trend_research` with sources, coverage, checks/expiry and cache status. |
| `GET /ideas?platform=youtube&status=saved` | Latest 50 matching ideas. Without status, dismissed ideas are excluded. |
| `PATCH /ideas/{id}` | `{ "status": "saved" }`; accepted statuses: suggested, saved, dismissed. |
| `PATCH /ideas/{id}/feedback` | `{ "feedback": "useful" }`, `"not_useful"` or null. Owner scoped; updates only the stored payload feedback. |

Platform IDs are `youtube`, `shorts`, `tiktok`, `instagram`, `linkedin`. This feature creates proposed content, not publishing actions or external account connections. Nika's account-linking work can independently improve the history available. Draft and published data use existing services; video scoring, timestamps/snippets, model training and thumbnail comparison are separate team tasks.

Context additionally includes `creator_preferences`, `preferences_updated_at` and nullable `memory`. Memory contains `summary`, `themes`, `style`, `covered_topics`, server-attached `sources`, `generated_at` and `is_stale`. Each observation is `{ "label": "...", "source_ids": ["..."] }`. New stored ideas additionally snapshot `creator_preferences` and `memory_generated_at`; older payloads default to empty preferences/null.

Python schemas: `api/idea_schemas.py`. Browser schemas/client: `frontend/src/lib/ideas.ts`. UI: `frontend/src/app/ideas/`. Existing same-origin `/backend` forwarding carries the session cookie.

## Checks

Run mock-only Python checks with `SNOWFLAKE_ACCOUNT= GEMINI_API_KEY= .venv/bin/python -m unittest tests.test_content_ideas tests.test_frontend_adapter tests.test_backend_data -q`. Frontend: `npm run check` and `npm run build` in `frontend/`.

Tests cover owner scoping, excluded private fields, separation of draft reviews from outcomes, age/format/platform cohorts, sparse/invalid data, duplicate history, citation validation, platform/count validation, persistence ownership and link restrictions. Live provider/storage verification uses an explicitly labeled temporary history fixture and deletes its test accounts/data; it evaluates integration, not the effectiveness of the creative ideas.

Completed: 57 Python tests and 14 frontend tests passed, together with lint, TypeScript, production build and Python compilation. A live HTTP check through the frontend proxy used real Gemini and Snowflake to verify empty-history guards, profile/posts/draft context, three distinct source-grounded ideas, save/reload/dismiss and cross-user isolation. Both temporary accounts and their ideas were removed.

Those test/live results describe the initial ideas feature. The subsequent direction/memory extension passed code review, Python syntax compilation, TypeScript, ESLint and the frontend production build. The reloading API completed startup with the new tables. Existing mocks were adjusted for the new storage reads/owner check; no new tests were added or test suites/live provider calls run for this extension.

Fresh-signal/mix/feedback extension: existing generated-idea fixtures were updated for the explicit idea-kind contract. Python syntax compilation, TypeScript, targeted ESLint and the frontend production build passed. No tests were added/run and no live research-provider calls were run as part of this extension. These checks do not verify live research availability or idea quality.

Generation is synchronous. Leaving the page cancels the browser request but accepted server work may finish and appear in history. The last 50 titles are only a recent deduplication window; semantic duplicates and simultaneous generation are not fully prevented.

Generation repair (2026-10-24): reproduced a five-idea request failing because Gemini returned the wrong count. After the schema/retry fix, the same signed-in YouTube request with research enabled returned HTTP 200 and displayed five newly stored ideas, increasing the visible history from eight to thirteen. This confirms that flow, not all platform/count combinations or creative effectiveness. No automated tests were added/run for this repair.
