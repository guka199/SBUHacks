import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ideasApi,
  localDate,
  sourceLink,
  type IdeaSource,
} from "../src/lib/ideas";

const source: IdeaSource = {
  id: "post:youtube:abcdefghijk",
  kind: "published_post",
  platform: "youtube",
  format: "video",
  title: "Piano practice",
  text: "Piano practice",
  summary: "",
  review_notes: [],
  review_kind: "none",
  published_at: null,
  updated_at: null,
  age_days: 20,
  views: 100,
  likes: 5,
  comments: 2,
  shares: null,
  relative_views: null,
  comparison_count: null,
  comparison_median_views: null,
  comparison_label: null,
  url: null,
};

test("source links accept only known reports and YouTube video links", () => {
  for (const url of [
    "javascript:alert(1)",
    "//attacker.invalid",
    "/analysis/../../settings",
    "https://attacker.invalid/?video=abcdefghijk",
  ])
    assert.equal(sourceLink({ ...source, url }), null);
  assert.equal(
    sourceLink({ ...source, url: "/analysis/" + "a".repeat(32) }),
    "/analysis/" + "a".repeat(32),
  );
  assert.equal(
    sourceLink({
      ...source,
      url: "https://www.youtube.com/watch?v=abcdefghijk",
    }),
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
});

test("context fetch uses the session cookie and never selects a client user ID", async () => {
  const previous = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({
      creator: {
        display_name: "Piano teacher",
        account_type: "creator",
        niche: "Piano",
      },
      target_platform: "youtube",
      accounts: [],
      sources: [source],
      published_posts: 1,
      draft_reviews: 0,
      distinct_content: 1,
      history_status: "insufficient",
      can_generate: false,
      last_updated: null,
      collected_at: "2026-10-24T00:00:00Z",
      warnings: [],
    });
  };
  try {
    const result = await ideasApi.context(
      "youtube",
      new AbortController().signal,
    );
    assert.equal(result.can_generate, false);
    assert.ok(calls[0].url.endsWith("/ideas/context?platform=youtube"));
    assert.equal(calls[0].init?.credentials, "include");
    assert.equal(calls[0].init?.cache, "no-store");
    assert.ok(!calls[0].url.includes("user_id"));
  } finally {
    globalThis.fetch = previous;
  }
});

test("generation surfaces server errors instead of supplying fixture ideas", async () => {
  const previous = globalThis.fetch;
  let body = "";
  globalThis.fetch = async (_url, init) => {
    body = String(init?.body);
    return Response.json({ detail: "Add more history" }, { status: 422 });
  };
  try {
    await assert.rejects(
      () => ideasApi.generate("youtube", 3, new AbortController().signal),
      /Add more history/,
    );
    assert.deepEqual(JSON.parse(body), { platform: "youtube", count: 3 });
  } finally {
    globalThis.fetch = previous;
  }
});

test("stored timestamps handle UTC, explicit offsets, and missing dates", () => {
  assert.equal(localDate(null), "Unknown");
  assert.equal(localDate("not-a-date"), "Unknown");
  assert.equal(
    localDate("2026-10-24 00:00:00"),
    localDate("2026-10-24T00:00:00Z"),
  );
  assert.equal(
    localDate("2026-10-24T01:00:00+01:00"),
    localDate("2026-10-24T00:00:00Z"),
  );
});
