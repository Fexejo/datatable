import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32, zip, buildXLSX, columnLetter, dateSerial, sheetName } from "../../xlsx.js";
import { buildSheet } from "../../export.js";

// Minimal reader for stored (uncompressed) ZIP archives: name → text.
function unzip(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const end = bytes.length - 22;
    assert.equal(view.getUint32(end, true), 0x06054B50, "end of central directory");
    const count = view.getUint16(end + 10, true);
    let at = view.getUint32(end + 16, true);
    const files = {};
    for (let i = 0; i < count; i++) {
        assert.equal(view.getUint32(at, true), 0x02014B50, "central directory entry");
        const crc = view.getUint32(at + 16, true);
        const size = view.getUint32(at + 24, true);
        const nameLength = view.getUint16(at + 28, true);
        const offset = view.getUint32(at + 42, true);
        const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
        assert.equal(view.getUint32(offset, true), 0x04034B50, "local header");
        const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
        const data = bytes.subarray(start, start + size);
        assert.equal(crc32(data), crc, `crc of ${name}`);
        files[name] = new TextDecoder().decode(data);
        at += 46 + nameLength;
    }
    return files;
}

test("crc32 matches the reference value", () => {
    assert.equal(crc32(new TextEncoder().encode("123456789")), 0xCBF43926);
});

test("zip stores files that can be read back", () => {
    const files = unzip(zip([{ name: "a.txt", data: "hällo" }, { name: "dir/b.xml", data: "<x/>" }]));
    assert.deepEqual(files, { "a.txt": "hällo", "dir/b.xml": "<x/>" });
});

test("column letters, sheet names and date serials", () => {
    assert.deepEqual([0, 25, 26, 51, 52, 701, 702].map(columnLetter), ["A", "Z", "AA", "AZ", "BA", "ZZ", "AAA"]);
    assert.equal(sheetName("Q1/2024: [Members]?"), "Q1 2024   Members");
    assert.equal(sheetName("'x'"), "x");
    assert.equal(sheetName(""), "Sheet1");
    assert.equal(sheetName("a".repeat(40)).length, 31);
    assert.equal(dateSerial("2024-01-05"), 45296);
    assert.equal(dateSerial(new Date(2024, 0, 5, 12)), 45296.5);
    assert.equal(dateSerial("nope"), null);
});

test("workbook parts and typed cells", () => {
    const files = unzip(buildXLSX({
        sheet: "Members",
        header: ["Name", "Fee", "Active", "Joined", "Share", "Note"],
        columns: [
            { type: "string" }, { type: "currency" }, { type: "boolean" }, { type: "date" },
            { type: "percent" }, { type: "string" }
        ],
        rows: [["Anna & <Co>", 9.5, true, "2024-01-05", 0.25, "=1+1"], ["Ben", "12", false, null, null, { a: 1 }]]
    }));
    assert.deepEqual(Object.keys(files).sort(), [
        "[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"
    ]);
    assert.match(files["xl/workbook.xml"], /<sheet name="Members" sheetId="1" r:id="rId1"\/>/);
    const sheet = files["xl/worksheets/sheet1.xml"];
    assert.match(sheet, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/, "header row frozen");
    assert.match(sheet, /<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Name<\/t><\/is><\/c>/, "bold header");
    assert.match(sheet, /<c r="A2" t="inlineStr"><is><t xml:space="preserve">Anna &amp; &lt;Co&gt;<\/t><\/is><\/c>/, "escaped text");
    assert.match(sheet, /<c r="B2" s="5"><v>9.5<\/v><\/c>/, "currency number");
    assert.match(sheet, /<c r="C2" t="b"><v>1<\/v><\/c>/, "boolean");
    assert.match(sheet, /<c r="D2" s="2"><v>45296<\/v><\/c>/, "date serial");
    assert.match(sheet, /<c r="E2" s="6"><v>0.25<\/v><\/c>/, "percent");
    assert.match(sheet, /<c r="F2" t="inlineStr"><is><t xml:space="preserve">=1\+1<\/t><\/is><\/c>/, "formula-like text stays text");
    assert.match(sheet, /<c r="B3" s="5"><v>12<\/v><\/c>/, "numeric string in a number column");
    assert.match(sheet, /<row r="3"><c r="A3"[^]*<c r="B3"[^]*<c r="C3" t="b"><v>0<\/v><\/c><c r="F3"/, "empty cells left out");
    assert.ok(!/<f>/.test(sheet), "no formulas");
});

test("text mode and no header", () => {
    const sheet = unzip(buildXLSX({ columns: [{ type: "number" }], rows: [[5]], text: true }))["xl/worksheets/sheet1.xml"];
    assert.match(sheet, /<c r="A1" t="inlineStr"><is><t xml:space="preserve">5<\/t>/);
    assert.ok(!sheet.includes("<pane"), "nothing frozen without header");
});

test("buildSheet: labels as header, formatted values as text", () => {
    const columns = [{ key: "n", label: "Number", type: "number" }, { key: "x", exportable: false }];
    const raw = unzip(buildSheet([{ n: 1234.5 }], columns))["xl/worksheets/sheet1.xml"];
    assert.match(raw, /Number<\/t>.*<c r="A2"><v>1234.5<\/v><\/c>/);
    assert.ok(!raw.includes('r="B1"'), "exportable: false left out");
    const text = unzip(buildSheet([{ n: 1234.5 }], columns, { localized: true, locale: "de-DE", headers: false }))["xl/worksheets/sheet1.xml"];
    assert.match(text, /<c r="A1" t="inlineStr"><is><t xml:space="preserve">1.234,5<\/t>/);
});
