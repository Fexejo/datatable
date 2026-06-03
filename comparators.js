// Sorting — including stable multi-column sort.
// JS engines sort stably since ES2019; we rely on that for secondary keys.

import { getCellValue, isEmptyValue, toDate, toNumber, typeGroup } from "./util.js";

// Compares two raw values by column type. Empty values always sort last
// (direction is applied in `sortData` so empties stay at the bottom).
export function compareValues(a, b, type, locale = "en-US") {
    const aEmpty = isEmptyValue(a);
    const bEmpty = isEmptyValue(b);
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;

    const group = typeGroup(type);
    if (group === "number") {
        return toNumber(a) - toNumber(b);
    }
    if (group === "date") {
        const da = toDate(a);
        const db = toDate(b);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.getTime() - db.getTime();
    }
    if (group === "boolean") {
        return (a ? 1 : 0) - (b ? 1 : 0);
    }
    return String(a).localeCompare(String(b), locale, { numeric: true, sensitivity: "base" });
}

// Sorts a copy of the data by multiple criteria.
// sortSpec: [{ key, direction: "asc" | "desc" }, …] — order = priority.
export function sortData(data, sortSpec, columns, locale = "en-US") {
    if (!Array.isArray(sortSpec) || sortSpec.length === 0) return data.slice();
    const columnByKey = new Map(columns.map((c) => [c.key, c]));

    return data.slice().sort((rowA, rowB) => {
        for (const spec of sortSpec) {
            const column = columnByKey.get(spec.key);
            if (!column) continue;
            let result = compareValues(
                getCellValue(rowA, column),
                getCellValue(rowB, column),
                column.type,
                locale
            );
            // Empty values stay at the bottom — direction only flips non-empty pairs.
            const aEmpty = isEmptyValue(getCellValue(rowA, column));
            const bEmpty = isEmptyValue(getCellValue(rowB, column));
            if (spec.direction === "desc" && !(aEmpty || bEmpty)) result = -result;
            if (result !== 0) return result;
        }
        return 0;
    });
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
