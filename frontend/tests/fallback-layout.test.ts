import { test } from "node:test";
import assert from "node:assert/strict";
import { flatScreenLayout } from "../src/lib/fallback-layout";
import { entryProgress } from "../src/lib/experience";

test("lightweight scene and live HTML share the captured monitor corners", () => {
  const source = [
    [714.56172, 298.25829],
    [1325.16211, 289.12389],
    [1304.8187, 670.76954],
    [702.99929, 599.19753],
  ];
  for (const [width, height] of [
    [375, 667],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ]) {
    const { poster, quad } = flatScreenLayout(width, height, 0);
    assert.ok(Math.abs(poster.width / poster.height - 1440 / 900) < 1e-9);
    source.forEach(([x, y], i) => {
      assert.ok(
        Math.abs(quad[i].x - ((x * poster.width) / 1440 + poster.left)) < 1e-6,
      );
      assert.ok(
        Math.abs(quad[i].y - ((y * poster.height) / 900 + poster.top)) < 1e-6,
      );
      assert.ok(quad[i].x >= 0 && quad[i].x <= width);
    });
    if (width < 600) {
      assert.ok(
        Math.min(...quad.map((p) => p.y)) >= 392,
        "screen stays below hero actions",
      );
      assert.ok(
        Math.max(...quad.map((p) => p.y)) < height - 130,
        "screen clears floating controls",
      );
    }
    const middle = flatScreenLayout(width, height, 0.17);
    flatScreenLayout(width, height, 0.9);
    assert.deepEqual(flatScreenLayout(width, height, 0.17), middle);
    const near = flatScreenLayout(width, height, 0.4).quad;
    assert.equal(near[0].y, near[1].y);
    assert.equal(near[0].x, near[3].x);
    assert.ok(
      Math.abs(
        (near[1].x - near[0].x) / (near[3].y - near[0].y) -
          (width < 600 ? 480 / 700 : 16 / 9),
      ) < 1e-9,
    );
  }
});

test("viewport entry is continuous with gentle endpoints in both directions", () => {
  const points = Array.from({ length: 101 }, (_, i) => 0.925 + i * 0.00075);
  const forward = points.map(entryProgress);
  const reverse = [...points].reverse().map(entryProgress).reverse();
  assert.deepEqual(forward, reverse);
  assert.equal(forward[0], 0);
  assert.equal(forward.at(-1), 1);
  for (let i = 1; i < forward.length; i++)
    assert.ok(forward[i] >= forward[i - 1]);
  assert.ok(forward[1] < 0.001);
  assert.ok(1 - forward[99] < 0.001);
});
