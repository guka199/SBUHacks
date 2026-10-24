import { entryProgress } from "./experience";
export interface Point {
  x: number;
  y: number;
}
export function screenTransform(
  points: Point[],
  width: number,
  height: number,
) {
  const [p0, p1, p2, p3] = points;
  const dx1 = p1.x - p2.x,
    dx2 = p3.x - p2.x,
    dy1 = p1.y - p2.y,
    dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x,
    sy = p0.y - p1.y + p2.y - p3.y,
    den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-8) return null;
  const g = (sx * dy2 - dx2 * sy) / den,
    h = (dx1 * sy - sx * dy1) / den;
  return [
    (p1.x - p0.x + g * p1.x) / width,
    (p1.y - p0.y + g * p1.y) / width,
    0,
    g / width,
    (p3.x - p0.x + h * p3.x) / height,
    (p3.y - p0.y + h * p3.y) / height,
    0,
    h / height,
    0,
    0,
    1,
    0,
    p0.x,
    p0.y,
    0,
    1,
  ];
}
export function applyProjection(
  element: HTMLDivElement,
  points: Point[],
  viewport: { width: number; height: number },
  progress: number,
  logical = { width: 960, height: 540 },
) {
  const entry = entryProgress(progress);
  const target = [
    { x: 0, y: 0 },
    { x: viewport.width, y: 0 },
    { x: viewport.width, y: viewport.height },
    { x: 0, y: viewport.height },
  ];
  const quad = points.map((p, i) => ({
    x: p.x + (target[i].x - p.x) * entry,
    y: p.y + (target[i].y - p.y) * entry,
  }));
  const width = logical.width + (viewport.width - logical.width) * entry,
    height = logical.height + (viewport.height - logical.height) * entry;
  const matrix = screenTransform(quad, width, height);
  if (!matrix) return;
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  element.style.transform = `matrix3d(${matrix.join(",")})`;
  element.style.opacity = "1";
  element.style.pointerEvents = entry > 0.98 ? "auto" : "none";
  element.inert = entry < 0.98;
  element.setAttribute("aria-hidden", entry > 0.98 ? "false" : "true");
}
