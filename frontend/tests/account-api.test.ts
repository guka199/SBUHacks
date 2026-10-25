import assert from "node:assert/strict";
import test from "node:test";
import { profileUrl } from "../src/lib/account-api";

test("handles and pasted links become the canonical public profile URL", () => {
  assert.equal(
    profileUrl("tiktok", "@coldbrew.lab"),
    "https://www.tiktok.com/@coldbrew.lab",
  );
  assert.equal(
    profileUrl("tiktok", " coldbrew_lab "),
    "https://www.tiktok.com/@coldbrew_lab",
  );
  assert.equal(
    profileUrl("tiktok", "https://www.tiktok.com/@coldbrew_lab?lang=en"),
    "https://www.tiktok.com/@coldbrew_lab",
  );
  assert.equal(
    profileUrl("instagram", "@coldbrew.lab"),
    "https://www.instagram.com/coldbrew.lab",
  );
  assert.equal(
    profileUrl("instagram", "instagram.com/coldbrew.lab/"),
    "https://www.instagram.com/coldbrew.lab",
  );
});

test("invalid handles are rejected before any request", () => {
  assert.throws(() => profileUrl("tiktok", "two words"), /valid TikTok handle/);
  assert.throws(
    () => profileUrl("instagram", "@" + "a".repeat(31)),
    /valid Instagram handle/,
  );
  assert.throws(() => profileUrl("instagram", ""), /valid Instagram handle/);
});
