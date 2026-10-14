import { test } from "node:test";
import assert from "node:assert/strict";
import { contextMenuItems } from "../../src/render/menuItems.js";
import { normalizeColumns } from "../../src/core/columns.js";
import { LOCALES } from "../../src/core/i18n.js";

const t = LOCALES.en;
const ALL = {
    pagination: true, sorting: true, multiSort: true, filtering: true, globalSearch: false, contextMenu: true,
    export: true, grid: false, compact: false, columnVisibility: true, columnPinning: true, columnReorder: true,
    rowDetails: true, savedViews: false, copyButtons: true
};
const [name, fee, active] = normalizeColumns(
    [{ key: "name" }, { key: "fee", type: "currency" }, { key: "active", type: "boolean" }],
    { features: ALL }
);

// Items as labels ("—" for a separator) plus the calls their actions make.
function menu(overrides = {}) {
    const calls = [];
    const on = new Proxy({}, { get: (_, action) => (...args) => calls.push([action, ...args]) });
    const items = contextMenuItems({
        t, locale: "en-US", column: name, row: { name: "Anna" }, value: "Anna", features: ALL,
        details: true, sorted: false, filtered: false, pinned: false,
        order: { index: 1, count: 3, changed: false }, on, ...overrides
    });
    const select = (label) => items.find((item) => item.label === label)?.onSelect?.(/** @type {any} */ ({}));
    return { labels: items.map((item) => (item.separator ? "—" : item.label)), calls, select };
}

test("context menu of a cell: details, sort, filter, copy, columns, export", () => {
    assert.deepEqual(menu().labels, [
        "Show details", "—",
        "Sort ascending", "Sort descending", "Add as sort key (asc)", "—",
        "Filter by “Anna”", "Exclude “Anna”", "Open filter…", "—",
        "Copy cell", "Copy row", "Copy column", "—",
        "Move left", "Move to start", "Move right", "Move to end", "Pin column", "Hide column", "—",
        "Export…"
    ]);
});

test("context menu of a header has no row actions; features hide their entries", () => {
    const { labels } = menu({ row: null, value: null, features: { ...ALL, columnReorder: false, columnPinning: false, export: false } });
    assert.ok(!labels.includes("Show details") && !labels.includes("Copy cell") && !labels.includes("Copy row"));
    assert.ok(!labels.some((l) => l.startsWith("Filter by")), "no quick filter without a value");
    assert.ok(!labels.includes("Move left") && !labels.includes("Pin column") && !labels.includes("Export…"));
    assert.ok(labels.includes("Open filter…") && labels.includes("Hide column"));
});

test("state decides remove-sort, clear-filter, unpin and reset entries; edges hide moves", () => {
    const { labels } = menu({ sorted: true, filtered: true, pinned: true, order: { index: 0, count: 3, changed: true } });
    for (const label of [t.removeSortKey, t.clearColumnFilter, t.unpinColumn, t.resetColumnOrder]) assert.ok(labels.includes(label), label);
    assert.ok(!labels.includes("Move left") && labels.includes("Move to end"), "first column moves right only");
    assert.ok(!menu({ order: { index: 2, count: 3, changed: false } }).labels.includes("Move right"), "last column");
});

test("exclude: text compares the displayed text, numbers the raw value; booleans have none", () => {
    let m = menu({ column: fee, value: 1234.5, row: { fee: 1234.5 } });
    m.select("Exclude “€1,234.50”");
    assert.deepEqual(m.calls, [["filter", { kind: "pattern", operator: "notEquals", operand: 1234.5, arity: 1 }]]);
    m = menu();
    m.select("Exclude “Anna”");
    assert.equal(m.calls[0][1].operand, "Anna");
    assert.ok(!menu({ column: active, value: true, row: { active: true } }).labels.some((l) => l.startsWith("Exclude")));
});

test("actions pass their arguments", () => {
    const m = menu();
    for (const label of ["Sort descending", "Add as sort key (asc)", "Filter by “Anna”", "Copy cell", "Move to end", "Pin column"]) m.select(label);
    assert.deepEqual(m.calls, [
        ["sort", "desc"], ["sort", "asc", true], ["filter", { kind: "value", values: ["Anna"] }],
        ["copyCell", "Anna"], ["move", 2], ["pin", true]
    ]);
});
