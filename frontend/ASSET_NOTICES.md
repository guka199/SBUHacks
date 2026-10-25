# Asset sources and licenses

## Licensed models, PBR textures and environment

The following Poly Haven assets are CC0 1.0 and permit use, modification and redistribution in this project. Full source metadata, original download hashes, author names, dimensions and original byte sizes are in `public/assets/polyhaven/sources.json`. The license notice is kept beside them. Runtime assets are self-hosted; the app makes no live Poly Haven API requests.

| Asset | Author(s) | Source | Shipped use |
| --- | --- | --- | --- |
| Potted Plant 01 | Rico Cilliers | https://polyhaven.com/a/potted_plant_01 | Textured GLB, desk and floor plants |
| Potted Plant 02 | Rico Cilliers | https://polyhaven.com/a/potted_plant_02 | Textured GLB, shelf and desk plants |
| Desk Lamp Arm 01 | Kuutti Siitonen; rig by Yann Kervran | https://polyhaven.com/a/desk_lamp_arm_01 | Textured articulated orange lamp GLB |
| Oak Veneer 01 | Jenelle van Heerden | https://polyhaven.com/a/oak_veneer_01 | 1K color, OpenGL normal and roughness maps |
| Photo Studio Loft Hall | Sergej Majboroda | https://polyhaven.com/a/photo_studio_loft_hall | 1K HDR environment reflections |

License: https://polyhaven.com/license and https://creativecommons.org/publicdomain/zero/1.0/ . Asset preparation uses the documented public API; its terms are linked in the manifest. Poly Haven is credited in the site footer and here.

Transformations: GLTF plus external buffers/images were packed into self-contained GLB files. Geometry uses Meshopt compression; suitable embedded textures were compressed to WebP, while normal maps were retained. Models are repositioned/scaled in the scene; plants receive a subtle group sway. `scripts/fetch-licensed-assets.mjs` reproduces downloads and validates source hashes; `scripts/optimize-assets.mjs` reproduces compression. `public/assets/optimization.json` records original/final sizes. Original download hashes describe the original files, not transformed GLB checksums.

## Original models and interface artwork

`public/models/{desk,room}.glb` contain original architecture and accessories: the ceramic cup, notebook, wool mat, mini computer, oak headphone stand and dark window frame. Complete source: `scripts/build-workspace-assets.mjs`. They complement the licensed hardware listed below; the old primitive monitor and keyboard are no longer rendered. Photographic oak maps and original procedural fabric weave are applied at runtime. Keyboard legends are generated in `scripts/build-licensed-keyboard.mjs`.

The social analytics windows are original React/HTML illustrations with authored sample data. They use recognizable platform names and icon shapes for product storytelling; no platform screenshot, source code or account data is included. They are not connected to those platforms.

`public/demo.webm` and `public/demo-poster.svg` are original 24-second typographic sample footage. No third-party footage is included.

## Outdoor scenery and exact user wallpaper

- Outdoor: public/assets/scenery/meadow.webp derives from [Meadow 2 backplate 15](https://polyhaven.com/a/meadow_2) by **Sergej Majboroda / Poly Haven**, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Resized to2560px/WebP88, used on a subdivided plane with subtle foliage movement. Original URL/hash/author metadata: public/assets/scenery/sources.json. Clouds are original procedural soft-alpha billboards. Former generated alpine plate removed.
- Wallpaper: public/textures/ocean-wallpaper.webp is the exact **user-supplied xxww-KRKW8BKLdrs-unsplash.jpg**, explicitly requested for the monitor. Author/license are not inferred from its filename; it is not described as CC0. Source SHA256 and7008x4672 dimensions remain in the manifest. Changes: ICC-aware sRGB, proportional2560px resize, quality95WebP; no retouching or generated replacement. CSS center-cover preserves horizon/sailboat. Raw original and other reference files are not redistributed. Confirm separate rights for reuse beyond the requested project context.
- public/textures/workspace-room-v7.jpg is a1440x900 browser capture of this actual room with the assets above. Mobile/no-WebGL/reduced-motion fallback; keep desk/headphones attribution with derivatives. Desktop uses live WebGL and HTML analytics.

## Fonts and interaction source

- Archivo Black and DM Sans are bundled through Fontsource under their OFL licenses, retained in `public/licenses/Archivo-Black-OFL.txt` and `public/licenses/DM-Sans-OFL.txt`.
- `src/components/ui/animated-link.tsx` adapts Skiper UI's free Skiper 40 / Link000 interaction from https://skiper-ui.com/r/skiper40.json by @gurvinder-singh02. Its free-use terms require attribution, retained here, in source and in the footer. Modifications add keyboard focus and reduced-motion support.
- Lucide icons use the package's included ISC license. Other dependencies retain their npm package licenses.
- Animmaster was studied for interaction principles; no paid source was copied.
- UI UX Pro Max, Three.js Skills, GSAP Skills, Design DNA, Motion Design, Genjutsu, Taste and Impeccable are local design tooling. Downloaded skill code is ignored and not redistributed here.
- User-supplied reference screenshots and downloaded HTML are inspiration only. None are committed.



## Additional licensed hardware

| Asset | Author / license | Source and modifications |
| --- | --- | --- |
| 27-inch monitor and wireless mouse | Innerscene, CC0 1.0 | [Monitor](https://www.innerscene.com/tools/library/3d-parts/27-inch-monitor-office-technology-961fb20e), [mouse](https://www.innerscene.com/tools/library/3d-parts/wireless-mouse-office-technology-7e0e880d). Scaled, placed and Meshopt compressed; monitor stand material tuned. |
| Sony MDR-7506 headphones | AndreiVNK, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [Original model](https://sketchfab.com/3d-models/sony-mdr-7506-headphones-05735b74d3524f00b648231138122a28), downloaded through [SceneView's attributed catalogue](https://sceneview.github.io/credits.html). Scaled, repositioned, Meshopt/WebP compressed. |
| Rivet desk, Amazon Berkeley Objects B07B7DL32P | Amazon.com, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [Original GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/P/B07B7DL32P.glb), also listed by SceneView. Photographic surface textures, scaled/positioned and Meshopt/WebP compressed; runtime graphite treatment preserves grain. |
| Keyboard case and sculpted keycaps | liweihang, MIT | [Keyboard Designer](https://github.com/Hanggesimida/keyboard-designer), pinned revision in manifest. Assembled into 68-key layout, recolored, shared geometry instanced, original legend atlas added and compressed. Full MIT notice retained. |

`public/assets/hardware/sources.json` records exact download URLs, hashes, source sizes and changes. `LICENSES.txt` and `KEYBOARD_LICENSE.txt` travel with these files. The `/credits` page supplies visible attribution, including creators, source links, licenses and changes. Names and product appearances do not imply endorsement. `scripts/fetch-hardware-assets.mjs` reproduces downloads; `build-licensed-keyboard.mjs` assembles the keyboard. Runtime assets are already committed; source downloads are optional.


## Supplied ViralPilot logo (October 25, 2026)

Source: user-supplied viralpilot_logo_assets.zip. The wordmark and light dragon
icon are raster screenshot crops, used at the user's direction for this project.
No third-party open license or original vector master was provided; do not
represent these as CC0, vector artwork, or a reusable asset library.
Only logo_horizontal_transparent.png and icon_light.png were included as
lossless WebP derivatives in public/brand (about 156 KiB combined). Native app
icons are proportion-preserving PNG resizes with cream padding. No repainting
or vector tracing. The standalone symbol crop contains text fragments and the
dark icon contains an upload badge, so neither is shipped. The wordmark uses
multiply blending on existing light surfaces to soften screenshot edge pixels.
For dark surfaces or large-format use, obtain original transparent/vector art.


## Authentication dragon (user-supplied, October 25, 2026)

The supplied viralpilot_parallax_layers.zip provides the flattened illustration
and approximate aligned masks. Lossless WebP exports plus a uniformly resized
mobile reference are used under public/art/auth-dragon/. Artist attribution and
a separate redistribution license were not provided; no CC/third-party license
is asserted. ASSET_SOURCE.txt and manifest.json preserve provenance and hashes.
The companion logo pack was inspected without replacing the existing site logo.
No source archive, unused logo crop, generated/repainted eye, or QA screenshot is
included in the public assets.
