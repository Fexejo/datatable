import { test } from "node:test";
import assert from "node:assert/strict";
import { firstStickyPin } from "../../src/ui/pinnedLayout.js";

test("firstStickyPin keeps the most recent pins that fit", () => {
    assert.equal(firstStickyPin([100, 100, 100], 400), 0, "all fit");
    assert.equal(firstStickyPin([100, 100, 100], 250), 1, "oldest pin pauses");
    assert.equal(firstStickyPin([100, 300], 250), 2, "newest pin too wide: none sticky");
    assert.equal(firstStickyPin([], 100), 0);
});
