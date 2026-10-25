# Channel overview / dashboard

The existing `/dashboard` compares collected published content and connected accounts. Studio, homepage, account integrations and authentication remain unchanged.

## Direction

Editorial greeting, Taste seed 1691280738. Retain the established navigation and red/yellow palette rather than the draw's optional sidebar or alternate palette. Archivo Black titles, DM Sans labels, aligned tabular data, one cream chart surface, open divided account rows. No decorative glass, new sidebar, entrance choreography or new dependency.

Chart extensions: YouTube #BE1A1A solid; Instagram #7A3E9D dashed; TikTok #087C73 dotted; LinkedIn #2864B4 dash-dot. Names, icons and line patterns supplement color. Scope these tokens to dashboard components.

Dashboard-only tonal extensions use #65592E secondary text, #DACA8E decorative dividers and #8B7947 control outlines. Cream comes from the existing `--surface`; warm hover/track tones stay in that yellow family. Controls use 9px radii, chart panels 12px, small media 4–6px. DM Sans data/body ranges from 12–18px; auxiliary labels use 10–11px. Display titles scale 24–38px. These scoped extensions do not change the homepage design system.

Measured contrast: #65592E on #F8EBAB 5.78:1 and on #FFF9E3 6.59:1; red actions on light yellow 5.21:1; platform series on cream range from 4.81:1 to 6.63:1. Control outlines exceed 3:1. Filter redraw uses a 180ms CSS opacity/blur transition; reduced motion removes it. Existing GSAP homepage timelines remain untouched. CSS is sufficient for these small state changes.

## Data contract and meaning

- `/accounts` supplies current audience and identities; one account per platform is currently supported. Audience totals can overlap people and are independent of the publication-date filter.
- `/ideas/context` supplies only `published_post` sources, capped and balanced by the existing backend. Imported account snapshots supplement this with up to 100 posts. `/api/dashboard` provides a five-row fallback and separate draft scores. This is a collected sample, never an exhaustive channel total.
- Publication charts show median captured lifetime views or likes + comments of posts published in each period. They are not views earned in those periods. Empty periods are gaps, not zero. Shares remain separately visible where known.
- Actual follower captures come from `/accounts/{platform}/history?limit=20`. At least two distinct dated captures are required for growth. Without them, show current audience bars. The legacy YouTube connection does not store capture history.
- Default ranking: response lift = a post's likes + comments divided by the median for its own account, platform, format and age-at-capture band. Require three peers and positive baseline; explain exclusions. It measures relative response within a sample, not equivalent audiences or success probability.
- Views and view-based engagement exclude LinkedIn. Never substitute impressions, missing counters, or followers for video views. Unknown is a dash; recorded zero remains zero. Future publications are excluded. Dates display in UTC.
- Header refresh reads stored data only. Explicit account Update uses existing provider actions; never launch collections on load or filter change. Retain last-good results when reload fails.
- More account stats preserves available native published-post/channel-view totals, typical views and posting cadence. These are stored account statistics, separate from the publication-filtered post sample. Follower deltas show both actual capture dates.

## Interaction and verification

Shared platform/date filters, metric selectors, pointer and keyboard chart inspection, accessible chart table, ranking selector, plain-language method disclosure, responsive content rows. Native focus and 44px controls; reduced motion removes transitions. No second document scrollbar. Verify real connected data and synthetic unit fixtures separately. No live provider or Gemini call is required for dashboard verification.

Browser review used real saved YouTube data and an explicitly labeled temporary fixture preview for four platforms, snapshot history, missing metrics and no accounts. The preview was removed. Desktop 1440px, tablet 768px and phone 390px were inspected. Refinements moved Top 10 ahead of secondary insights, reduced disconnected rows, increased phone table text and contained chart tooltips. The synthetic preview exposed an SVG title hydration mismatch; using a single title string fixed it.

Static audit interpretation: shared selector transitions trigger the audit's per-rule hover heuristic; dynamic tooltip positioning/series colors are intentional inline values. Middle dots label the ordered likes/comments/shares counters. The only perpetual animation is a conditional loading spinner, removed under reduced motion. Impeccable's advisory palette/type/radius findings are covered by these scoped extensions; no critical findings were reported.
