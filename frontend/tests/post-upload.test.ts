import assert from "node:assert/strict";
import test from "node:test";
import { move } from "../src/components/post-upload";

test("reordering moves one photo and keeps the rest in order", () => {
  assert.deepEqual(move(["a", "b", "c", "d"], 3, 0), ["d", "a", "b", "c"]);
  assert.deepEqual(move(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(move(["a", "b"], 1, 1), ["a", "b"]);
});
