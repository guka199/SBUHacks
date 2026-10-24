import { test } from "node:test";
import assert from "node:assert/strict";
import { screenTransform, applyProjection } from "../src/lib/projection";
import { entryProgress } from "../src/lib/experience";
function project(m: number[], x: number, y: number) {
  const w = m[3] * x + m[7] * y + m[15];
  return {
    x: (m[0] * x + m[4] * y + m[12]) / w,
    y: (m[1] * x + m[5] * y + m[13]) / w,
  };
}
test("monitor homography maps all four corners with perspective", () => {
  for (const quad of [
    [
      { x: 80, y: 40 },
      { x: 880, y: 40 },
      { x: 880, y: 490 },
      { x: 80, y: 490 },
    ],
    [
      { x: 92, y: 83 },
      { x: 1102, y: 106 },
      { x: 1054, y: 706 },
      { x: 120, y: 660 },
    ],
    [
      { x: -150, y: -70 },
      { x: 1680, y: 20 },
      { x: 1590, y: 1080 },
      { x: -40, y: 1000 },
    ],
  ]) {
    const matrix = screenTransform(quad, 960, 540)!;
    [
      [0, 0],
      [960, 0],
      [960, 540],
      [0, 540],
    ].forEach(([x, y], i) => {
      const p = project(matrix, x, y);
      assert.ok(Math.abs(p.x - quad[i].x) < 0.00001);
      assert.ok(Math.abs(p.y - quad[i].y) < 0.00001);
    });
  }
  assert.equal(screenTransform(Array(4).fill({ x: 0, y: 0 }), 960, 540), null);
});
test("entering and reversing restores monitor transform and interaction gating", () => {
  const attributes: Record<string, string> = {};
  const element = {
    style: {} as Record<string, string>,
    inert: true,
    setAttribute: (k: string, v: string) => (attributes[k] = v),
  };
  const quad = [
    { x: 150, y: 200 },
    { x: 1050, y: 200 },
    { x: 1050, y: 706 },
    { x: 150, y: 706 },
  ];
  const apply = (p: number) =>
    applyProjection(
      element as unknown as HTMLDivElement,
      quad,
      { width: 1440, height: 900 },
      p,
    );
  apply(0.5);
  const original = element.style.transform;
  assert.equal(element.inert, true);
  apply(1);
  assert.equal(element.style.width, "1440px");
  assert.equal(element.style.height, "900px");
  assert.equal(element.inert, false);
  assert.equal(attributes["aria-hidden"], "false");
  const matrix = element.style.transform.slice(9, -1).split(",").map(Number);
  assert.deepEqual(project(matrix, 1440, 900), { x: 1440, y: 900 });
  apply(0.5);
  assert.equal(element.style.transform, original);
  assert.equal(element.inert, true);
  assert.equal(element.style.pointerEvents, "none");
  assert.equal(entryProgress(-1), 0);
  assert.equal(entryProgress(2), 1);
});
