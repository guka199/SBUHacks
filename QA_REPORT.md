# Frontend verification — October 24, 2026

Verified locally in the Codex in-app Chromium browser against the Next.js production build at `http://127.0.0.1:3001`. Viewport tests use browser emulation; they are not physical-device or cross-browser certification.

## Automated checks

- `npm run lint`: passed without warnings.
- `npm run typecheck`: passed.
- `npm test`: 8 passed, 0 failed. Covers API URL/body contracts, errors, polling/cancellation, fixture platform/duration handling, invalid files and response schemas, perspective corner mapping, and reversible viewport-entry interaction gating.
- `npm run build`: passed; all app routes generated successfully.
- `git diff --check`: clean before delivery.
- Public raster provenance scan: 5 rasters, none missing origin/prompt metadata.

## Visual story checks

| Stage | Verified behavior | Evidence |
| --- | --- | --- |
| Peaceful room | Licensed textured desk/hardware, plants/lamp, nature framing, readable headline and primary action | advanced-01-workspace.jpg |
| YouTube | Early camera approach, detailed sidebar, metrics, thumbnail row, drawn retention graph | advanced-02-youtube.jpg |
| Instagram | Detailed Insights window, metrics and animated reach bars over YouTube | advanced-03a-instagram.jpg |
| TikTok | Dark analytics interface, watch-time metrics, chart bars and overlapping tools | advanced-03-platforms.jpg |
| Overload | Five windows, seven tabs, fixed pool of 12 notifications, visible growing fragmentation | advanced-04-overload.jpg |
| Glass | Translucency, softened content, asymmetric stretch/skew, converging panes, Bezier contour morph and local caustic distortion | advanced-05-glass.jpg |
| Clarity | Settled central glass lens and legible Meet ViralPilot message | advanced-06-clarity.jpg |
| Entry | Same projected DOM grows to viewport and becomes an interactive studio | advanced-07-studio.jpg |
| Reverse | Camera, glass, notifications and windows reconstruct in reverse and return to peaceful room | advanced-08-reversed.jpg |

Native wheel reversal at a fixed 1440x1000 desktop viewport was checked at approximately 1.0 -> .893 -> .714 -> .405 -> 0. At .714 all 12 notifications were restored; at .405 notifications were absent and only YouTube/Instagram remained; at 0 the calm layer was fully visible and all chaos windows hidden. Forward/reverse chapter controls and return-to-room were also exercised. Screen controls are inert during storytelling and interactive after entry.

The rendered scene was visually inspected, including imported model proportions, monitor UI alignment, wood/plant textures and glass text. Fixes from inspection include earlier camera approach, larger analytics, removal of a Chromium full-backdrop SVG filter that clipped text, explicit chart/metric reveals, caption clearance and reduced-motion navigation. The current fallback capture includes the new licensed hardware.

## Responsive and accessibility coverage

- 1440x1000 desktop: complete WebGL story and reverse wheel sequence.
- 1366x768 laptop: compact opening typography keeps actions above monitor content.
- 993x871 narrow desktop: room framing, navigation and headline spacing.
- 768x1024 tablet: current scene capture, HTML story and responsive navigation.
- 390x844 mobile: no horizontal document overflow, opening controls, bounded overload, full studio entry and optimizer reflow.
- Native browser panel widths were also inspected. Crossing 900px switches between WebGL and the lighter capture/HTML mode.
- Reduced motion: zero pin spacers, no Canvas, still hero and a normal studio. Both hero and bottom entry links go to `/studio`.
- Keyboard-operable report tabs, native video controls, labeled upload, platform checkboxes and visible focus were checked. Native mobile menu open/close was exercised.
- Production story console check returned no errors or warnings.

## Functional app coverage

The upload/report flows were exercised in this implementation session: unsupported file rejection, valid original demo WebM selection, 24-second metadata/local preview, platform selection, removal/change, processing cancellation and successful demo processing. Demo status is explicit; processing stages do not claim real inference.

Reports were checked for platform selection, numeric comparison bars, strengths/opportunities and tab navigation. Timestamp feedback sought the sample player to 7.92 seconds; native playback was exercised. Optimizer tone generation, copy feedback and tab persistence were checked. The downloaded JSON export was inspected and contained the updated playful hook. The browser clipboard contents themselves were not independently read back, so copy verification covers UI success feedback and the standard Clipboard API path.

Direct demo/optimizer and empty current-session routes were checked. The final production mobile optimizer was rechecked after the advanced redesign. Screenshots 10–15 document app states; 16–22 document responsive/accessibility states. `/credits` exposes asset authors, sources, license links and modifications.

## Practical limits and integration work

No real inference service was connected or represented as tested. The current team backend on `origin/main` was inspected at `6f2e4cf`; it exposes `/score` with a different request/response and a 200 MB limit. The frontend's `/api/analyses` job API and 250 MB local validation require an agreed adapter/contract. See FRONTEND_HANDOFF.txt.

No measured FPS claim, physical mobile-device benchmark, continuous video recording or Safari/Firefox certification is made. The desktop scene uses compressed assets, bounded DOM pools, instanced keys, capped DPR, modest postprocessing and offscreen render suspension. Mobile and reduced-motion paths avoid the full WebGL workload. A real WebGL context-loss event was not induced; the shared lightweight fallback and error-boundary path are implemented.

The view outside is an original generated landscape plate behind real window geometry. It is not a navigable terrain. Sessions are in memory; refresh clears selected local files. Server-side upload validation, authentication, persistence, remote playback and cancellation remain backend/integration work.
