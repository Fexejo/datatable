import { test } from "node:test";
import assert from "node:assert/strict";
import { inferColumns, inferType } from "../../columns.js";

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
