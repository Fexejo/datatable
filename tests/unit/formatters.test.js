import { test } from "node:test";
import assert from "node:assert/strict";
import { formatValue, toText } from "../../formatters.js";

// Intl output can contain narrow no-break spaces; normalize for comparisons.
const norm = (s) => String(s).replace(/[  ]/g, " ");

test("numbers and currency follow the locale", () => {
    assert.equal(formatValue(1234.5, { type: "number" }, "en-US"), "1,234.5");
    assert.equal(formatValue(1234.5, { type: "number" }, "de-DE"), "1.234,5");
    assert.equal(formatValue(1234, { type: "integer", format: { grouping: false } }, "en-US"), "1234");
    assert.equal(norm(formatValue(9.9, { type: "currency", format: { currency: "EUR" } }, "de-DE")), "9,90 €");
});

test("percent as fraction or as number", () => {
    assert.equal(formatValue(0.25, { type: "percent" }, "en-US"), "25%");
    assert.equal(formatValue(25, { type: "percent", format: { asNumber: true } }, "en-US"), "25%");
    assert.equal(formatValue(0.255, { type: "percent", format: { decimals: 1 } }, "en-US"), "25.5%");
});

test("boolean labels come from the locale or format", () => {
    assert.equal(formatValue(true, { type: "boolean" }, "en-US"), "Yes");
    assert.equal(formatValue(false, { type: "boolean" }, "de-DE"), "Nein");
    assert.equal(formatValue(1, { type: "boolean", format: { trueLabel: "✓" } }), "✓");
});

test("dates", () => {
    assert.equal(formatValue("2021-03-02T12:00:00", { type: "date" }, "en-US"), "03/02/2021");
    assert.equal(formatValue("2021-03-02T12:00:00", { type: "date" }, "de-DE"), "02.03.2021");
    assert.equal(formatValue("garbage", { type: "date" }), "garbage");
});

test("enum labels from format.labels or options", () => {
    assert.equal(formatValue("a", { type: "enum", format: { labels: { a: "Active" } } }), "Active");
    assert.equal(formatValue("i", { type: "enum", options: [{ value: "i", label: "Inactive" }] }), "Inactive");
    assert.equal(formatValue("x", { type: "enum" }), "x");
});

test("empty values use column.emptyText", () => {
    assert.equal(formatValue(null, { type: "number" }), "");
    assert.equal(formatValue("", { type: "string", emptyText: "—" }), "—");
});

test("custom formatter gets ctx; toText falls back to textContent", () => {
    const column = { key: "s", formatter: (v, ctx) => ({ textContent: `${v}/${ctx.locale}` }) };
    assert.equal(toText("ok", column, "de-DE"), "ok/de-DE");
});
