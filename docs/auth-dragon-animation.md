# Authentication artwork animation

October 25, 2026 — restored on `feature/restore-auth-dragon` from the saved
`feature/auth-dragon-animation` work, on top of main commit `69690ac`.

The user approved placing the existing form and actions in the illustration's
empty left area, with the dragon on the right. Inputs, typography, button styles,
validation and authentication requests are retained. Login and signup share the
same component. The cinematic homepage and backend are unchanged.

## Assets and alignment

`frontend/public/art/auth-dragon/` contains lossless WebP exports from the supplied
`viralpilot_parallax_layers.zip`. All four original artwork layers use the same
1855×848 canvas, common cover positioning and proportional scaling. The 1100px
mobile reference is uniformly resized; mobile displays the entire composition.
`manifest.json` records hashes, sizes and the rest-alignment check.

The pack contains approximate overlapping masks, not independently painted
objects. The flattened original remains underneath the overlays. At rest, both
the original PNG stack and the exported WebP stack reconstruct the reference with
zero mean RGB error and zero maximum channel difference. All animated wrappers
share the same 3px overscan so their coordinates remain aligned at the boundary.
No artwork was regenerated or independently stretched.

Movement deliberately stays below the user's upper limits because larger offsets
would reveal duplicated ink lines. There is no separate cloud asset: cloud drift
uses the original painted reference underlay, preserving its composition.

The original animation work did not alter global branding. The restoration
preserves the full supplied homepage wordmark already delivered on main.
Unused logo crops and original ZIP archives are not copied into the application.

## Responsibilities and timing

`frontend/src/components/auth/dragon-artwork.tsx` owns animation; its CSS Module
owns the artwork/form composition. AuthForm only increments `shimmerKey` when a
valid form submits. It never awaits an animation or changes a score/API contract.

- Entrance: one 1.5s GSAP timeline after image decoding. Paper, sun, dragon, waves,
  reference and particles enter with restrained overlapping cues. The form stays
  available throughout loading and entrance.
- Pointer: native pointer events on the scene normalize to [-1,1]. A demand-only
  requestAnimationFrame loop uses time-based exponential smoothing (165ms time
  constant), then stops when settled. No per-frame React state changes.
- Depth: dragon 1.6px, sun -0.9px, waves and reference -0.7px maximum horizontal
  pointer offsets; vertical offsets are 65% of these. Pointer exit eases to rest.
- Breathing: nested dragon wrapper scales uniformly from 1 to 1.003 and moves up
  0.55px; 3.5s forward plus 3.5s reverse makes a seamless seven-second cycle.
- Environment: reference drift +/-0.35px over a 25s reversible cycle; waves
  +/-0.45px over 15s. The entrance, depth and loop transforms own separate nodes.
- Particles: six sparse 2–3px golden motes, max opacity .22, with staggered slow
  rise/fade cycles. No canvas, particle framework, blur or glow is added.
- Shimmer: one reusable 720ms soft-light timeline on the art's right side, restarted
  on submission. It does not navigate or alter the authentication promise.

Pause freezes entrance/loops, stops pointer work, and clears transient shimmer.
Pausing during entrance leaves a complete still composition. Hidden-document and
offscreen observers pause work; all observers, listeners, rAF callbacks and GSAP
contexts are cleaned up on unmount or preference changes.

Fine-pointer desktops at least 950px wide animate. Touch/coarse-pointer layouts,
smaller screens and reduced motion use the intact still image, with no extra
overlays/particles requested. Two/four-core devices halve parallax and show three
particles. No new package dependency or Three.js renderer is used.

## Eye effects deliberately omitted

There is no separate eye, pupil or eyelid in either supplied archive. No clean
closure can be derived without covering or repainting the approved eye. Therefore
blinking, pupil tracking and password-focus eye closure are not implemented. The
face is preserved, as the brief explicitly prioritizes artwork fidelity. Password
focus and typing retain their normal form behavior; no substitute eye is drawn.

## Authentication

Failed authentication displays the existing error and stays on the form. Successful
authentication follows the existing sanitized `next` path/default route. The safe
allowlist now also accepts `/dashboard`, the already existing product route, so
`/login?next=/dashboard` can enter it only after success. Existing default login
(`/analyze`) and signup (`/accounts`) destinations are preserved.

## Browser verification

Checked the desktop/laptop composition, pointer movement and return to approximately
zero offsets, independently changing breath/cloud/wave transforms, stable pause
over a second, resume, and a visible submission-shimmer transform/opacity change.

Using only the ignored isolated SQLite QA API, an incorrect password displayed
"Wrong email or password" and remained at login. A correct synthetic account
reached `/dashboard` with `next=/dashboard`. No real credentials, paid provider
calls, production users or Snowflake records were changed.

At 390×844 the full still composition and form fit without horizontal overflow or
nested vertical scrolling; the only artwork image element requested the 1100px reference (plus the small CSS paper background). At reduced
motion on desktop there was one still image, no pointer transform and no pause
button. At two emulated CPU cores the economy flag enabled three visible motes.
The desktop remained interactive with 4× CPU throttling. This is not a measured
60fps or physical-device certification. The browser runner kept both tabs visible,
so hidden-tab suspension was checked in code rather than reproduced with a real
hidden document. No eye effects are claimed as verified.

QA screenshots are ignored local artifacts: `.secrets/dragon-auth-desktop.png` and
`.secrets/dragon-auth-mobile.png`. They are not redistributed application assets.

Run the existing `npm run check` and `npm run build` in `frontend/`. No additional
environment variables are needed. The illustration can be disabled by removing
DragonArtwork from AuthForm; static-only mode can be selected in its media-query
policy without affecting authentication.

Final checks: frontend ESLint, TypeScript and all 25 existing tests pass; the
production build passes, including login/signup and the existing product routes.
No backend logic or homepage source was changed.
