import assert from "node:assert/strict";
import test from "node:test";
import { compact, sparkline } from "../src/lib/dashboard";

test("numbers are shortened and missing values shown as a dash", () => {
  assert.equal(compact(522250), "522.3K");
  assert.equal(compact(2657217), "2.7M");
  assert.equal(compact(null), "—");
});

test("trend line spans the box and needs two points", () => {
  assert.equal(sparkline([5]), "");
  const points = sparkline([10, 30, 20], 120, 32).split(" ");
  assert.equal(points.length, 3);
  assert.equal(points[0], "0.0,30.0"); // lowest value at the bottom
  assert.equal(points[1], "60.0,2.0"); // highest at the top
});
