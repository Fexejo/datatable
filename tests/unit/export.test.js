import { test } from "node:test";
import assert from "node:assert/strict";
import {
    buildCSV,
    buildJSON,
    buildExport,
    neutralizeFormula,
    defaultFilename,
    withExtension,
    sanitizeFilename,
    timestamp
} from "../../src/export/export.js";

const columns = [
    { key: "name", label: "Name", type: "string" },
    { key: "fee", label: "Fee", type: "number" },
    { key: "secret", label: "Secret", exportable: false }
];

test("CSV: header, delimiter and CRLF line endings", () => {
    const csv = buildCSV([{ name: "Anna", fee: 1.5 }, { name: "Ben", fee: 2 }], columns);
    assert.equal(csv, "Name;Fee\r\nAnna;1.5\r\nBen;2");
});

test("CSV: localized values use the displayed text", () => {
    const csv = buildCSV([{ name: "Anna", fee: 1234.5 }], columns, { locale: "de-DE", localized: true, headers: false });
    assert.equal(csv, "Anna;1.234,5");
});

test("CSV: raw values (dates as ISO, empty as empty field, objects as JSON)", () => {
    const cols = [
        { key: "d", type: "date" }, { key: "b", type: "boolean" }, { key: "n" }, { key: "o" }
    ];
    const row = { d: new Date(Date.UTC(2024, 0, 5)), b: false, n: null, o: { a: 1 } };
    assert.equal(buildCSV([row], cols, { headers: false, delimiter: "," }), '2024-01-05T00:00:00.000Z,false,,"{""a"":1}"');
});

test("CSV: header without labels uses keys; headers can be left out", () => {
    assert.equal(buildCSV([{ name: "A", fee: 1 }], columns, { names: "key" }), "name;fee\r\nA;1");
    assert.equal(buildCSV([{ name: "A", fee: 1 }], columns, { headers: false }), "A;1");
});

test("CSV: fields with delimiter, quotes or newlines are quoted (RFC 4180)", () => {
    const csv = buildCSV([{ name: 'A;"B"\nC', fee: 1 }], columns, { headers: false });
    assert.equal(csv, '"A;""B""\nC";1');
});

test("CSV: exportFormatter overrides the value and gets the options", () => {
    /** @type {any} */
    let ctx = null;
    const cols = [{ key: "fee", label: "Fee", exportFormatter: (/** @type {number} */ v, /** @type {any} */ c) => { ctx = c; return v.toFixed(2); } }];
    assert.equal(buildCSV([{ fee: 3 }], cols, { headers: false, localized: true }), "3.00");
    assert.equal(ctx.localized, true);
    assert.equal(ctx.format, "csv");
});

test("CSV: formulas are neutralized, numbers are not", () => {
    const cols = [{ key: "v", label: "=Header" }];
    const rows = ["=1+1", "+cmd|' /C calc'!A0", "-2+3+cmd|' /C calc'!A0", "@SUM(A1)", "\t=1", "＝1", "-5", "+12.5", "-1.234,56 €", "-$1,234.56", "-12 %", "a=1"]
        .map((v) => ({ v }));
    const lines = buildCSV(rows, cols).split("\r\n");
    assert.deepEqual(lines, [
        "'=Header",
        "'=1+1",
        "'+cmd|' /C calc'!A0",
        "'-2+3+cmd|' /C calc'!A0",
        "'@SUM(A1)",
        "'\t=1",
        "'＝1",
        "-5",
        "+12.5",
        "-1.234,56 €",
        "-$1,234.56",
        "-12 %",
        "a=1"
    ]);
    assert.equal(neutralizeFormula("-"), "'-");
    assert.equal(neutralizeFormula("-1e5"), "-1e5");
});

test("JSON: keys as property names by default, raw values keep their types", () => {
    const json = buildJSON([{ name: "Anna", fee: 1.5, secret: "x" }, { name: "", fee: null }], columns);
    assert.deepEqual(JSON.parse(json), [{ name: "Anna", fee: 1.5 }, { name: null, fee: null }]);
});

test("JSON: localized values, label names, duplicate names fall back to keys", () => {
    const cols = [{ key: "a", label: "X", type: "number" }, { key: "b", label: "X" }];
    const rows = [{ a: 1000, b: "y" }];
    assert.deepEqual(JSON.parse(buildJSON(rows, cols, { localized: true, locale: "de-DE", names: "label" })), [{ X: "1.000", b: "y" }]);
});

test("JSON: metadata adds the columns with label and type, like the table config", () => {
    const cols = [{ key: "a", label: "A", type: "integer" }, { key: "b" }];
    assert.deepEqual(JSON.parse(buildJSON([{ a: 1, b: "y" }], cols, { metadata: true })), {
        columns: [{ key: "a", label: "A", type: "integer" }, { key: "b", label: "b" }],
        data: [{ a: 1, b: "y" }]
    });
});

test("buildExport picks the format", () => {
    assert.equal(buildExport([{ name: "A", fee: 1 }], columns, { format: "csv", headers: false }), "A;1");
    assert.equal(buildExport([{ name: "A", fee: 1 }], columns, { format: "json" }), '[\n  {\n    "name": "A",\n    "fee": 1\n  }\n]');
    assert.ok(buildExport([{ name: "A", fee: 1 }], columns, { format: "xlsx" }) instanceof Uint8Array);
});

test("file names: timestamp, default name, extension, sanitizing", () => {
    const date = new Date(2026, 9, 2, 8, 5, 9);
    assert.equal(timestamp(date), "2026-10-02_08-05-09");
    assert.equal(defaultFilename("Members", "csv", date), "Members_2026-10-02_08-05-09.csv");
    assert.equal(defaultFilename("", "json", date), "export_2026-10-02_08-05-09.json");
    assert.equal(defaultFilename("A/B: C?", "csv", date), "A_B_ C__2026-10-02_08-05-09.csv");
    assert.equal(withExtension("data", "json"), "data.json");
    assert.equal(withExtension("data.CSV", "csv"), "data.CSV");
    assert.equal(withExtension("  ", "csv"), "export.csv");
    assert.equal(sanitizeFilename('a<b>"c"|d'), "a_b_c_d");
});
