import assert from "node:assert/strict";
import test from "node:test";
import { makeDemoResult } from "../src/lib/demo";
import { collectReview, thumbnailLeaders } from "../src/lib/review";

test("consolidation preserves different fixes and later moments", () => {
  const result = makeDemoResult();
  const moment = {
    id: "one",
    time: 0,
    end: 2,
    kind: "improve" as const,
    title: "Cut intro",
    detail: "The intro delays the payoff.",
    fix: "Show the result first.",
  };
  result.observations = [
    moment,
    { ...moment, id: "duplicate" },
    { ...moment, id: "distinct", fix: "Add readable captions." },
    { ...moment, id: "later", time: 3, end: 5 },
  ];
  result.overallSuggestions = [
    "Show the result first!",
    "Keep voice levels consistent.",
    "Keep voice levels consistent!",
    "Make the final CTA specific.",
  ];
  const review = collectReview(result);
  assert.equal(review.moments.length, 3);
  assert.equal(review.moments[1].fix, "Add readable captions.");
  assert.deepEqual(review.overall, [
    "Keep voice levels consistent.",
    "Make the final CTA specific.",
  ]);
  assert.equal(result.observations.length, 4);
});

test("whole-video fallback retains all distinct findings", () => {
  const result = makeDemoResult();
  result.platforms[0].opportunities = Array.from(
    { length: 8 },
    (_, i) => `Distinct recommendation ${i}`,
  );
  assert.equal(
    collectReview(result).overall.filter((s) => s.startsWith("Distinct"))
      .length,
    8,
  );
});

test("thumbnail leaders preserve ties and ignore unknown scores", () => {
  const items = [0, 1, 2].map((index) => ({
    index,
    name: "test",
    mimeType: "image/png",
    width: 100,
    height: 100,
    scores: index === 0 ? {} : { tiktok: 80, instagram: 90 },
    reasons: {},
    strengths: [],
    improvements: [],
  }));
  assert.deepEqual(
    thumbnailLeaders({ items, summary: "Test", picks: [] }),
    [1, 2],
  );
});

test("opening evidence overlapping a finding and timed whole-video edits are not repeated", () => {
  const result = makeDemoResult();
  result.observations = [
    {
      id: "dead-air",
      time: 3,
      end: 8,
      kind: "pacing",
      title: "Dead air",
      detail: "Blank screen.",
      fix: "",
    },
  ];
  result.hookAnalysis = {
    ...(result.hookAnalysis ?? {}),
    evidence: [
      {
        start: 3,
        end: 5,
        observation: "Cuts to an empty screen.",
        edit: "Cut the dead space.",
      },
      {
        start: 0,
        end: 1,
        observation: "Static title card.",
        edit: "Open on motion.",
      },
    ],
  } as NonNullable<typeof result.hookAnalysis>;
  result.overallSuggestions = [
    "Cut the blank screen between 00:03 and 00:08 entirely.",
    "Add background music.",
  ];
  const review = collectReview(result);
  assert.deepEqual(
    review.moments.map((m) => [m.time, m.end]),
    [
      [0, 1],
      [3, 8],
    ],
  );
  assert.equal(review.moments[1].fix, "Cut the dead space."); // folded in
  assert.equal(result.observations[0].fix, ""); // input untouched
  assert.deepEqual(review.overall, ["Add background music."]);
});
