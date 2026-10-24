---
name: ViralPilot
description: An expressive creator workspace with a bold red-and-yellow identity.
colors:
  primary: "#BE1A1A"
  energetic: "#D0311E"
  yellow: "#F7D87F"
  lightYellow: "#F8EBAB"
  ink: "#171717"
typography:
  display:
    fontFamily: "Archivo Black, sans-serif"
    fontWeight: 400
    lineHeight: 0.94
  body:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "15px"
    lineHeight: 1.6
rounded:
  control: "9px"
  pill: "40px"
spacing:
  small: "8px"
  medium: "16px"
  large: "24px"
---

## Direction

Preserve the user's approved identity and composition. Expressive Archivo Black headlines, black ink, red actions and yellow surfaces frame a physical creator workspace. DM Sans carries readable controls, charts and reports. The monitor is the narrative focal point. Current tokens and overrides live in src/app/identity.css, imported last.

## Composition and controls

Desktop balances the headline left and monitor right. Early camera movement brings detailed analytics forward; glass merges them into a product demonstration and interactive report. Phone demonstrations reflow to a portrait logical layout after the merge; the opening desktop keeps its photographed aspect ratio. App pages retain readable spacing and responsive grids.

Primary controls use #BE1A1A with #F8EBAB type; dark controls use #171717/light-yellow. Secondary hero controls have a defined light-yellow surface, dark text and border. Hover raises controls slightly and changes surface; press settles them. Focus uses a 3px red outline with 4px offset. Functional controls target at least 44px; story-dot hit areas exceed visible dots. Floating controls reposition by breakpoint to avoid collisions. Demo labels remain visible.

On red surfaces use light-yellow text; on yellow use black. Numeric labels and platform names supplement chart color. Essential report surfaces remain solid. Glass belongs to narrative/nav accents, not data decoration.

## Materials and scenery

Existing licensed monitor, keyboard, desk, mouse, headphones, lamp and plants remain. Graphite photographic wood, red keyboard case, metal, ceramic and woven fabric support the approved identity. Local HDRI, soft window light and cached contact shadows ground objects. Restrained half-float postprocessing protects monitor legibility.

The exact supplied ocean photo is only the desktop wallpaper. Proportional WebP conversion and center/cover preserve horizon/sailboat without stretching. Outside is a separate Poly Haven Meadow 2 CC0 plate, subtly displaced in foliage regions, with soft clouds at separate depths. A low-amplitude 180-second sine cycle creates repeatable motion and parallax. This is a photographic depth plate, not modeled terrain.

## Motion ownership

The independent 16-second loop owns inner analytics windows/tabs/notifications. The scroll timeline owns outer shells, camera, glass and product layers. At scroll progress >0.15 the loop pauses; returning resumes it. User pause, hidden tabs and offscreen visibility also suspend it. Scoped GSAP contexts clean up both timelines.

Keep six scenes: problem → Meet ViralPilot → analysis → comparison → optimization → unified dashboard. Glass uses convergence, skew/stretch/radius deformation, SVG contour morphs, blurred local reflection and a local caustic. Essential text excludes distortion. Scrub0.55, time-based exponential camera damping, eased poses and smoothstep viewport entry soften velocity changes. Scroll-owned state reverses from the same playhead.

Reduced motion removes pinning, camera travel and auto looping, exposing a still hero plus normal studio. WebGL loads lazily at >=900px; smaller screens use the current capture with live bounded HTML. LottieFiles staging/follow-through principles are applied without an extra runtime.

## Application conventions

Use shared button/copy/icon controls, labeled native fields/player, nearby validation, cancellable stages and keyboard report tabs. Copy confirms completion. Updated tone suggestions survive tab switches/export. Fixture processing must never look like real AI; API failures must remain visible.

## References and skills

Work Louder hardware detail and Henry's expressive typography inform the stronger identity; Yamauchi contributes depth. The desk reference informs composition, Crate the tangible centerpiece, Railroad the window/spatial framing. The later user palette supersedes earlier natural/serif decisions. UI UX Pro Max supports contrast/hierarchy/responsiveness; Taste/Impeccable guide purposeful states and preservation; Design DNA records tokens/feel/effects. Three.js, GSAP, Motion Design and Genjutsu inform materials, lifecycle, performance and choreography. See design-system/viralpilot/MASTER.md.
