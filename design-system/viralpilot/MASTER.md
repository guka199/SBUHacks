# ViralPilot design system

The user's natural workspace direction overrides the CLI's generic dark/violet spatial recommendation. UI UX Pro Max was installed with the official CLI and initialized for Codex. Its accessibility, chart, layout and Three.js recommendations were applied with Taste and Impeccable guidance.

## Tokens

- Forest ink #172D26; warm ivory #F7F3EA; white surface #FFFEF9.
- Sage #95AB94; pale sky #D5E7EA; border #D6DDCF.
- Chart colors: forest #254D3E, sage #708263, warm oak #A7815F.
- DM Sans Variable for controls, copy and tabular data. Instrument Serif 400 and italic for editorial headings.
- Spacing: 8, 12, 16, 24, 32, 48, 64 px. Controls normally at least 44 px.
- Glass for the cinematic convergence and navigation; solid readable report surfaces.

## Applied recommendations

- Native labeled inputs and video controls, keyboard tabs, visible focus, nearby errors and cancellation.
- Responsive grid changes, wrapping long filenames and no horizontal overflow.
- Charts expose exact values and labels in text; color adds information.
- One reversible GSAP ScrollTrigger timeline owns the narrative. No unbounded spawning.
- A maximum of 12 notifications, 5 windows and 7 browser tabs; no fullscreen postprocessing stack.
- Lazy Three.js, capped DPR, compressed local assets, cached GLTFs and offscreen render suspension.
- Reactive reduced motion and mobile/WebGL fallback. Decorative monitor controls remain inert until entry.
- File and API validation, progress feedback, empty/error states, explicit demo labels and no silent fallback from live mode.

Implementation: src/app/app-theme.css, src/app/experience.css, ScrollExperience.tsx and dashboard.tsx. Browser evidence and limitations: QA_REPORT.md.

## Applied advanced design and motion guidance

- Three.js Skills: use PBR GLBs with color-managed maps, HDR reflections, bounded shadows, instanced keyboard geometry, compressed assets, explicit resource cleanup and lightweight fallbacks. Fabric uses physical sheen and procedural weave; a restrained postprocess pass preserves interface clarity.
- Official GSAP Skills: one scoped context and deterministic ScrollTrigger timeline; explicit chapter labels, reversible from/to states, cleanup on responsive changes, natural easing and transform-based motion. No background notification timers.
- Design DNA: preserve three dimensions in DNA.json: source-derived tokens, the warm editorial personality, and the spatial/glass rendering system. Tokens come from incumbent CSS; they are not claimed as measured reference-image colors.
- LottieFiles Motion Design: staged entrances, anticipation, stagger, follow-through and small overshoot/settle phases. Motion communicates growing fragmentation then convergence. Principles are applied to GSAP; no unnecessary Lottie dependency is added.
- Genjutsu: installed with the official website's supported installer; use its lightweight cast path on the existing stack. Apply its R3F layering, motion and performance guidance. No bunshin swarm or unsupported runtime integration.
- UI UX Pro Max: natural tonal harmony, intentional display/body pairing, strong primary actions, chart labels, keyboard focus, minimum practical control sizes, responsive reflow and reduced-motion support. Avoid heavy glass behind essential report text.
- Taste and Impeccable: preserve the strong editorial/physical identity, reduce generic card repetition, polish empty/loading/error states and keep product intent, design tokens and teammate documentation current. Single-agent audit honors the user's workflow preference.
- Official React Three Fiber installation documentation: React 19 / Fiber 9 compatibility retained with Drei 10 and Three 0.180; Three.js is transpiled in Next config. Version-specific APIs are checked against installed packages.

Sources: https://github.com/cloudai-x/threejs-skills · https://github.com/greensock/gsap-skills · https://github.com/zanwei/design-dna · https://github.com/lottiefiles/motion-design-skill · https://genjutsu.athevon.dev/docs/install · https://github.com/nextlevelbuilder/ui-ux-pro-max-skill · https://r3f.docs.pmnd.rs/getting-started/installation
