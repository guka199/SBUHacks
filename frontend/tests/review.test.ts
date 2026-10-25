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
