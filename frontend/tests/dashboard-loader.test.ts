import assert from "node:assert/strict";
import test from "node:test";
import {
  loadAnalytics,
  canUpdate,
  updateAccount,
} from "../src/lib/dashboard-loader";
import type { Account } from "../src/lib/account-api";

// Explicit synthetic API fixtures; no backend or provider calls.
const account: Account = {
  platform: "youtube",
  connection: "api",
  handle: "synthetic",
  external_id: "test",
  display_name: "Synthetic",
  profile_url: null,
  followers: 100,
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
  updated_at: "2026-10-24T00:00:00Z",
};
const overview = {
  platforms: [],
  weekly: [],
  topPosts: [],
  draftScores: [],
  takeaways: [],
};
const contextSource = {
  id: "post:youtube:test",
  kind: "published_post",
  platform: "youtube",
  format: "video",
  title: "Synthetic",
  text: "Synthetic test post",
  published_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-24T00:00:00Z",
  views: 100,
  likes: 0,
  comments: 0,
  shares: null,
  url: "https://youtube.com/watch?v=abcdefghijk",
};
function fixtures(overrides: Record<string, unknown> = {}) {
  return {
    "/api/dashboard": overview,
    "/accounts": [account],
    "/ideas/context": {
      sources: [
        contextSource,
        { ...contextSource, id: "draft", kind: "analyzed_draft" },
      ],
    },
    "/accounts/imports": [],
    "/accounts/providers/status": {
      configured: { YOUTUBE_API_KEY: true },
      worker_enabled: false,
    },
    ...overrides,
  };
}
async function withApi<T>(
  data: Record<string, unknown>,
  run: (calls: { path: string; init?: RequestInit }[]) => Promise<T>,
) {
  const original = globalThis.fetch;
  const calls: { path: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    const path = String(url).replace(/^.*\/backend/, "");
    calls.push({ path, init });
    const value = data[path];
    if (value instanceof Error) throw value;
    return value instanceof Response
      ? value
      : Response.json(value ?? { detail: "Missing fixture" }, {
          status: value == null ? 404 : 200,
        });
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}
test("dashboard reads only published owner-scoped data and never starts provider collection", async () => {
  await withApi(fixtures(), async (calls) => {
    const result = await loadAnalytics(new AbortController().signal);
    assert.equal(result.posts.length, 1);
    assert.equal(result.posts[0].likes, 0);
    assert.equal(
      result.posts[0].thumbnail,
      "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
    );
    assert.ok(
      calls.every(
        (call) =>
          !call.init?.method &&
          call.init?.credentials === "include" &&
          call.init?.cache === "no-store",
      ),
    );
    assert.equal(canUpdate(account, result), true);
    assert.equal(
      canUpdate({ ...account, platform: "linkedin" }, result),
      false,
    );
  });
});
test("all four connected platforms contribute real nullable posts and snapshots deduplicate", async () => {
  const platforms = ["youtube", "instagram", "tiktok", "linkedin"] as const;
  await withApi(
    fixtures({
      "/accounts": platforms.map((platform) => ({ ...account, platform })),
      "/ideas/context": {
        sources: platforms.map((platform) => ({
          ...contextSource,
          platform,
          id: `post:${platform}:test`,
          views: platform === "linkedin" ? null : 10,
        })),
      },
      "/accounts/imports": [
        {
          platform: "instagram",
          snapshot_id: "snapshot",
          profile_url: "https://instagram.com/test",
        },
      ],
      "/accounts/instagram/stats": {
        last_updated: "2026-10-24T00:00:00Z",
        followers: 5,
        posts: [
          {
            post_id: "test",
            caption: "New capture",
            views: null,
            likes: 12,
            comments: 1,
            shares: null,
          },
        ],
      },
      "/accounts/instagram/history?limit=20": [
        { last_updated: "2026-10-23T00:00:00Z", followers: 4, posts: [] },
        { last_updated: "2026-10-24T00:00:00Z", followers: 5, posts: [] },
      ],
    }),
    async () => {
      const result = await loadAnalytics(new AbortController().signal);
      assert.equal(result.posts.length, 4);
      assert.equal(
        result.posts.find((p) => p.platform === "instagram")?.caption,
        "New capture",
      );
      assert.equal(
        result.posts.find((p) => p.platform === "instagram")?.views,
        null,
      );
      assert.equal(result.history.instagram?.length, 2);
      assert.equal(
        result.posts.find((p) => p.platform === "linkedin")?.views,
        null,
      );
    },
  );
});
test("optional history failure preserves available results with an honest warning", async () => {
  await withApi(
    fixtures({ "/ideas/context": new Error("offline") }),
    async () => {
      const result = await loadAnalytics(new AbortController().signal);
      assert.equal(result.accounts.length, 1);
      assert.equal(result.posts.length, 0);
      assert.match(result.issues.join(" "), /history could not load/);
    },
  );
});
test("empty accounts stay empty; required errors and expired sessions surface for retry", async () => {
  await withApi(fixtures({ "/accounts": [] }), async () =>
    assert.equal(
      (await loadAnalytics(new AbortController().signal)).accounts.length,
      0,
    ),
  );
  await withApi(fixtures({ "/accounts": new Error("offline") }), async () =>
    assert.rejects(
      loadAnalytics(new AbortController().signal),
      /connected accounts/,
    ),
  );
  await withApi(
    fixtures({ "/ideas/context": Response.json({}, { status: 401 }) }),
    async () =>
      assert.rejects(loadAnalytics(new AbortController().signal), /Sign in/),
  );
});
test("an explicit refresh uses the existing job endpoint and reports failure without retrying a launch", async () => {
  await withApi(
    fixtures({
      "/accounts/instagram/refresh": {
        id: "j",
        status: "failed",
        phase: "Failed",
        progress: 0,
        error: "Synthetic provider failure",
      },
    }),
    async (calls) => {
      await assert.rejects(
        updateAccount(
          { ...account, platform: "instagram" },
          new AbortController().signal,
          () => {},
        ),
        /Synthetic provider failure/,
      );
      assert.equal(calls.length, 1);
      assert.equal(calls[0].init?.method, "POST");
      assert.equal(calls[0].init?.body, "{}");
    },
  );
});
