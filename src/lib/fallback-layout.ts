import type { Point } from "./projection";
// Measured screen vertices in the 1440x900 browser capture used by the lightweight fallback.
const capturedScreen: Point[] = [
  { x: 714.56172, y: 298.25829 },
  { x: 1325.16211, y: 289.12389 },
  { x: 1304.8187, y: 670.76954 },
  { x: 702.99929, y: 599.19753 },
];
export function flatScreenLayout(
  width: number,
  height: number,
  progress: number,
  openingFloor = 392,
) {
  const minX = 702.99929,
    minY = 289.12389,
    spanX = 1325.16211 - minX;
  const top = width < 900 ? Math.max(height * 0.5, openingFloor) : height * 0.3;
  const initialWidth =
    width < 900
      ? Math.min(width - 28, Math.max(200, (height - 142 - top) / 0.62))
      : width * 0.43;
  const scale = initialWidth / spanX,
    left = width < 900 ? (width - initialWidth) / 2 : width * 0.5;
  const poster = {
    width: 1440 * scale,
    height: 900 * scale,
    left: left - minX * scale,
    top: top - minY * scale,
  };
  const start = capturedScreen.map((p) => ({
    x: p.x * scale + poster.left,
    y: p.y * scale + poster.top,
  }));
  // Once the glass clears, give phone demonstrations a readable portrait layout.
  // The desktop and its wallpaper keep the photographed aspect ratio.
  const portraitT =
    width < 600 ? Math.min(1, Math.max(0, (progress - 0.29) / 0.04)) : 0;
  const portrait = portraitT * portraitT * (3 - 2 * portraitT);
  const fullWidth = width - (width < 600 ? 28 : 48),
    phoneWidth = Math.min(
      fullWidth,
      Math.max(240, ((height * 0.86 - 110) * 480) / 700),
    ),
    endWidth = fullWidth + (phoneWidth - fullWidth) * portrait,
    endLeft = (width - endWidth) / 2,
    endTop = height * (width < 600 ? 0.3 - 0.16 * portrait : 0.2),
    endHeight = endWidth * (0.5625 + (700 / 480 - 0.5625) * portrait);
  const end = [
    { x: endLeft, y: endTop },
    { x: endLeft + endWidth, y: endTop },
    { x: endLeft + endWidth, y: endTop + endHeight },
    { x: endLeft, y: endTop + endHeight },
  ];
  const t = Math.min(1, Math.max(0, progress / 0.3)),
    blend = t * t * (3 - 2 * t);
  return {
    poster,
    logical: { width: 960 - 480 * portrait, height: 540 + 160 * portrait },
    quad: start.map((p, i) => ({
      x: p.x + (end[i].x - p.x) * blend,
      y: p.y + (end[i].y - p.y) * blend,
    })),
  };
}
