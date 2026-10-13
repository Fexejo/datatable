// Sorting — including stable multi-column sort.
// JS engines sort stably since ES2019; we rely on that for secondary keys.

import { getCellValue, isEmptyValue, toBoolean, toDate, toNumber, typeGroup } from "./util.js";

// `localeCompare` with options builds a collator on every call; a cached
// `Intl.Collator` is ~50× faster on large tables.
const collators = new Map();

export function textCollator(locale = "en-US") {
    let collator = collators.get(locale);
    if (!collator) {
        collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
        collators.set(locale, collator);
    }
    return collator;
}

// The comparable form of a raw value: a number for numbers, dates and
// booleans, a string for text, or null for empty / unparsable values.
function sortKey(value, group) {
    if (isEmptyValue(value)) return null;
    if (group === "number") {
        const number = toNumber(value);
        return Number.isNaN(number) ? null : number;
    }
    if (group === "date") return toDate(value)?.getTime() ?? null;
    if (group === "boolean") return toBoolean(value) ? 1 : 0;
    return String(value);
}

// Compares two sort keys. Empty keys always sort last.
function compareKeys(a, b, group, collator) {
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    return group === "text" ? collator.compare(a, b) : a - b;
}

// Compares two raw values by column type. Empty values always sort last.
export function compareValues(a, b, type, locale = "en-US") {
    const group = typeGroup(type);
    return compareKeys(sortKey(a, group), sortKey(b, group), group, textCollator(locale));
}

// Sorts a copy of the data by multiple criteria.
// sortSpec: [{ key, direction: "asc" | "desc" }, …] — order = priority.
// Each row's sort keys are computed once, not on every comparison.
/**
 * @param {object[]} data
 * @param {import("../types.js").SortSpec[]} sortSpec
 * @param {import("../types.js").Column[]} columns
 * @returns {object[]}
 */
export function sortData(data, sortSpec, columns, locale = "en-US") {
    if (!Array.isArray(sortSpec) || sortSpec.length === 0) return data.slice();
    const columnByKey = new Map(columns.map((c) => [c.key, c]));
    const collator = textCollator(locale);
    const specs = sortSpec
        .map((spec) => ({ column: columnByKey.get(spec.key), sign: spec.direction === "desc" ? -1 : 1 }))
        .filter((spec) => spec.column)
        .map((spec) => ({ ...spec, group: typeGroup(spec.column.type) }));
    if (specs.length === 0) return data.slice();

    const entries = data.map((row) => ({
        row,
        keys: specs.map(({ column, group }) => sortKey(getCellValue(row, column), group))
    }));
    entries.sort((a, b) => {
        for (let i = 0; i < specs.length; i += 1) {
            const { group, sign } = specs[i];
            const x = a.keys[i];
            const y = b.keys[i];
            // Empty values stay at the bottom: direction only flips non-empty pairs.
            const result = compareKeys(x, y, group, collator);
            if (result !== 0) return x === null || y === null ? result : result * sign;
        }
        return 0;
    });
    return entries.map((entry) => entry.row);
}

// Toggles sort for a column in the existing sort state.
// Without `additive`, only this column is sorted.
// With `additive` (e.g. Shift+click), the column is added as another key.
// Per-column cycle: asc -> desc -> removed.
export function toggleSort(sortSpec, key, { additive = false } = {}) {
    const current = sortSpec.find((s) => s.key === key);
    let next;
    if (!current) {
        next = { key, direction: "asc" };
    } else if (current.direction === "asc") {
        next = { key, direction: "desc" };
    } else {
        next = null; // third click removes the criterion
    }

    if (!additive) {
        return next ? [next] : [];
    }

    const rest = sortSpec.filter((s) => s.key !== key);
    return next ? [...rest, next] : rest;
}
