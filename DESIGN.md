---
name: ViralPilot
description: A calm creator studio reached through a cinematic workspace.
colors:
  forest: "#172D26"
  ivory: "#F7F3EA"
  paper: "#FFFEF9"
  sage: "#95AB94"
  sky: "#D5E7EA"
  action: "#31583B"
  muted: "#60725F"
  line: "#D9E1D1"
  error: "#A5442E"
typography:
  display:
    fontFamily: "Instrument Serif, serif"
    fontWeight: 400
    lineHeight: 1.05
  body:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  control: "9px"
  pill: "40px"
spacing:
  small: "8px"
  medium: "16px"
  large: "24px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
---

## Overview

ViralPilot makes a fragmented creator workflow feel calm and tangible. The landing page begins in a sunlit workspace, approaches the monitor, illustrates growing analytics overload, and gathers the windows into one usable studio. The application carries the same warm colors and editorial typography into readable reports.

This document refreshes the earlier workspace checkpoint to reflect the implemented product. Token values come from app-theme.css and cinematic.css; source references and effects are structured in design-system/viralpilot/DNA.json.

Key characteristics:

- Warm ivory, forest ink, restrained sage and natural materials.
- Instrument Serif for editorial emphasis; DM Sans for information and controls.
- Rich spatial storytelling on the homepage; clear, solid report surfaces.
- Reversible motion with a lightweight mobile path and reduced-motion alternative.

## Colors

Forest #172D26 carries headlines and primary text. Action green #31583B grounds controls; muted green #60725F supports secondary information. Ivory #F7F3EA and paper #FFFEF9 form the application background and report surfaces, separated by #D9E1D1 borders. Sage #95AB94 and sky #D5E7EA connect charts and glass to the room's nature view. Error #A5442E always accompanies explanatory text.

Colors identify platform series and selected states alongside names, numbers and icons. Scores and recommendations never depend on color alone.

## Typography

Instrument Serif 400, including its italic face, gives large statements a human, editorial cadence. DM Sans Variable carries body copy, forms, metrics, navigation and charts. Both are self-hosted through Fontsource. The app body is 15px/1.6. Hero and section sizes use responsive clamps in experience.css and cinematic.css. Preserve the large display/small interface contrast without shrinking functional controls to cinematic mock-interface sizes.

## Layout

The first viewport balances a centered headline above the physical monitor. Camera movement begins early and brings the monitor forward before analytics accumulate. The inside-screen composition is a 960x540 DOM coordinate space mapped through the real monitor corners; it grows to viewport dimensions during entry. Keep storytelling captions above the screen, not over important data.

Application screens use constrained reading widths, generous section gaps and denser related metric groups. Reports collapse from multiple columns to a single scrolling column. Below 900px the story uses a scene capture and the same HTML sequence instead of loading WebGL. Reduced motion removes the pinned zoom and exposes a normal studio after the still hero.

## Elevation & Depth

The room combines photographic wood textures, PBR hardware, a local HDR environment, window light, directional shadows and two one-time contact-shadow captures. Fabric uses a procedural weave bump and physical sheen. A restrained half-float postprocessing pass provides antialiasing, a subtle vignette and output color management.

Glass is reserved for navigation and the narrative transformation. Use 14–18px backdrop blur, translucent neutral surfaces, bright fine edges and soft shadows. The glass contour morphs while panels converge; only a local caustic texture receives SVG refraction distortion, keeping essential text readable. Functional report cards remain opaque enough for reliable contrast.

## Shapes

Application controls use a 9px radius. Pills belong to navigation and compact story controls. Analytics windows begin as ordinary rounded software windows and deform into asymmetric glass before converging. Fluid organic clipping belongs to this transition, not ordinary data cards.

## Components

Primary buttons use forest/action green and warm white type; hover deepens the surface and keyboard focus uses a visible two-pixel green outline with offset. Native fields retain browser semantics and selected platform controls show an explicit checked state.

Report tabs support arrow keys, Home and End. Comparison bars include numeric labels. Timestamp feedback seeks the native player. Copy controls confirm their result; tone changes persist across report tabs and export. Empty, upload, processing, cancellation and error states offer concrete next actions. Demo labels remain visible around simulated results.

The homepage choreography lives in home/choreography.ts. One GSAP playhead owns cameras, windows, graphs, tabs, bounded notifications and glass. Anticipation, staggered secondary motion and short overshoot/settle phases give weight without an autonomous animation loop. Keep reverse scrolling deterministic.

## Do's and Don'ts

- Do preserve the room-to-monitor-to-studio spatial continuity.
- Do use the same type and natural palette throughout the application.
- Do keep author credits and licenses with transformed models and captures.
- Do support reduced motion, keyboard navigation and a no-WebGL path.
- Don't represent fixture results or processing stages as real AI inference.
- Don't introduce unbounded notification timers or independent competing timelines.
- Don't blur essential report text or place heavy distortion on the entire DOM backdrop.
- Don't replace the licensed hardware with placeholder primitive geometry.
