import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCSV } from "../../csv.js";

const columns = [
    { key: "name", label: "Name", type: "string" },
    { key: "fee", label: "Fee", type: "number" },
    { key: "secret", label: "Secret", exportable: false },
    { key: "hiddenCol", label: "Hidden", hidden: true }
];

test("header, delimiter and CRLF line endings", () => {
    const csv = buildCSV([{ name: "Anna", fee: 1.5 }], columns, { locale: "de-DE" });
    assert.equal(csv, "Name;Fee\r\nAnna;1,5");
});

test("fields with delimiter, quotes or newlines are quoted (RFC 4180)", () => {
    const csv = buildCSV([{ name: 'A;"B"\nC', fee: 1 }], columns, { includeHeaders: false });
    assert.equal(csv, '"A;""B""\nC";1');
});

test("exportFormatter overrides display text", () => {
    const cols = [{ key: "fee", label: "Fee", type: "currency", exportFormatter: (v) => v.toFixed(2) }];
    assert.equal(buildCSV([{ fee: 3 }], cols, { includeHeaders: false }), "3.00");
});
