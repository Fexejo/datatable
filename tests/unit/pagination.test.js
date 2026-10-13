import { test } from "node:test";
import assert from "node:assert/strict";
import {
    DEFAULT_PAGE_SIZES, exceedsCellLimit, pageCount, pageItems, pageRange, pageSizeChoices, paginate
} from "../../src/core/pagination.js";

test("pageCount has at least one page", () => {
    assert.equal(pageCount(0, 10), 1);
    assert.equal(pageCount(21, 10), 3);
});

test("pageRange is 1-based and clipped to the total", () => {
    assert.deepEqual(pageRange(3, 10, 25), { start: 21, end: 25, total: 25 });
    assert.deepEqual(pageRange(1, 10, 0), { start: 0, end: 0, total: 0 });
});

test("paginate clamps the page", () => {
    const rows = Array.from({ length: 25 }, (_, i) => i);
    assert.deepEqual(paginate(rows, 9, 10), { page: 3, pageCount: 3, rows: [20, 21, 22, 23, 24] });
    assert.equal(paginate(rows, 0, 10).page, 1);
});

test("pageItems shows neighbours and gaps", () => {
    assert.deepEqual(pageItems(1, 5), [1, 2, 3, 4, 5]);
    assert.deepEqual(pageItems(1, 20), [1, 2, "…", 20]);
    assert.deepEqual(pageItems(10, 20), [1, "…", 9, 10, 11, "…", 20]);
    assert.deepEqual(pageItems(20, 20), [1, "…", 19, 20]);
});

test("page sizes are offered while a page stays within 5000 cells", () => {
    assert.deepEqual(pageSizeChoices(DEFAULT_PAGE_SIZES, 5, 10), [10, 25, 50, 100, 250, 500, 1000]);
    assert.deepEqual(pageSizeChoices(DEFAULT_PAGE_SIZES, 10, 10), [10, 25, 50, 100, 250, 500]);
    assert.deepEqual(pageSizeChoices(DEFAULT_PAGE_SIZES, 25, 10), [10, 25, 50, 100]);
});

test("the page size in use stays offered; at least the smallest one is", () => {
    assert.deepEqual(pageSizeChoices(DEFAULT_PAGE_SIZES, 25, 1000), [10, 25, 50, 100, 1000]);
    assert.deepEqual(pageSizeChoices([50, 20], 1000, 50), [20, 50]);
    assert.deepEqual(pageSizeChoices([50, 20], 1000, null), [20]);
});

test("exceedsCellLimit counts rows × columns", () => {
    assert.equal(exceedsCellLimit(500, 10), false);
    assert.equal(exceedsCellLimit(501, 10), true);
    assert.equal(exceedsCellLimit(10, 0), false);
});
