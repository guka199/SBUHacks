import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resultSchema,
  jobSchema,
  hookAnalysisSchema,
  type HookAnalysis,
} from "../src/lib/contracts";
import { makeDemoResult } from "../src/lib/demo";
import { MAX_VIDEO_BYTES, validateVideo } from "../src/lib/video";

test("demo results honor platform selection and source duration", () => {
  const result = makeDemoResult(
    { name: "short.webm", durationSeconds: 3, width: 360, height: 640 },
    ["instagram", "youtube"],
  );
  assert.equal(resultSchema.safeParse(result).success, true);
  assert.deepEqual(
    result.platforms.map((p) => p.id),
    ["instagram", "youtube"],
  );
  assert.ok(result.observations.every((o) => o.time <= o.end && o.end <= 3));
  assert.equal(result.mode, "demo");
});
test("API contract rejects impossible scores, duplicate platforms, and missing completed results", () => {
  const result = makeDemoResult();
  result.platforms[0].score = 101;
  assert.equal(resultSchema.safeParse(result).success, false);
  const duplicate = makeDemoResult();
  duplicate.platforms.push(duplicate.platforms[0]);
  assert.equal(resultSchema.safeParse(duplicate).success, false);
  assert.equal(
    jobSchema.safeParse({
      id: "x",
      status: "complete",
      progress: 100,
      stage: "Done",
    }).success,
    false,
  );
  const outOfBounds = makeDemoResult();
  outOfBounds.observations[0].end = 999;
  assert.equal(resultSchema.safeParse(outOfBounds).success, false);
});
test("video validation handles empty, oversized, unsupported, and MIME-less browser files", () => {
  assert.equal(
    validateVideo({ name: "clip.mp4", type: "video/mp4", size: 42 }),
    null,
  );
  assert.equal(validateVideo({ name: "clip.MOV", type: "", size: 42 }), null);
  assert.ok(validateVideo({ name: "empty.mp4", type: "video/mp4", size: 0 }));
  assert.ok(
    validateVideo({
      name: "large.mp4",
      type: "video/mp4",
      size: MAX_VIDEO_BYTES + 1,
    }),
  );
  assert.ok(validateVideo({ name: "wrong.txt", type: "video/mp4", size: 42 }));
  assert.ok(validateVideo({ name: "wrong.mp4", type: "text/plain", size: 42 }));
});

const openingReview: HookAnalysis = {
  method: "ai_review",
  windowSeconds: 5,
  score: 60,
  summary: "A pause delays the payoff.",
  opening: "A static title precedes the result.",
  suggestedOpening: "Show the result first.",
  criteria: ["attention", "clarity", "pacing", "audio_text"].map((id) => ({
    id: id as HookAnalysis["criteria"][number]["id"],
    label: id,
    score: id === "audio_text" ? null : 60,
    evidence: "Synthetic fixture observation.",
  })),
  evidence: [
    {
      start: 0,
      end: 2,
      observation: "Static title.",
      edit: "Shorten the title card.",
    },
  ],
};

test("opening contract preserves legacy reports and explicit unavailable ratings", () => {
  assert.equal(resultSchema.safeParse(makeDemoResult()).success, true);
  const report = {
    ...makeDemoResult(),
    mode: "live",
    hookAnalysis: openingReview,
  };
  const parsed = resultSchema.parse(report);
  assert.equal(parsed.hookAnalysis?.method, "ai_review");
  assert.equal(parsed.hookAnalysis?.criteria[3].score, null);
  assert.equal(
    resultSchema.safeParse({ ...report, hookAnalysis: null }).success,
    true,
  );
});

test("opening evidence cannot escape the opening or a short source clip", () => {
  assert.equal(
    hookAnalysisSchema.safeParse({
      ...openingReview,
      evidence: [{ ...openingReview.evidence[0], end: 6 }],
    }).success,
    false,
  );
  assert.equal(
    hookAnalysisSchema.safeParse({
      ...openingReview,
      evidence: [{ ...openingReview.evidence[0], start: 2, end: 1 }],
    }).success,
    false,
  );
  assert.equal(
    hookAnalysisSchema.safeParse({
      ...openingReview,
      criteria: [
        openingReview.criteria[0],
        ...openingReview.criteria.slice(0, 3),
      ],
    }).success,
    false,
  );
  const short = makeDemoResult({
    name: "short.mp4",
    durationSeconds: 2,
    width: 720,
    height: 1280,
  });
  assert.equal(
    resultSchema.safeParse({ ...short, hookAnalysis: openingReview }).success,
    false,
  );
  assert.equal(
    resultSchema.safeParse({
      ...short,
      hookAnalysis: { ...openingReview, windowSeconds: 2 },
    }).success,
    true,
  );
});
