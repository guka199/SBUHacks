# ViralPilot frontend direction

Read [UI_UX_GUIDELINES.md](UI_UX_GUIDELINES.md), [DESIGN.md](DESIGN.md) and the relevant existing components before frontend implementation. Extend the approved red/yellow identity; reuse `src/app/identity.css` tokens and shared controls. Preserve the homepage, independent monitor/story timelines, accessible responsive behavior and a single primary page scrollbar. Keep UI tasks scoped to frontend behavior; backend changes require their own task scope. Verify requested UI changes on desktop/mobile.

The guidelines include a dated audit of the nine requested design/motion/copy skills. Historical handoff claims do not establish current installation; read the actual applicable installed `SKILL.md` before claiming to use a skill.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
