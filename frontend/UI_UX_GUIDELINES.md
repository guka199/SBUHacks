# ViralPilot UI/UX guidelines

User-provided project direction, recorded October 24, 2026. Apply to future frontend work. Extend the approved website's identity and interaction patterns. Backend changes require their own task scope.

## Inspect before implementing

Read `DESIGN.md`, `design-system/viralpilot/MASTER.md`, relevant existing components and their styles before making a frontend change. `src/app/identity.css` defines the current identity override. `src/app/layout.tsx` then imports `product-polish.css` for scoped product forms, navigation breakpoints and accessibility refinements. Earlier dark/green or serif tokens in other stylesheets are superseded by it.

Reuse `src/components/ui.tsx`, shared button classes, native labeled form controls, the existing navigation and the established design tokens. Scope page-specific additions with CSS Modules or the existing component stylesheet. Preserve native CSS Module handling in `next.config.ts`.

## Visual identity

Expressive creative studio: bold, energetic, premium, playful and professional. Favor clear hierarchy, generous alignment and a restrained amount of content. Every new component should belong to the existing product.

| Color | Token | Use |
| --- | --- | --- |
| `#BE1A1A` | `--red`, `--accent` | Primary actions and emphasis |
| `#D0311E` | `--orange` | Secondary red-orange accent |
| `#F7D87F` | `--yellow`, `--raised` | Bright yellow/elevated surfaces |
| `#F8EBAB` | `--light-yellow`, `--ground` | Main light-yellow background |
| `#171717` | `--black`, `--ink` | Text and strong contrast |
| `#FFF9E3` | `--surface` | Existing cream card surface |

Use yellow surfaces, black typography and red interactive emphasis. Keep the palette controlled. Generic purple/blue AI gradients and dull gray dashboard styling do not match this direction.

## Typography and copy

- Use the existing local Archivo Black display font and DM Sans Variable interface/body font.
- New major headlines should have the bold, large, geometric, uppercase editorial treatment where it fits the established hierarchy. Preserve approved existing copy and composition.
- Keep headline tracking tight and readable, with a clear distinction between titles, descriptions and body text.
- Use direct, useful copy and clear action labels. Remove repeated explanations and decorative filler.

## Components and layout

- Primary buttons: red with light-yellow text. Secondary controls: defined, high-contrast surfaces/borders. Follow the existing 9px control radius, pill patterns, hover lift and press states.
- Cards: cream or yellow surfaces, subtle borders, generous internal spacing, aligned content and minimal shadows. Keep visual grouping purposeful.
- Forms: visible labels, readable input sizes, nearby validation and consistent keyboard focus. Preserve the existing red 3px focus outline with 4px offset. Functional targets should be at least 44px where practical.
- Reuse the established spacing scale: 8/12/16/24/32/48/64px.
- Keep summaries scannable; reveal detailed explanations and source evidence on demand. Preserve actionable loading, empty, error and success states.
- Reflow responsively. Maintain one primary page scrollbar; avoid adding nested page-level scrolling or horizontal overflow.
- Maintain accessible contrast and readable typography. Supplement color with text, labels or icons where meaning depends on it.

## Motion, 3D and homepage preservation

Keep the existing creator workspace, monitor, ocean/sailboat wallpaper, room and subtly animated outdoor scenery. Preserve the six scenes in order: platform-management problem, unified interface, AI analysis, platform comparison, content optimization and final dashboard.

The monitor's automatic analytics-window loop has its own timeline. Scrolling owns the outer story/camera/product transitions. Preserve this separate ownership, existing visibility/pause behavior, reversible timeline cleanup and reduced-motion fallbacks. Inspect `home/monitor-loop.ts`, `home/choreography.ts`, `home/ScrollExperience.tsx` and relevant `three/` components before touching them.

Use existing GSAP/ScrollTrigger, Motion for React, Three.js, Fiber and Drei for their appropriate responsibilities. Movement should be fluid, cinematic and intentional, with restrained microinteractions and controlled easing. Preserve the existing performance limits and lifecycle cleanup.

Liquid Glass belongs on selected premium/nav/story accents: subtle transparency, blur, reflection and soft borders. Essential text, controls and report data must stay readable. Existing local reflection and distortion limits are documented in `DESIGN.md` and `.impeccable/design.json`.

## Working rules

1. Inspect the existing frontend and applicable installed skill instructions.
2. Keep UI work scoped to the requested frontend components; preserve backend logic, API behavior, current animations and data contracts.
3. Reuse tokens/components before adding another library or visual system.
4. Check desktop and mobile layouts, including overflow, keyboard focus, contrast and reduced-motion behavior appropriate to the change. The user explicitly requested desktop/mobile layout verification for future UI work.
5. State which checks actually ran and any remaining limitations.

## Selected skills: installation audit

Checked October 24, 2026: this chat's available skill catalog, user Codex skills/plugin cache/vendor imports, common user skill locations and `SKILL.md` files under the ChatGPT project directories, including ignored project tooling. None of the nine selected skills was found as an installed skill in those locations. Existing design/handoff documents describe past usage; those historical statements are not proof of current installation. The `.impeccable/design.json` file is project configuration, not an installed Impeccable skill.

| Requested skill | User-provided source | Current finding |
| --- | --- | --- |
| Design Taste / Frontend Design | https://github.com/leonxlnx/taste-skill | Not found |
| UI UX Pro Max | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | Not found |
| Impeccable | https://impeccable.style/docs/impeccable/ | Not found |
| Three.js Skills | https://github.com/CloudAI-X/threejs-skills | Not found |
| GSAP Skills | https://github.com/greensock/gsap-skills | Not found |
| Design DNA | https://github.com/zanwei/design-dna | Not found |
| LottieFiles Motion Design | https://github.com/LottieFiles/motion-design-skill | Not found |
| Genjutsu | https://github.com/AThevon/genjutsu | Not found |
| Stop Slop | https://github.com/hardikpandya/stop-slop | Not found |

These links identify the requested sources; this audit did not download, install or assess the external packages. Use relevant skills once their installation is confirmed and their instructions have been read. The user's approved design direction takes priority over conflicting skill defaults.

## Existing libraries versus requested resources

The project already declares and has local copies of Next.js, React, TypeScript, Tailwind, Three.js, React Three Fiber, Drei, GSAP and `framer-motion` (Motion for React). Reuse these. Their installed versions are defined by the local package lock/runtime; do not upgrade them as part of a visual refinement.

AnimMaster and Skiper UI are user-supplied component/example resources, distinct from Codex skills. Neither is declared as a package dependency. Skiper UI already has an attributed source adaptation in `src/components/ui/animated-link.tsx`, with homepage/credits references; preserve those credits. AnimMaster was not found in the inspected frontend source. The current project applies motion principles without a Lottie runtime dependency.
