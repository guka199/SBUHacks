# ViralPilot

A cinematic creator studio for SBUHacks. An automatic desktop loop shows the problem; six connected scroll scenes demonstrate video analysis, platform fit, optimization and a unified dashboard. The red/yellow identity continues through the app.

## Start the frontend

Requires Node.js 22+ and npm. From this frontend/ directory:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Demo mode needs no account, API key or environment file. Use **Try your video → Try our sample video**, or open `/demo` for an interactive example.

```sh
npm run check   # ESLint, TypeScript and 10 tests
npm run build
npm start
```

Copy `.env.example` to ignored `.env.local` only to change configuration. For live mode set `NEXT_PUBLIC_DEMO_MODE=false` and `NEXT_PUBLIC_API_BASE_URL`. Public variables must never contain secrets. The team's `/score` backend needs an adapter to the documented `/api/analyses` contract; changing the URL alone does not connect them. `NEXT_PUBLIC_ENABLE_3D=false` selects the lightweight experience.

## Included

- Licensed PBR workspace, graphite desk/red keyboard, HDR reflections, soft shadows and separate subtly animated CC0 outdoor scenery.
- User's exact ocean photograph as monitor wallpaper, proportionally optimized to WebP.
- Independent 16-second HTML desktop loop, bounded notifications and pause/resume.
- Reversible glass merge → analysis → comparison → optimization → unified report; continuous camera/HTML entry.
- Drag/drop upload, preview, validation, platform selection, cancellable demo stages and validated live API requests.
- Four-platform readiness scores, video timestamps/player, tone-aware optimizer, copy and JSON export.
- Responsive controls, mobile/no-WebGL capture with live HTML, readable phone walkthrough and reduced-motion alternative.

Demo analytics, scores, suggestions and processing are explicitly illustrative. Demo files stay local. Real AI/backend integration remains team work.

## Routes and handoff

`/` story · `/studio` entry · `/analyze` or `/upload` · `/demo` · `/analysis` · `/analysis/[id]` · `/analysis/[id]/optimize` · `/workspace-preview` · `/credits`.

[FRONTEND_HANDOFF.txt](../FRONTEND_HANDOFF.txt) covers architecture, complete API JSON examples and integration. [ASSET_NOTICES.md](ASSET_NOTICES.md) records artists/licenses. [DESIGN.md](DESIGN.md) and `design-system/viralpilot` describe tokens/motion. [QA_REPORT.md](QA_REPORT.md) and `screenshots/` contain browser evidence and limits.

Integrated into **main** under **frontend/** from the viralpilot feature branch. Existing web/backend/ML/data files are preserved. The canonical team handoff is at the monorepo root.

## Optional asset preparation

Runtime assets are committed; no download is required to run the app.

```sh
npm run build:assets
npm run fetch:assets
npm run fetch:hardware
npm run build:keyboard
npm run optimize:assets
node scripts/prepare-polish-assets.mjs /absolute/path/to/user-ocean-photo.jpg
```

The last command downloads the CC0 Meadow 2 backplate and processes the supplied photograph. Raw user originals are not distributed. See manifests for exact hashes/source URLs. UI UX Pro Max and the requested Three.js/GSAP/Design DNA/Motion Design/Genjutsu/Taste/Impeccable guidance are applied; local skill tooling is ignored.
