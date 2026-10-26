import { test } from "node:test";
import assert from "node:assert/strict";
import {
    createState, mergeState, serializeState, viewSignature, activeFilterCount,
    normalizeOrder, sanitizeState, orderedColumns, moveColumn, deriveRows
} from "../../src/core/state.js";

const columns = [
    { key: "a", type: "string" },
    { key: "b", type: "number", hidden: true },
    { key: "c", type: "string", pinned: true },
    { key: "d", type: "string" }
];
const keys = columns.map((c) => c.key);

test("createState takes column flags and defaults, drops unknown columns", () => {
    const state = createState(columns, { sort: [{ key: "x", direction: "asc" }] }, { pageSize: 25 });
    assert.deepEqual(state.sort, []);
    assert.deepEqual([...state.hiddenColumns], ["b"]);
    assert.deepEqual(state.pinnedColumns, ["c"]);
    assert.deepEqual(state.columnOrder, keys);
    assert.equal(state.pageSize, 25);
    assert.equal(state.layout, "table");
});

test("mergeState applies a partial state without touching the original", () => {
    const state = createState(columns, {}, { pageSize: 10 });
    const next = mergeState(state, { hiddenColumns: ["a", "zz"], columnOrder: ["d"], page: 2 }, keys);
    assert.deepEqual([...next.hiddenColumns], ["a"]);
    assert.deepEqual(next.columnOrder, ["d", "a", "b", "c"]);
    assert.equal(next.page, 2);
    assert.deepEqual([...state.hiddenColumns], ["b"]);
});

test("serializeState keeps active filters only and can omit the page", () => {
    const state = createState(columns, {
        filters: { a: { kind: "value", values: ["x"] }, d: { kind: "pattern", operator: "contains", operand: "" } }
    }, { pageSize: 10 });
    const plain = serializeState(state, { includePage: false });
    assert.deepEqual(Object.keys(plain.filters), ["a"]);
    assert.equal("page" in plain, false);
    assert.deepEqual(plain.hiddenColumns, ["b"]);
});

test("viewSignature ignores the order of hidden columns, filters and values", () => {
    /** @type {Omit<import("../../src/types.js").SerializedState, "hiddenColumns"|"filters">} */
    const base = { sort: [], globalSearch: "", pageSize: 10, layout: "table", pinnedColumns: [], columnOrder: keys };
    const one = viewSignature({ ...base, hiddenColumns: ["a", "b"], filters: { a: { kind: "value", values: [2, 1] }, b: { kind: "value", values: [1] } } });
    const two = viewSignature({ ...base, hiddenColumns: ["b", "a"], filters: { b: { kind: "value", values: [1] }, a: { kind: "value", values: ["1", "2"] } } });
    assert.equal(one, two);
});

test("activeFilterCount counts the global search as one filter", () => {
    const state = createState(columns, { filters: { a: { kind: "value", values: ["x"] } }, globalSearch: "q" }, { pageSize: 10 });
    assert.equal(activeFilterCount(state), 2);
    assert.equal(activeFilterCount(state, { globalSearch: false }), 1);
});

test("normalizeOrder and sanitizeState drop unknown keys", () => {
    assert.deepEqual(normalizeOrder(["c", "x", "c", "a"], keys), ["c", "a", "b", "d"]);
    const filter = { kind: "value", values: ["v"] };
    assert.deepEqual(sanitizeState({ pinnedColumns: ["x", "a", "a"], filters: /** @type {any} */ ({ x: filter, a: filter }) }, keys),
        { pinnedColumns: ["a"], filters: { a: filter } });
});

test("sanitizeState keeps valid parts and drops wrong types (damaged saved views)", () => {
    const valid = {
        sort: [{ key: "a", direction: "desc" }],
        filters: { a: { kind: "pattern", operator: "contains", operand: "x" }, d: { kind: "pattern", operator: "empty", arity: 0 } },
        globalSearch: "q", page: 2, pageSize: 50, layout: "compact",
        hiddenColumns: ["b"], pinnedColumns: ["c"], columnOrder: ["d", "a"]
    };
    assert.deepEqual(sanitizeState(valid, keys), valid);
    for (const bad of [null, undefined, "x", 5, ["a"]]) assert.deepEqual(sanitizeState(bad, keys), {}, String(bad));
    assert.deepEqual(sanitizeState({
        sort: [{ key: "a", direction: "up" }, null, "a", { key: "d", direction: "asc" }],
        filters: { a: null, b: { kind: "value", values: "v" }, c: { kind: "pattern", operator: 1 }, d: { kind: "pattern", operator: "eq", arity: 3 } },
        globalSearch: 1, page: "9", pageSize: -5, layout: "weird",
        hiddenColumns: "a", pinnedColumns: {}, columnOrder: "ab", extra: true
    }, keys), { sort: [{ key: "d", direction: "asc" }], filters: {} });
    assert.deepEqual(sanitizeState({ sort: "x", filters: [], page: 1.5, pageSize: 0 }, keys), {});
});

test("mergeState ignores invalid parts instead of throwing", () => {
    const state = createState(columns, {}, { pageSize: 10 });
    assert.deepEqual(mergeState(state, null, keys), state);
    const next = mergeState(state, /** @type {any} */ ({ pinnedColumns: {}, sort: "x", layout: "weird", pageSize: -5, page: 3 }), keys);
    assert.deepEqual(next, { ...state, page: 3 });
});

test("orderedColumns puts pinned columns first only when pinning is on", () => {
    const state = createState(columns, {}, { pageSize: 10 });
    assert.deepEqual(orderedColumns(columns, state).map((c) => c.key), keys);
    assert.deepEqual(orderedColumns(columns, state, { pinning: true }).map((c) => c.key), ["c", "a", "b", "d"]);
});

test("moveColumn reorders, and pins or unpins across the pinned block", () => {
    const state = createState(columns, {}, { pageSize: 10 });
    const shown = ["c", "a", "d"];   // pinned c, then a and d (b hidden)
    assert.equal(moveColumn(state, shown, "a", 1, { pinning: true }), null, "same place");

    const right = moveColumn(state, shown, "a", 2, { pinning: true });
    assert.ok(right);
    assert.deepEqual(right.columnOrder, ["b", "c", "d", "a"]);
    assert.equal(right.pinned, false);

    const intoBlock = moveColumn(state, shown, "d", 0, { pinning: true });
    assert.ok(intoBlock);
    assert.deepEqual(intoBlock.pinnedColumns, ["d", "c"]);
    assert.equal(intoBlock.pinned, true);

    const outOfBlock = moveColumn(state, shown, "c", 2, { pinning: true });
    assert.ok(outOfBlock);
    assert.deepEqual(outOfBlock.pinnedColumns, []);
    assert.deepEqual(outOfBlock.columnOrder, ["a", "b", "d", "c"]);
});

test("deriveRows filters, sorts and paginates", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ a: `r${i}`, b: i % 3 }));
    const state = { ...createState(columns, {}, { pageSize: 5 }), sort: [{ key: "b", direction: /** @type {const} */ ("desc") }], page: 9 };
    const result = deriveRows(rows, state, columns, { locale: "en-US" });
    assert.equal(result.viewData.length, 12);
    assert.equal(result.viewData[0].b, 2);
    assert.equal(result.page, 3, "clamped");
    assert.equal(result.pageData.length, 2);
    assert.equal(deriveRows(rows, state, columns, { pagination: false }).pageData.length, 12);
});
