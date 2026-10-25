import assert from "node:assert/strict";
import test from "node:test";
import { analysisApi } from "../src/lib/api";

test("report removal uses the session and encoded DELETE endpoint", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.ok(String(url).endsWith("/api/analyses/report%2Fid"));
    assert.equal(init?.method, "DELETE");
    assert.equal(init?.credentials, "include");
    assert.equal(init?.cache, "no-store");
    return Response.json({ ok: true });
  };
  try {
    assert.deepEqual(
      await analysisApi.remove("report/id", new AbortController().signal),
      {},
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("failed or unconfirmed deletion rejects; already-missing reports and cleanup warnings are explicit", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json({ detail: "Storage unavailable" }, { status: 503 });
    await assert.rejects(
      analysisApi.remove("id", new AbortController().signal),
      /Storage unavailable/,
    );
    globalThis.fetch = async () => Response.json({});
    await assert.rejects(
      analysisApi.remove("id", new AbortController().signal),
      /did not confirm/,
    );
    globalThis.fetch = async () =>
      Response.json({ detail: "Not found" }, { status: 404 });
    assert.deepEqual(
      await analysisApi.remove("id", new AbortController().signal),
      {},
    );
    globalThis.fetch = async () =>
      Response.json({ ok: true, warning: "Report deleted; cleanup failed." });
    assert.deepEqual(
      await analysisApi.remove("id", new AbortController().signal),
      { warning: "Report deleted; cleanup failed." },
    );
  } finally {
    globalThis.fetch = original;
  }
});
