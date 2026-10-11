import { test } from "node:test";
import assert from "node:assert/strict";
import { getByPath, getCellValue, isEmptyValue, toDate, toNumber, toBoolean, typeGroup, clamp } from "../../util.js";

test("getByPath reads flat and nested keys", () => {
    const row = { name: "Anna", address: { city: "Berlin" } };
    assert.equal(getByPath(row, "name"), "Anna");
    assert.equal(getByPath(row, "address.city"), "Berlin");
    assert.equal(getByPath(row, "address.zip.code"), undefined);
    assert.equal(getByPath(null, "name"), undefined);
});

test("getCellValue prefers accessor over key", () => {
    const row = { first: "Anna", last: "Becker" };
    assert.equal(getCellValue(row, { key: "first" }), "Anna");
    assert.equal(getCellValue(row, { key: "x", accessor: (r) => `${r.first} ${r.last}` }), "Anna Becker");
});

test("isEmptyValue treats null, undefined, '' and NaN as empty", () => {
    for (const v of [null, undefined, "", NaN]) assert.equal(isEmptyValue(v), true);
    for (const v of [0, false, " ", "0"]) assert.equal(isEmptyValue(v), false);
});

test("toNumber accepts comma decimals and whitespace", () => {
    assert.equal(toNumber("1,5"), 1.5);
    assert.equal(toNumber(" 1 000 "), 1000);
    assert.equal(toNumber(true), 1);
    assert.ok(Number.isNaN(toNumber("")));
});

test("toDate handles Date, timestamp, ISO string and garbage", () => {
    assert.equal(toDate("2024-01-02").getUTCDate(), 2);
    assert.equal(toDate(0).getTime(), 0);
    assert.equal(toDate("not a date"), null);
    assert.equal(toDate(""), null);
});

test("toBoolean is lenient", () => {
    for (const v of [true, 1, "1", "true", "yes", "ja"]) assert.equal(toBoolean(v), true);
    for (const v of [false, 0, "0", "no", null]) assert.equal(toBoolean(v), false);
});

test("typeGroup maps concrete types to families", () => {
    assert.equal(typeGroup("currency"), "number");
    assert.equal(typeGroup("datetime"), "date");
    assert.equal(typeGroup("boolean"), "boolean");
    assert.equal(typeGroup("enum"), "text");
    assert.equal(typeGroup(undefined), "text");
});

test("clamp", () => {
    assert.equal(clamp(5, 1, 3), 3);
    assert.equal(clamp(-1, 0, 3), 0);
});
