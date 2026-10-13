// Filter logic: value filters (pick concrete values) and pattern filters
// (operator + operand, type-dependent). Plus global full-text search.

import { getCellValue, isEmptyValue, toBoolean, toDate, toNumber, typeGroup } from "./util.js";
import { toText } from "./formatters.js";

// Pattern operators per type family. `arity` = number of operands.
export const OPERATORS = {
    text: [
        { id: "contains", label: "contains", arity: 1 },
        { id: "notContains", label: "does not contain", arity: 1 },
        { id: "equals", label: "equals", arity: 1 },
        { id: "notEquals", label: "does not equal", arity: 1 },
        { id: "startsWith", label: "starts with", arity: 1 },
        { id: "endsWith", label: "ends with", arity: 1 },
        { id: "regex", label: "RegEx", arity: 1 },
        { id: "empty", label: "is empty", arity: 0 },
        { id: "notEmpty", label: "is not empty", arity: 0 }
    ],
    number: [
        { id: "equals", label: "=", arity: 1 },
        { id: "notEquals", label: "≠", arity: 1 },
        { id: "gt", label: ">", arity: 1 },
        { id: "gte", label: "≥", arity: 1 },
        { id: "lt", label: "<", arity: 1 },
        { id: "lte", label: "≤", arity: 1 },
        { id: "between", label: "between", arity: 2 },
        { id: "empty", label: "is empty", arity: 0 },
        { id: "notEmpty", label: "is not empty", arity: 0 }
    ],
    date: [
        { id: "on", label: "on", arity: 1 },
        { id: "before", label: "before", arity: 1 },
        { id: "after", label: "after", arity: 1 },
        { id: "between", label: "between", arity: 2 },
        { id: "empty", label: "is empty", arity: 0 },
        { id: "notEmpty", label: "is not empty", arity: 0 }
    ],
    boolean: [
        { id: "isTrue", label: "is true", arity: 0 },
        { id: "isFalse", label: "is false", arity: 0 }
    ]
};

export function operatorsForType(type) {
    return OPERATORS[typeGroup(type)] ?? OPERATORS.text;
}

export function operatorMeta(type, operatorId) {
    return operatorsForType(type).find((o) => o.id === operatorId) ?? null;
}

function matchesText(value, operator, operand) {
    if (operator === "empty") return isEmptyValue(value);
    if (operator === "notEmpty") return !isEmptyValue(value);
    const haystack = String(value ?? "").toLowerCase();
    const needle = String(operand ?? "").toLowerCase();
    switch (operator) {
        case "contains": return haystack.includes(needle);
        case "notContains": return !haystack.includes(needle);
        case "equals": return haystack === needle;
        case "notEquals": return haystack !== needle;
        case "startsWith": return haystack.startsWith(needle);
        case "endsWith": return haystack.endsWith(needle);
        case "regex": {
            try {
                return new RegExp(operand, "i").test(String(value ?? ""));
            } catch {
                return false;
            }
        }
        default: return true;
    }
}

function matchesNumber(value, operator, operand, operand2) {
    if (operator === "empty") return isEmptyValue(value);
    if (operator === "notEmpty") return !isEmptyValue(value);
    if (isEmptyValue(value)) return false;
    const num = toNumber(value);
    const a = toNumber(operand);
    switch (operator) {
        case "equals": return num === a;
        case "notEquals": return num !== a;
        case "gt": return num > a;
        case "gte": return num >= a;
        case "lt": return num < a;
        case "lte": return num <= a;
        case "between": {
            const b = toNumber(operand2);
            const lo = Math.min(a, b);
            const hi = Math.max(a, b);
            return num >= lo && num <= hi;
        }
        default: return true;
    }
}

function matchesDate(value, operator, operand, operand2) {
    if (operator === "empty") return isEmptyValue(value);
    if (operator === "notEmpty") return !isEmptyValue(value);
    const date = toDate(value);
    if (!date) return false;
    const t = date.getTime();
    const a = toDate(operand);
    switch (operator) {
        case "on": {
            if (!a) return false;
            return date.toDateString() === a.toDateString();
        }
        case "before": return a ? t < a.getTime() : false;
        case "after": return a ? t > a.getTime() : false;
        case "between": {
            const b = toDate(operand2);
            if (!a || !b) return false;
            const lo = Math.min(a.getTime(), b.getTime());
            const hi = Math.max(a.getTime(), b.getTime());
            return t >= lo && t <= hi;
        }
        default: return true;
    }
}

// Same reading of truthy values as the display ("yes" shows as Yes).
function matchesBoolean(value, operator) {
    if (operator === "isTrue") return toBoolean(value);
    if (operator === "isFalse") return !toBoolean(value);
    return true;
}

// Tests a single pattern filter against a raw value.
export function matchesPattern(value, filter, type) {
    const group = typeGroup(type);
    if (group === "number") return matchesNumber(value, filter.operator, filter.operand, filter.operand2);
    if (group === "date") return matchesDate(value, filter.operator, filter.operand, filter.operand2);
    if (group === "boolean") return matchesBoolean(value, filter.operator);
    return matchesText(value, filter.operator, filter.operand);
}

// Text conditions test the displayed text (enum labels, custom formatters),
// like the global search; numbers and dates test the raw value.
function patternSubject(value, column, locale, row) {
    if (typeGroup(column.type) !== "text" || isEmptyValue(value)) return value;
    return toText(value, column, locale, row);
}

// Applies all active column filters (AND) and optional global search. Returns a new array.
export function applyFilters(data, filters, columns, { locale = "en-US", globalSearch = "" } = {}) {
    const columnByKey = new Map(columns.map((c) => [c.key, c]));
    const activeFilters = Object.entries(filters || {}).filter(([, f]) => isActiveFilter(f));
    const search = String(globalSearch || "").trim().toLowerCase();
    const searchableColumns = columns.filter((c) => c.searchable !== false);

    if (activeFilters.length === 0 && !search) return data.slice();

    return data.filter((row) => {
        for (const [key, filter] of activeFilters) {
            const column = columnByKey.get(key);
            if (!column) continue;
            const value = getCellValue(row, column);
            if (filter.kind === "value") {
                const set = filter._set || (filter._set = new Set(filter.values.map((v) => String(v))));
                if (!set.has(String(value))) return false;
            } else if (!matchesPattern(patternSubject(value, column, locale, row), filter, column.type)) {
                return false;
            }
        }
        if (search) {
            const hit = searchableColumns.some((column) =>
                toText(getCellValue(row, column), column, locale, row).toLowerCase().includes(search)
            );
            if (!hit) return false;
        }
        return true;
    });
}

export function isActiveFilter(filter) {
    if (!filter) return false;
    if (filter.kind === "value") return Array.isArray(filter.values) && filter.values.length > 0;
    if (filter.kind === "pattern") {
        if (!filter.operator) return false;
        const arity = filter.arity ?? 1;
        if (arity === 0) return true;
        if (arity >= 1 && isEmptyValue(filter.operand)) return false;
        if (arity >= 2 && isEmptyValue(filter.operand2)) return false;
        return true;
    }
    return false;
}

// Distinct column values with counts — basis for the value-filter checkbox list.
export function distinctValues(data, column, locale = "en-US") {
    const map = new Map();
    for (const row of data) {
        const raw = getCellValue(row, column);
        const key = String(raw);
        if (map.has(key)) {
            map.get(key).count += 1;
        } else {
            map.set(key, { value: raw, label: toText(raw, column, locale, row), count: 1 });
        }
    }
    return Array.from(map.values()).sort((a, b) =>
        String(a.label).localeCompare(String(b.label), locale, { numeric: true, sensitivity: "base" })
    );
}
