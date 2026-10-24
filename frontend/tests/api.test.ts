import assert from "node:assert/strict";
import { test } from "node:test";
import { analysisApi, delay, waitForAnalysis } from "../src/lib/api";
import { makeDemoResult } from "../src/lib/demo";

test("live read and rewrite use encoded IDs and the documented JSON body", async () => {
  const original = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  const result = makeDemoResult();
  result.mode = "live";
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(
      String(url).endsWith("/rewrite")
        ? { suggestions: result.platforms[0].suggestions }
        : {
            id: "abc",
            status: "complete",
            progress: 100,
            stage: "Done",
            result,
          },
    );
  };
  try {
    const signal = new AbortController().signal;
    const job = await analysisApi.get("a/b", signal);
    assert.equal(job.result?.mode, "live");
    await analysisApi.rewrite(
      "a/b",
      { platform: "tiktok", tone: "direct" },
      signal,
    );
    assert.ok(calls[0].url.endsWith("/api/analyses/a%2Fb"));
    assert.ok(calls[1].url.endsWith("/api/analyses/a%2Fb/rewrite"));
    assert.equal(calls[1].init?.body, '{"platform":"tiktok","tone":"direct"}');
  } finally {
    globalThis.fetch = original;
  }
});
test("failed HTTP and malformed responses surface errors", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(
      () => analysisApi.get("x", new AbortController().signal),
      /503/,
    );
    globalThis.fetch = async () =>
      Response.json({ id: "x", status: "complete" });
    await assert.rejects(() =>
      analysisApi.get("x", new AbortController().signal),
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("finished and failed jobs settle immediately; cancellation stops a waiting poll", async () => {
  const result = makeDemoResult();
  const signal = new AbortController().signal;
  assert.equal(
    await waitForAnalysis(
      { id: "demo", status: "complete", progress: 100, stage: "Done", result },
      signal,
      () => {},
    ),
    result,
  );
  await assert.rejects(
    () =>
      waitForAnalysis(
        {
          id: "demo",
          status: "failed",
          progress: 10,
          stage: "Stopped",
          error: "Unsupported codec",
        },
        signal,
        () => {},
      ),
    /Unsupported codec/,
  );
  const controller = new AbortController();
  const pending = waitForAnalysis(
    { id: "demo", status: "processing", progress: 10, stage: "Hook" },
    controller.signal,
    () => {},
  );
  controller.abort();
  await assert.rejects(() => pending, { name: "AbortError" });
  await assert.rejects(() => delay(1000, controller.signal), {
    name: "AbortError",
  });
});
