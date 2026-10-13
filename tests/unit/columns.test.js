import { test } from "node:test";
import assert from "node:assert/strict";
import { inferColumns, inferType, normalizeColumns } from "../../src/core/columns.js";

test("inferType skips empty values", () => {
    const rows = [{ a: null }, { a: "" }, { a: 3 }];
    assert.equal(inferType(rows, "a"), "number");
    assert.equal(inferType([{ d: "2024-05-01" }], "d"), "date");
    assert.equal(inferType([{ b: false }], "b"), "boolean");
    assert.equal(inferType([{}], "x"), "string");
});

test("inferColumns uses first object row and applies overrides", () => {
    const cols = inferColumns([null, { id: 1, name: "A" }], { overrides: { id: { label: "ID" } } });
    assert.deepEqual(cols, [
        { key: "id", label: "ID", type: "number" },
        { key: "name", label: "name", type: "string" }
    ]);
});

test("normalizeColumns fills defaults and follows the features", () => {
    const [name, fee] = normalizeColumns(
        [{ key: "name", copyable: true }, { key: "fee", type: "currency", sortable: false }],
        { features: { sorting: true, filtering: false }, columnMinWidth: "8rem" }
    );
    assert.deepEqual(
        [name.label, name.type, name.align, name.sortable, name.filterable, name.copyable, name.minWidth],
        ["name", "string", "left", true, false, true, "8rem"]
    );
    assert.deepEqual([fee.align, fee.sortable, fee.minWidth], ["right", false, undefined]);
    const [copyOff] = normalizeColumns([{ key: "x", copyable: true }], { features: { copyButtons: false } });
    assert.equal(copyOff.copyable, false);
});
