# ViralPilot

A cinematic creator studio for SBUHacks. An automatic desktop loop shows the problem; six connected scroll scenes demonstrate video analysis, platform fit, optimization and a unified dashboard. The red/yellow identity continues through the app.

For new frontend work, follow [UI/UX guidelines](UI_UX_GUIDELINES.md). This includes the user's preservation rules and a dated skill-installation audit; earlier skill-usage notes below describe historical work rather than the current installed catalog.

## Start the frontend

Requires Node.js 22+ and npm. From this frontend/ directory:

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Start FastAPI on port 8000, create an account, optionally link social accounts, and upload your video with its caption. Reports and generated publishing copy are saved to your account. See [integration setup](../docs/frontend-backend.md). `/demo` and **Try our sample video** remain explicit examples requiring no account or provider keys.

```sh
npm run check   # ESLint, TypeScript and 10 tests
npm run build
npm start
```

Copy `.env.example` to ignored `.env.local` only to change configuration. Live mode is the default. The browser calls `/backend`; server-only `API_URL` selects the FastAPI origin. Set `NEXT_PUBLIC_DEMO_MODE=true` for offline demo behavior. Public variables must never contain secrets. `NEXT_PUBLIC_ENABLE_3D=false` selects the lightweight experience.

## Included

- Licensed PBR workspace, graphite desk/red keyboard, HDR reflections, soft shadows and separate subtly animated CC0 outdoor scenery.
- User's exact ocean photograph as monitor wallpaper, proportionally optimized to WebP.
- Independent 16-second HTML desktop loop, bounded notifications and pause/resume.
- Reversible glass merge → analysis → comparison → optimization → unified report; continuous camera/HTML entry.
- Drag/drop upload, preview, validation, platform selection, cancellable demo stages and validated live API requests.
- Four-platform readiness scores, video timestamps/player, tone-aware optimizer, copy and JSON export.
- Responsive controls, mobile/no-WebGL capture with live HTML, readable phone walkthrough and reduced-motion alternative.

Demo analytics, scores, suggestions and processing remain explicitly illustrative. Live reports use the trained models and available Gemini review; missing metrics and provider failures are disclosed. Sign-in, connected accounts, settings, saved reports, video playback and Gemini copy generation use the real API.

## Routes and handoff

`/` story · `/studio` entry · `/analyze` or `/upload` · `/demo` · `/analysis` · `/analysis/[id]` · `/analysis/[id]/optimize` · `/signup` · `/login` · `/accounts` · `/settings` · `/reports` · `/ideas` · `/workspace-preview` · `/credits`.

**Content ideas:** `/ideas` uses your posts, audience and saved reviews for follow-up and evergreen ideas, plus trend-inspired ideas when dated external evidence fits. Optionally save a filming budget and style/audience preferences; choose a platform (or All platforms for a shared concept with five format adaptations) and optionally research recent signals by market/topic. Inspect sources/coverage, save or dismiss ideas, and rate usefulness. YouTube research uses recent API examples; other platforms use cited web reporting, not native trend feeds. Connect a channel or provide at least two distinct captions/analyses first. See [data/API contract](../docs/content-ideas.md).

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
