import assert from "node:assert/strict";
import test from "node:test";
import {
  audiencePlot,
  engagementRate,
  growth,
  interactionCount,
  niceMax,
  publicationPlot,
  rankContent,
  safeUrl,
  selectPosts,
  sumKnown,
  timestamp,
  youtubePreview,
  type AnalyticsBundle,
  type ContentRecord,
} from "../src/lib/dashboard-analytics";

// Synthetic fixtures only. No test metrics are used by the application.
const now = Date.parse("2026-10-25T12:00:00Z");
const post = (patch: Partial<ContentRecord> = {}): ContentRecord => ({
  id: "a",
  platform: "youtube",
  account: "yt:one",
  caption: "Synthetic test post",
  format: "video",
  publishedAt: "2026-10-01T00:00:00Z",
  observedAt: "2026-10-24T00:00:00Z",
  url: null,
  thumbnail: null,
  views: 100,
  likes: 8,
  comments: 2,
  shares: null,
  ...patch,
});
const peers = [
  post({ id: "a" }),
  post({ id: "b", likes: 18 }),
  post({ id: "c", likes: 38 }),
];
const bundle = (history: AnalyticsBundle["history"] = {}): AnalyticsBundle => ({
  overview: {
    platforms: [],
    weekly: [],
    topPosts: [],
    draftScores: [],
    takeaways: [],
  },
  accounts: [
    {
      platform: "youtube",
      connection: "api",
      handle: "synthetic",
      external_id: null,
      display_name: null,
      profile_url: null,
      followers: 0,
      following: null,
      total_posts: null,
      avg_views: null,
      typical_views: null,
      avg_likes: null,
      avg_comments: null,
      avg_shares: null,
      engagement_rate: null,
      posts_per_week: null,
      audience: {},
      extra: {},
      updated_at: null,
    },
  ],
  posts: [],
  history,
  links: [],
  providers: null,
  issues: [],
  loadedAt: new Date(now).toISOString(),
});

test("unknown totals remain unknown and recorded zero remains zero", () => {
  assert.equal(sumKnown([null, undefined]), null);
  assert.equal(sumKnown([null, 0]), 0);
  assert.equal(sumKnown([NaN, -5, Infinity]), null);
  assert.equal(interactionCount(post({ likes: 0, comments: 0 })), 0);
  assert.equal(interactionCount(post({ comments: null })), null);
  assert.equal(engagementRate(post({ views: 0 })), null);
});
test("date parsing treats Snowflake naive timestamps as UTC and filters future posts", () => {
  assert.equal(
    timestamp("2026-10-01 03:04:05"),
    Date.parse("2026-10-01T03:04:05Z"),
  );
  assert.equal(timestamp("bad date"), null);
  const rows = [
    post(),
    post({ id: "old", publishedAt: "2026-01-01T00:00:00Z" }),
    post({ id: "unknown", publishedAt: null }),
    post({ id: "future", publishedAt: "2027-01-01T00:00:00Z" }),
  ];
  assert.deepEqual(
    selectPosts(rows, "all", "30", now).map((p) => p.id),
    ["a"],
  );
  assert.deepEqual(
    selectPosts(rows, "all", "all", now).map((p) => p.id),
    ["a", "old", "unknown"],
  );
  assert.equal(selectPosts(rows, "instagram", "all", now).length, 0);
});
test("LinkedIn impressions are never substituted for views or view engagement", () => {
  const linked = post({ platform: "linkedin", views: 1000000 });
  assert.equal(engagementRate(linked), null);
  assert.equal(rankContent([linked], [linked], "views").length, 0);
  assert.equal(rankContent([linked], [linked], "likes")[0].rankValue, 8);
  assert.equal(
    publicationPlot([linked], "all", "all", "views", now).series.length,
    0,
  );
  assert.equal(
    publicationPlot([linked], "all", "all", "engagement", now).series[0]
      .points[0]?.value,
    10,
  );
});
test("response lift uses a stable same-account cohort with three complete peers", () => {
  const ranked = rankContent(peers, peers, "lift");
  assert.deepEqual(
    ranked.map((p) => [p.id, p.rankValue]),
    [
      ["c", 2],
      ["b", 1],
      ["a", 0.5],
    ],
  );
  assert.equal(rankContent(peers, [peers[2]], "lift")[0].rankValue, 2);
  assert.equal(
    rankContent(peers.slice(0, 2), peers.slice(0, 2), "lift").length,
    0,
  );
  const zero = peers.map((p) => ({ ...p, likes: 0, comments: 0 }));
  assert.equal(rankContent(zero, zero, "lift").length, 0);
});
test("lift cannot borrow unrelated platforms, accounts, formats or capture-age cohorts", () => {
  for (const patch of [
    { platform: "instagram" as const },
    { account: "other" },
    { format: "short" },
    { observedAt: "2026-10-02T00:00:00Z" },
    { observedAt: null },
    { observedAt: "2026-09-30T00:00:00Z" },
  ]) {
    const rows = [peers[0], peers[1], { ...peers[2], ...patch }];
    assert.equal(rankContent(rows, rows, "lift").length, 0);
  }
});
test("publication plot uses median lifetime counters, with real gaps and recorded zero", () => {
  const rows = [
    post({ publishedAt: "2026-10-01T00:00:00Z", views: 0 }),
    post({ id: "b", publishedAt: "2026-10-15T00:00:00Z", views: 100 }),
    post({ id: "c", publishedAt: "2026-10-16T00:00:00Z", views: 300 }),
  ];
  const plot = publicationPlot(rows, "all", "all", "views", now);
  assert.equal(plot.cadence, "week");
  assert.deepEqual(plot.series[0].points, [
    { value: 0, count: 1 },
    null,
    { value: 200, count: 2 },
  ]);
  assert.equal(plot.snapshot, false);
  const engagement = publicationPlot(
    [post({ likes: 1, comments: null })],
    "all",
    "30",
    "engagement",
    now,
  );
  assert.equal(engagement.series.length, 0);
});
test("growth requires distinct actual collection dates and permits negative change", () => {
  const history = [
    { at: "2026-10-01T00:00:00Z", followers: 100 },
    { at: "2026-10-24T00:00:00Z", followers: 80 },
  ];
  assert.deepEqual(growth(history, "30", now), {
    delta: -20,
    since: history[0].at,
    through: history[1].at,
  });
  assert.equal(growth([history[0]], "all", now), null);
  assert.equal(growth([history[0], history[0]], "all", now), null);
  assert.equal(
    growth([{ ...history[0], followers: null }, history[1]], "all", now),
    null,
  );
});
test("audience chart uses current bars without history and actual timestamps with history", () => {
  const current = audiencePlot(bundle(), "all", "all", now);
  assert.equal(current.audienceBars, true);
  assert.equal(current.series[0].points[0]?.value, 0);
  const captured = audiencePlot(
    bundle({
      youtube: [
        { at: "2026-10-01T00:00:00Z", followers: 12 },
        { at: "2026-10-24T00:00:00Z", followers: 15 },
      ],
    }),
    "all",
    "all",
    now,
  );
  assert.equal(captured.audienceBars, false);
  assert.equal(captured.times.length, 2);
  assert.equal(captured.series[0].points[1]?.value, 15);
});
test("count axes have integer zero-based ticks and room above the largest point", () => {
  for (const value of [0, 1, 3, 6, 11, 16, 31, 1234, 1000000]) {
    assert.ok(niceMax(value) > value);
    assert.equal(Number.isInteger(niceMax(value) / 4), true);
  }
});
test("only safe external URLs and verified YouTube IDs produce previews", () => {
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("https://user:password@example.com"), null);
  assert.equal(
    youtubePreview("https://youtube.com/watch?v=abcdefghijk"),
    "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
  );
  assert.equal(youtubePreview("https://example.com/watch?v=abcdefghijk"), null);
});
