# ViralPilot

A cinematic creator studio built for SBUHacks. Scroll through a real 3D workspace, watch platform analytics turn into overload, and enter a calmer video planning app.

## Start the frontend

Requires Node.js 22+ and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Demo mode works without an account, API key or environment file. Choose **Start creating → Try our sample video → Explore sample analysis**, or open `/demo` directly.

```sh
npm run check   # ESLint, TypeScript and 8 API/validation/projection tests
npm run build
npm start
```

Copy `.env.example` to `.env.local` only when changing configuration. To connect a backend, set `NEXT_PUBLIC_DEMO_MODE=false` and `NEXT_PUBLIC_API_BASE_URL`. These are public browser variables; never put secrets in them. The live contract is documented in [FRONTEND_HANDOFF.txt](FRONTEND_HANDOFF.txt). The team's current `/score` backend requires an adapter to this contract; changing the URL alone is insufficient.

## What is included

- PBR workspace with licensed GLB desk, monitor, keyboard, mouse, headphones, plants and articulated lamp, photographic oak maps, HDRI reflections and a mountain view.
- A deterministic GSAP story: detailed YouTube, Instagram and TikTok interfaces, bounded notification overload, deforming glass convergence and continuous monitor-to-app entry. Upward scrolling reverses it.
- Drag-and-drop upload, local video preview, validation, platform selection, cancellable demo processing and a live API adapter with genuine upload progress.
- Four-platform readiness reports, labeled comparison charts, timestamped feedback and a native video player.
- Hooks, titles, captions, descriptions, calls to action, tone variations, copy actions and JSON report export.
- Mobile/WebGL fallback, reduced-motion view and accessible controls. Demo results are explicitly illustrative.

## Routes

`/` cinematic story · `/studio` studio entry · `/analyze` or `/upload` upload and processing · `/demo` example report · `/analysis` current session report · `/analysis/[id]` live report retrieval · `/analysis/[id]/optimize` optimizer (`demo` opens the example) · `/workspace-preview` isolated scene · `/credits` asset attribution.

## Team handoff

- [FRONTEND_HANDOFF.txt](FRONTEND_HANDOFF.txt): architecture, setup, complete API examples and integration notes.
- [ASSET_NOTICES.md](ASSET_NOTICES.md): model sources, licenses and provenance.
- [DESIGN.md](DESIGN.md): design tokens and component/motion conventions.
- [QA_REPORT.md](QA_REPORT.md): tested viewports, story stages and limitations.
- `screenshots/`: browser evidence for the story and app.

Work is on the existing `viralpilot` frontend branch. The backend and existing web app on `main` are preserved. When integrating into that monorepo, place this frontend in an agreed directory and migrate the contracts through a normal reviewed change.

## Rebuilding assets

Runtime assets are committed, so no download step is required to run the app.

```sh
npm run build:assets   # original architecture and desk accessories
npm run fetch:assets   # fetch and pack the named Poly Haven CC0 assets
npm run fetch:hardware # optional hardware + pinned keyboard sources
npm run build:keyboard # assemble the downloaded sculpted keyboard
npm run optimize:assets # Meshopt and WebP compression; preserves runtime oak UVs
```

The official UI UX Pro Max CLI was installed and initialized for Codex. Its generated skill folder is local tooling and ignored; the applied design recommendations are recorded in `design-system/viralpilot/MASTER.md`. The installed Three.js, GSAP, Design DNA, LottieFiles Motion Design and Genjutsu skills were also applied alongside Taste and Impeccable. See the design-system notes for concrete decisions. React Three Fiber is used as a library, not presented as a skill.
