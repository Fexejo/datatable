import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_REGEX_LENGTH, applyFilters, matchesPattern, isActiveFilter, distinctValues, operatorsForType, describeFilter } from "../../src/core/filtering.js";
import { getTranslations } from "../../src/core/i18n.js";

const columns = [
    { key: "name", type: "string" },
    { key: "fee", type: "number" },
    { key: "joined", type: "date" },
    { key: "active", type: "boolean" },
    { key: "secret", type: "string", searchable: false }
];
const data = [
    { name: "Anna", fee: 50, joined: "2021-03-02", active: true, secret: "zzz" },
    { name: "Ben", fee: 12.5, joined: "2020-11-15", active: false, secret: "yyy" },
    { name: "Clara", fee: null, joined: "", active: true, secret: "xxx" }
];

test("operators per type family", () => {
    assert.ok(operatorsForType("currency").some((o) => o.id === "between"));
    assert.ok(operatorsForType("string").some((o) => o.id === "regex"));
    assert.deepEqual(operatorsForType("boolean").map((o) => o.id), ["isTrue", "isFalse"]);
});

test("text patterns are case-insensitive", () => {
    assert.ok(matchesPattern("Anna", { kind: "pattern", operator: "contains", operand: "NN" }, "string"));
    assert.ok(matchesPattern("Anna", { kind: "pattern", operator: "startsWith", operand: "an" }, "string"));
    assert.ok(!matchesPattern("Anna", { kind: "pattern", operator: "equals", operand: "ann" }, "string"));
    assert.ok(!matchesPattern("Anna", { kind: "pattern", operator: "regex", operand: "(" }, "string"), "invalid regex never matches");
});

test("a RegEx applies up to MAX_REGEX_LENGTH characters; a longer one matches nothing", () => {
    /** @param {string} operand @returns {import("../../src/types.js").PatternFilter} */
    const regex = (operand) => ({ kind: "pattern", operator: "regex", operand, arity: 1 });
    const longest = "a?".repeat(MAX_REGEX_LENGTH / 2);
    assert.equal(longest.length, MAX_REGEX_LENGTH);
    assert.ok(matchesPattern("Anna", regex(longest), "string"));
    assert.ok(!matchesPattern("Anna", regex(longest + "?"), "string"));
    assert.deepEqual(applyFilters(data, { name: regex("^(anna|ben)$") }, columns).map((r) => r.name), ["Anna", "Ben"]);
    assert.deepEqual(applyFilters(data, { name: regex(longest + "?") }, columns), []);
});

test("number patterns incl. between with swapped bounds", () => {
    assert.ok(matchesPattern(50, { kind: "pattern", operator: "gte", operand: "50" }, "number"));
    assert.ok(matchesPattern(5, { kind: "pattern", operator: "between", operand: 10, operand2: 1 }, "number"));
    assert.ok(!matchesPattern(null, { kind: "pattern", operator: "lt", operand: 100 }, "number"), "empty never matches comparisons");
    assert.ok(matchesPattern(null, { kind: "pattern", operator: "empty" }, "number"));
});

test("date patterns", () => {
    assert.ok(matchesPattern("2021-03-02", { kind: "pattern", operator: "after", operand: "2021-01-01" }, "date"));
    assert.ok(matchesPattern("2021-03-02", { kind: "pattern", operator: "on", operand: "2021-03-02" }, "date"));
    assert.ok(!matchesPattern("", { kind: "pattern", operator: "before", operand: "2030-01-01" }, "date"));
});

test("isActiveFilter respects arity", () => {
    assert.equal(isActiveFilter(null), false);
    assert.equal(isActiveFilter({ kind: "value", values: [] }), false);
    assert.equal(isActiveFilter({ kind: "value", values: ["a"] }), true);
    assert.equal(isActiveFilter({ kind: "pattern", operator: "contains", operand: "" }), false);
    assert.equal(isActiveFilter({ kind: "pattern", operator: "empty", arity: 0 }), true);
    assert.equal(isActiveFilter({ kind: "pattern", operator: "between", operand: 1, arity: 2 }), false);
});

test("applyFilters combines filters with AND", () => {
    const result = applyFilters(data, {
        active: { kind: "pattern", operator: "isTrue", arity: 0 },
        fee: { kind: "pattern", operator: "gt", operand: 10, arity: 1 }
    }, columns);
    assert.deepEqual(result.map((r) => r.name), ["Anna"]);
});

test("value filter matches stringified values", () => {
    const result = applyFilters(data, { fee: { kind: "value", values: ["12.5"] } }, columns);
    assert.deepEqual(result.map((r) => r.name), ["Ben"]);
});

test("global search skips non-searchable columns", () => {
    assert.deepEqual(applyFilters(data, {}, columns, { globalSearch: "cla" }).map((r) => r.name), ["Clara"]);
    assert.equal(applyFilters(data, {}, columns, { globalSearch: "zzz" }).length, 0);
});

test("distinctValues counts and sorts by label", () => {
    const values = distinctValues(data, columns[3]);
    assert.deepEqual(values.map((v) => [v.label, v.count]), [["No", 1], ["Yes", 2]]);
});

test("text conditions test the displayed text (enum labels)", () => {
    const status = { key: "status", type: "enum", options: [{ value: "a", label: "Active" }, { value: "b", label: "Blocked" }] };
    const rows = [{ status: "a" }, { status: "b" }, { status: null }];
    const keep = (/** @type {{ operator: string, operand?: any, arity?: number }} */ filter) => applyFilters(rows, { status: { kind: "pattern", arity: 1, ...filter } }, [status]).map((r) => r.status);
    assert.deepEqual(keep({ operator: "notEquals", operand: "Active" }), ["b", null]);
    assert.deepEqual(keep({ operator: "contains", operand: "lock" }), ["b"]);
    assert.deepEqual(keep({ operator: "empty", arity: 0 }), [null]);
});

test("number conditions compare raw values of formatted columns", () => {
    const fee = { key: "fee", type: "currency", format: { currency: "EUR" } };
    const rows = [{ fee: 1234.5 }, { fee: 10 }];
    const result = applyFilters(rows, { fee: { kind: "pattern", operator: "notEquals", operand: 1234.5, arity: 1 } }, [fee], { locale: "de-DE" });
    assert.deepEqual(result.map((r) => r.fee), [10]);
});

test("boolean conditions read truthy values like the display", () => {
    const ok = { key: "ok", type: "boolean" };
    const rows = [{ ok: "yes" }, { ok: "ja" }, { ok: 1 }, { ok: false }, { ok: "no" }];
    const isTrue = applyFilters(rows, { ok: { kind: "pattern", operator: "isTrue", arity: 0 } }, [ok]);
    assert.deepEqual(isTrue.map((r) => r.ok), ["yes", "ja", 1]);
});

test("describeFilter: values in display format, pattern with operator and operands", () => {
    const en = { t: getTranslations("en-US"), locale: "en-US" };
    const de = { t: getTranslations("de-DE"), locale: "de-DE" };
    const status = { key: "status", type: "enum", format: { labels: { a: "Active", p: "Paused" } } };
    assert.equal(describeFilter({ kind: "value", values: ["a", "p"] }, status, en), "Active, Paused");
    assert.equal(describeFilter({ kind: "value", values: ["A", "B", "C", "D", "E"] }, columns[0], en), "A, B, C +2 more");
    assert.equal(describeFilter({ kind: "value", values: ["A", "B", "C", "D"] }, columns[0], de), "A, B, C +1 weitere");
    assert.equal(describeFilter({ kind: "value", values: [""] }, columns[0], en), "(empty)", "empty value");

    assert.equal(describeFilter({ kind: "pattern", operator: "contains", operand: "an" }, columns[0], en), "contains “an”");
    assert.equal(describeFilter({ kind: "pattern", operator: "contains", operand: "an" }, columns[0], de), "enthält „an“");
    assert.equal(describeFilter({ kind: "pattern", operator: "between", arity: 2, operand: "1000", operand2: "2000.5" },
        { key: "fee", type: "currency", format: { currency: "EUR" } }, de).replace(/\s/g, " "), "zwischen 1.000,00 € und 2.000,50 €");
    assert.equal(describeFilter({ kind: "pattern", operator: "on", operand: "2024-03-05" }, columns[2], de),
        "am 05.03.2024", "a date operand is a local date");
    assert.equal(describeFilter({ kind: "pattern", operator: "isTrue", arity: 0 }, columns[3], en), "is true");
    const linked = { key: "name", type: "string", formatter: () => "ignored" };
    assert.equal(describeFilter({ kind: "pattern", operator: "equals", operand: "x" }, linked, en), "equals “x”");
});

test("every pattern operator, per type family", () => {
    /** @type {[string, any, string, any, any, boolean][]} */
    const cases = [
        // [type, value, operator, operand, operand2, expected]
        ["string", "Anna", "notContains", "x", undefined, true],
        ["string", "Anna", "notContains", "nn", undefined, false],
        ["string", "Anna", "endsWith", "NA", undefined, true],
        ["string", "Anna", "notEquals", "anna", undefined, false],
        ["string", "", "empty", undefined, undefined, true],
        ["string", "x", "notEmpty", undefined, undefined, true],
        ["string", "Anna", "unknown", "x", undefined, true],
        ["number", 5, "equals", "5", undefined, true],
        ["number", 5, "notEquals", 5, undefined, false],
        ["number", 5, "gt", 4, undefined, true],
        ["number", 5, "lt", 5, undefined, false],
        ["number", 5, "lte", 5, undefined, true],
        ["number", null, "notEmpty", undefined, undefined, false],
        ["number", 5, "unknown", 1, undefined, true],
        ["date", "2021-03-02", "before", "2021-03-03", undefined, true],
        ["date", "2021-03-02", "before", "", undefined, false],
        ["date", "2021-03-02", "between", "2021-04-01", "2021-03-01", true],
        ["date", "2021-03-02", "between", "2021-04-01", "", false],
        ["date", "", "empty", undefined, undefined, true],
        ["date", "2021-03-02", "unknown", "x", undefined, true],
        ["boolean", false, "isFalse", undefined, undefined, true],
        ["boolean", "yes", "isFalse", undefined, undefined, false],
        ["boolean", true, "unknown", undefined, undefined, true]
    ];
    for (const [type, value, operator, operand, operand2, expected] of cases) {
        assert.equal(matchesPattern(value, { kind: "pattern", operator, operand, operand2 }, type), expected,
            `${type} ${JSON.stringify(value)} ${operator} ${JSON.stringify(operand)}`);
    }
});

test("isActiveFilter rejects unknown kinds and missing operands", () => {
    assert.equal(isActiveFilter(/** @type {any} */ ({ kind: "other" })), false);
    assert.equal(isActiveFilter({ kind: "pattern", operator: "between", operand: 1, arity: 2 }), false, "second operand missing");
    assert.equal(isActiveFilter({ kind: "pattern", operator: "", operand: 1 }), false, "no operator");
});
