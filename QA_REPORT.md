# Frontend verification — October 24, 2026

Tested the red/yellow delivery and final refinement in the Codex in-app Chromium browser, including the Next.js production server at http://127.0.0.1:3001. Sizes below are browser viewport emulation, not physical-device or cross-browser certification.

## Automated checks

- `npm run check`: ESLint and TypeScript passed; 10 tests passed, zero failures.
- Tests cover live API URL/body contracts, errors, polling/cancellation, fixture platform/duration handling, file/schema validation, perspective corner mapping, reversible entry gating, captured-scene/HTML alignment, compact-screen clearance and smooth entry endpoints.
- `npm run build`: passed; all 11 application routes compiled/generated successfully.
- `git diff --check`: clean before delivery.
- Public raster origin scan: 6 rasters, zero missing provenance. WebP uses adjacent origin sidecars; JPEG contains a COM origin notice.

## Visual and interaction checks

| Surface/stage | Checked | Evidence in screenshots/ |
| --- | --- | --- |
| Opening | Approved typography/palette/composition, separate green outdoor view, exact ocean wallpaper inside monitor, distinct CTAs | polish-01-desktop-hero.jpg |
| Automatic desktop | YouTube/Instagram/TikTok HTML, chart growth, tabs, window rearrangement/closing/reopening, notifications | polish-02-automatic-desktop.jpg, polish-03-bounded-overload.jpg, polish-18-mobile-home.jpg |
| Glass | Convergence, stretch/skew/radius changes, organic contour morph, caustic, stable reflected texture | polish-04-glass-merge.jpg |
| Analysis | Animated sample upload/progress and hook/pacing/caption/opportunity stages | polish-05-analysis.jpg |
| Comparison | Four labeled illustrative readiness scores and animated bars | polish-06-comparison.jpg |
| Optimizer story | Before/after hook plus title/caption/edit examples | polish-07-optimization.jpg |
| Unified report | Final headline and report composition | polish-08-unified.jpg |
| Entry | Same HTML screen becomes interactive dashboard; return action works | polish-09-interactive-dashboard.jpg |
| Laptop / narrow desktop | Controls separated, headline clears monitor content | polish-10-laptop.jpg, polish-11-narrow-desktop.jpg |
| Tablet | Captured room/live HTML remain aligned; controls and actions separated | polish-12-tablet.jpg |
| Phone story | Readable portrait demonstrations and working entry, no footer collision | polish-13-mobile-analysis.jpg through polish-18-mobile-home.jpg |
| Upload | Menu navigates to upload, sample preview/metadata, platform selection and demo processing complete into /analysis | polish-19-upload.jpg |
| Optimizer app | Playful tone updates hook, copy confirms completion; buttons/selected states readable | polish-20-mobile-optimizer.jpg |
| Insights app | ArrowLeft switches tabs; timestamp action seeks actual 24-second video to 7.92s, native video readyState4 | polish-21-mobile-insights.jpg |
| Reduced motion | No Canvas, no auto windows, no pin spacer; still opening and normal studio remain usable | polish-22-reduced-motion.jpg, polish-23-reduced-hero.jpg |

Viewport coverage: 1440x900 desktop; 1280x720 laptop; 993x694 narrow desktop; 768x1024 tablet; 390x844 phone; 375x667 compact phone; default browser panel size. Temporary viewport and reduced-motion emulation were reset at the end.

The loop advanced from cycle0 to cycle1 while progress/scrollY remained0. Pause held the exact time7.90 across inspections, then resumed. DOM remained bounded at3 platform windows,5 browser tabs and6 notifications. At product-story progress the autonomous loop paused, then resumed when returning to the problem.

Both chapter controls and real wheel events were tested forward/backward. A wheel excursion from progress0.2400 returned to0.2400 with equal opposite input. Reversed analysis/comparison/optimization/glass/opening and dashboard-to-story entry; same timeline reconstructs state. Automated projection/fallback tests independently verify deterministic geometry and interaction gating.

Outdoor sky/clouds/green trees were visually inspected from the opening and close camera views. The shader compiled without console errors. Tiny masked canopy displacement and cloud sine drift run from R3F refs/uniforms on a180-second seamless cycle; distinct depths provide camera parallax. The small movement remains subordinate to the monitor. The exact ocean image is a proportional ICC-aware conversion; its horizon/sailboat remain in the crop. Analytics windows may naturally occlude parts of it.

Keyboard focus is visible with the approved red outline and offset. Solid foreground/background contrast calculations: light-yellow/red5.21:1, black/yellow12.88:1, black/light-yellow14.91:1. These are token-pair measurements, not a claim of a complete WCAG audit of every pixel.

## Issues found and fixed

- Oversized Chromium backdrop-capture rectangles under perspective transforms: removed backdrop blur from small moving UI. Glass retains deformation/highlights/caustic with a locally blurred reflection copy. No oversized blur slabs in final captures.
- Compact-phone actions covered monitor content: lightweight/reduced opening now measures the actual caption/action block and fits the monitor between that block and floating controls; font/resize refresh recalculates it.
- Small phone demonstrations were unreadable: same DOM adapts to a portrait logical layout after the glass merge. Short-screen height cap clears controls.
- Optimizer footer collision: adjusted phone typography/spacing to fit actual suggestions.
- Narrow desktop headline touched monitor: refined only that breakpoint's display scale.
- Camera/entry velocity changes: eased poses, time-based position/aim damping, scrub0.55 and smoothstep entry.
- Old scenery/wallpaper/capture replaced, with exact sources/licenses/hashes and refreshed v7 capture.

Final browser inspection reported no console warnings/errors for the tested UI/shader flows. Startup stderr was clean. No runtime dependency was added for the final polish.

## Limits and integration

- No real backend/inference service was available for end-to-end live AI validation. HTTP contracts have meaningful mocked tests; the team must adapt /score to /api/analyses, align upload limits and provide actual model output.
- Demo processing/results/suggestions are labeled authored examples. Social illustrations do not connect accounts or predict performance.
- Mobile/no-WebGL uses the current room capture plus live HTML; outdoor motion is desktop WebGL only. Reduced motion intentionally removes the cinematic movement.
- Outdoor scenery is a photographic depth plate with subtle motion, not a fully modeled forest. Glass refraction is an efficient visual approximation.
- Local file sessions clear on refresh. Restored live reports lack remote playback URLs; client cancellation does not cancel an accepted server job. MOV codec support varies.
- No physical-device FPS benchmark, Safari/Firefox certification or recorded-video performance claim. Further target-GPU profiling is recommended before public deployment.

The stale green-version browser captures were removed and replaced with this delivery's red/yellow evidence. Asset attributions remain in ASSET_NOTICES.md, /credits and the manifests.

## Single-scroll-container regression fix

The embedded report's overflow:auto caused a second vertical scrollbar at entry.
It now contributes its full height to the document, with ResizeObserver-managed
space after the unchanged viewport pin. Preview clipping uses overflow:clip;
full entry opens clipping without creating a new scroll owner. Return control
uses normal report flow. Timeline/camera/projection files were not changed.

Production desktop inspection: document.scrollingElement=HTML, no nested
vertically scrollable auto/scroll containers at opening, entry or report tail.
Page-down moved root scrollY5400 ->6100 with application.scrollTop=0; wheel
input moved it6100 ->6660.67 while application.scrollTop stayed0. Report/footer
bounds meet within subpixel rounding; video/feedback and footer stay accessible.
The root's computed style is scrollbar-width:thin and #171717/transparent.
ESLint/TypeScript,10 tests and production build pass. Evidence:
scrollbars-desktop-entry.jpg and scrollbars-desktop-bottom.jpg.
Standard scrollbar properties cover current Firefox/Chromium; WebKit pseudo-
elements supply an8px rounded fallback. Safari/Firefox were not device-tested.
