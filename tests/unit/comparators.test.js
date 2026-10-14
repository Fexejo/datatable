import { test } from "node:test";
import assert from "node:assert/strict";
import { compareValues, sortData, toggleSort } from "../../src/core/comparators.js";

const columns = [
    { key: "name", type: "string" },
    { key: "fee", type: "number" },
    { key: "joined", type: "date" }
];

test("compareValues by type", () => {
    assert.ok(compareValues(2, 10, "number") < 0);
    assert.ok(compareValues("item2", "item10", "string") < 0, "numeric collation");
    assert.ok(compareValues("2020-01-01", "2021-01-01", "date") < 0);
    assert.ok(compareValues(false, true, "boolean") < 0);
});

test("sortData does not mutate input", () => {
    const data = [{ name: "b" }, { name: "a" }];
    const sorted = sortData(data, [{ key: "name", direction: "asc" }], columns);
    assert.deepEqual(sorted.map((r) => r.name), ["a", "b"]);
    assert.deepEqual(data.map((r) => r.name), ["b", "a"]);
});

test("empty values stay last in both directions", () => {
    const data = [{ fee: null }, { fee: 2 }, { fee: "" }, { fee: 1 }];
    const asc = sortData(data, [{ key: "fee", direction: "asc" }], columns).map((r) => r.fee);
    const desc = sortData(data, [{ key: "fee", direction: "desc" }], columns).map((r) => r.fee);
    assert.deepEqual(asc.slice(0, 2), [1, 2]);
    assert.deepEqual(desc.slice(0, 2), [2, 1]);
    assert.ok(asc.slice(2).every((v) => v == null || v === ""));
    assert.ok(desc.slice(2).every((v) => v == null || v === ""));
});

test("multi-column sort uses secondary key", () => {
    const data = [
        { name: "b", fee: 1 },
        { name: "a", fee: 2 },
        { name: "a", fee: 1 }
    ];
    const sorted = sortData(data, [
        { key: "name", direction: "asc" },
        { key: "fee", direction: "desc" }
    ], columns);
    assert.deepEqual(sorted.map((r) => `${r.name}${r.fee}`), ["a2", "a1", "b1"]);
});

test("toggleSort cycles asc → desc → off; additive keeps the other keys", () => {
    /** @type {import("../../src/types.js").SortSpec[]} */
    let sort = [];
    sort = toggleSort(sort, "a");
    assert.deepEqual(sort, [{ key: "a", direction: "asc" }]);
    sort = toggleSort(sort, "a");
    assert.deepEqual(sort, [{ key: "a", direction: "desc" }]);
    sort = toggleSort(sort, "b", { additive: true });
    assert.deepEqual(sort, [{ key: "a", direction: "desc" }, { key: "b", direction: "asc" }]);
    assert.deepEqual(toggleSort(sort, "a", { additive: true }), [{ key: "b", direction: "asc" }], "third click removes only a");
    assert.deepEqual(toggleSort(sort, "a"), [], "without additive the other keys go too");
    assert.deepEqual(toggleSort(sort, "c"), [{ key: "c", direction: "asc" }]);
});

test("sortData keeps empty and unparsable values last in both directions", () => {
    const columns = [{ key: "n", type: "number" }, { key: "d", type: "date" }];
    const rows = [{ n: "x", d: "nope" }, { n: 2, d: "2020-01-02" }, { n: null, d: "" }, { n: 10, d: "2021-05-01" }];
    for (const direction of /** @type {const} */ (["asc", "desc"])) {
        assert.deepEqual(sortData(rows, [{ key: "n", direction }], columns).slice(2).map((r) => r.n), ["x", null]);
        assert.deepEqual(sortData(rows, [{ key: "d", direction }], columns).slice(2).map((r) => r.d), ["nope", ""]);
    }
    assert.deepEqual(sortData(rows, [{ key: "n", direction: "desc" }], columns).slice(0, 2).map((r) => r.n), [10, 2]);
});
