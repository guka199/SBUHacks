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

`public/models/{desk,room}.glb` contain original architecture and accessories: the ceramic cup, notebook, wool mat, mini computer, oak headphone stand, curtains and window frame. Complete source: `scripts/build-workspace-assets.mjs`. They complement the licensed hardware listed below; the old primitive monitor and keyboard are no longer rendered. Photographic oak maps and original procedural fabric weave are applied at runtime. Keyboard legends are generated in `scripts/build-licensed-keyboard.mjs`.

The social analytics windows are original React/HTML illustrations with authored sample data. They use recognizable platform names and icon shapes for product storytelling; no platform screenshot, source code or account data is included. They are not connected to those platforms.

`public/demo.webm` and `public/demo-poster.svg` are original 24-second typographic sample footage. No third-party footage is included.

## Generated window scenery

`public/textures/alpine-valley.png` was generated with the built-in image generation tool for this project. It is scenery behind actual 3D window geometry, not a screenshot substituting for the room.

Exact generation prompt: “Use case: photorealistic-natural. Asset type: original landscape backdrop texture seen outside the large window of a real-time 3D creator workspace. Create a breathtaking but peaceful Swiss-alpine mountain valley on a clear late-spring morning, layered forested green hills, distant blue-gray alpine peaks with a little snow, a meadow in the lower third, pale powder-blue sky with soft small clouds in the upper half. Wide landscape composition approximately 16:9, eye level from a hillside cabin, no interior, no window frame, no buildings, no people, no text, no logos. Real natural warm sunlight entering from the upper left, gentle haze in the distant mountains, refined cinematic architectural visualization quality, realistic foliage detail and restrained natural colors. Intended as a subtle environment plate behind 3D window mullions. No dramatic sunset, no oversaturation, no fantasy objects.”

`public/textures/workspace-room-v3.jpg` is a browser capture of this project's rendered room, used for mobile/reduced-motion/no-WebGL. It includes the licensed assets listed above.

## Fonts and interaction source

- Instrument Serif and DM Sans are bundled through Fontsource under their OFL licenses, retained in `public/licenses/Instrument-Serif-OFL.txt` and `public/licenses/DM-Sans-OFL.txt`.
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
| Rivet desk, Amazon Berkeley Objects B07B7DL32P | Amazon.com, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [Original GLB](https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/P/B07B7DL32P.glb), also listed by SceneView. Photographic surface textures, scaled/positioned and Meshopt/WebP compressed. |
| Keyboard case and sculpted keycaps | liweihang, MIT | [Keyboard Designer](https://github.com/Hanggesimida/keyboard-designer), pinned revision in manifest. Assembled into 68-key layout, recolored, shared geometry instanced, original legend atlas added and compressed. Full MIT notice retained. |

`public/assets/hardware/sources.json` records exact download URLs, hashes, source sizes and changes. `LICENSES.txt` and `KEYBOARD_LICENSE.txt` travel with these files. The `/credits` page supplies visible attribution, including creators, source links, licenses and changes. Names and product appearances do not imply endorsement. `scripts/fetch-hardware-assets.mjs` reproduces downloads; `build-licensed-keyboard.mjs` assembles the keyboard. Runtime assets are already committed; source downloads are optional.
