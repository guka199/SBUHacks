import assert from "node:assert/strict";
import { test } from "node:test";
import { resultSchema, jobSchema } from "../src/lib/contracts";
import { makeDemoResult } from "../src/lib/demo";
import { MAX_VIDEO_BYTES, validateVideo } from "../src/lib/video";

test("demo results honor platform selection and source duration", () => {
  const result = makeDemoResult({ name: "short.webm", durationSeconds: 3, width: 360, height: 640 }, ["instagram", "youtube"]);
  assert.equal(resultSchema.safeParse(result).success, true);
  assert.deepEqual(result.platforms.map(p => p.id), ["instagram", "youtube"]);
  assert.ok(result.observations.every(o => o.time <= o.end && o.end <= 3));
  assert.equal(result.mode, "demo");
});
test("API contract rejects impossible scores, duplicate platforms, and missing completed results", () => {
  const result = makeDemoResult();
  result.platforms[0].score = 101;
  assert.equal(resultSchema.safeParse(result).success, false);
  const duplicate = makeDemoResult(); duplicate.platforms.push(duplicate.platforms[0]);
  assert.equal(resultSchema.safeParse(duplicate).success, false);
  assert.equal(jobSchema.safeParse({ id: "x", status: "complete", progress: 100, stage: "Done" }).success, false);
  const outOfBounds = makeDemoResult(); outOfBounds.observations[0].end = 999;
  assert.equal(resultSchema.safeParse(outOfBounds).success, false);
});
test("video validation handles empty, oversized, unsupported, and MIME-less browser files", () => {
  assert.equal(validateVideo({ name: "clip.mp4", type: "video/mp4", size: 42 }), null);
  assert.equal(validateVideo({ name: "clip.MOV", type: "", size: 42 }), null);
  assert.ok(validateVideo({ name: "empty.mp4", type: "video/mp4", size: 0 }));
  assert.ok(validateVideo({ name: "large.mp4", type: "video/mp4", size: MAX_VIDEO_BYTES + 1 }));
  assert.ok(validateVideo({ name: "wrong.txt", type: "video/mp4", size: 42 }));
  assert.ok(validateVideo({ name: "wrong.mp4", type: "text/plain", size: 42 }));
});
