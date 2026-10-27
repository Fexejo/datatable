// Filter logic: value filters (pick concrete values) and pattern filters
// (operator + operand, type-dependent). Plus global full-text search.

import { getCellValue, isEmptyValue, toBoolean, toDate, toNumber, typeGroup } from "./util.js";
import { toText } from "./formatters.js";
import { textCollator } from "./comparators.js";

/** @typedef {import("../types.js").Column} Column */
/** @typedef {import("../types.js").Filter} Filter */
/** @typedef {import("../types.js").PatternFilter} PatternFilter */
/** @typedef {import("../types.js").Row} Row */
/** @typedef {{ id: string, label: string, arity: number }} Operator */

// Pattern operators per type family. `arity` = number of operands.
/** @type {Record<"text"|"number"|"date"|"boolean", Operator[]>} */
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

// Longest RegEx operand that is applied; a longer one matches nothing. JS has
// no timeout for a RegExp, so this does not rule out catastrophic
// backtracking (a short `(a+)+$` is enough), it only bounds the input.
export const MAX_REGEX_LENGTH = 256;

/** @param {string} [type] */
export function operatorsForType(type) {
    return OPERATORS[typeGroup(type)] ?? OPERATORS.text;
}

/**
 * @param {string|undefined} type
 * @param {string} operatorId
 * @returns {Operator|null}
 */
export function operatorMeta(type, operatorId) {
    return operatorsForType(type).find((o) => o.id === operatorId) ?? null;
}

/**
 * @param {any} value
 * @param {string} operator
 * @param {any} operand
 */
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
        default: return true;
    }
}

/**
 * @param {any} value
 * @param {string} operator
 * @param {any} operand
 * @param {any} operand2
 */
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

/**
 * @param {any} value
 * @param {string} operator
 * @param {any} operand
 * @param {any} operand2
 */
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
/**
 * @param {any} value
 * @param {string} operator
 */
function matchesBoolean(value, operator) {
    if (operator === "isTrue") return toBoolean(value);
    if (operator === "isFalse") return !toBoolean(value);
    return true;
}

// The RegExp of a "regex" operand (case-insensitive), or null when it is
// invalid or longer than MAX_REGEX_LENGTH.
/**
 * @param {any} operand
 * @returns {RegExp|null}
 */
function compileRegex(operand) {
    const source = String(operand ?? "");
    if (source.length > MAX_REGEX_LENGTH) return null;
    try {
        return new RegExp(source, "i");
    } catch {
        return null;
    }
}

// A test of one pattern filter against a raw value; a RegEx is compiled once,
// not per row.
/**
 * @param {PatternFilter} filter
 * @param {string} [type]
 * @returns {(value: any) => boolean}
 */
function patternMatcher(filter, type) {
    const { operator, operand, operand2 } = filter;
    const group = typeGroup(type);
    if (group === "number") return (value) => matchesNumber(value, operator, operand, operand2);
    if (group === "date") return (value) => matchesDate(value, operator, operand, operand2);
    if (group === "boolean") return (value) => matchesBoolean(value, operator);
    if (operator === "regex") {
        const regex = compileRegex(operand);
        return (value) => regex !== null && regex.test(String(value ?? ""));
    }
    return (value) => matchesText(value, operator, operand);
}

// Tests a single pattern filter against a raw value.
/**
 * @param {any} value
 * @param {PatternFilter} filter
 * @param {string} [type]
 */
export function matchesPattern(value, filter, type) {
    return patternMatcher(filter, type)(value);
}

// Text conditions test the displayed text (enum labels, custom formatters),
// like the global search; numbers and dates test the raw value.
/**
 * @param {any} value
 * @param {Column} column
 * @param {string} locale
 * @param {Row} row
 */
function patternSubject(value, column, locale, row) {
    if (typeGroup(column.type) !== "text" || isEmptyValue(value)) return value;
    return toText(value, column, locale, row);
}

// Applies all active column filters (AND) and optional global search. Returns a new array.
/**
 * @template {Row} R
 * @param {R[]} data
 * @param {Record<string, Filter>} filters
 * @param {Column[]} columns
 * @param {{ locale?: string, globalSearch?: string }} [options]
 * @returns {R[]}
 */
export function applyFilters(data, filters, columns, { locale = "en-US", globalSearch = "" } = {}) {
    const columnByKey = new Map(columns.map((c) => [c.key, c]));
    const activeFilters = Object.entries(filters || {}).flatMap(([key, filter]) => {
        const column = columnByKey.get(key);
        if (!column || !isActiveFilter(filter)) return [];
        return [filter.kind === "value"
            ? { column, match: null, values: new Set(filter.values.map(String)) }
            : { column, match: patternMatcher(filter, column.type), values: null }];
    });
    const search = String(globalSearch || "").trim().toLowerCase();
    const searchableColumns = columns.filter((c) => c.searchable !== false);

    if (activeFilters.length === 0 && !search) return data.slice();

    return data.filter((row) => {
        for (const { column, match, values } of activeFilters) {
            const value = getCellValue(row, column);
            if (values) {
                if (!values.has(String(value))) return false;
            } else if (match && !match(patternSubject(value, column, locale, row))) {
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

/** @param {Filter|null|undefined} filter */
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
/**
 * @param {Row[]} data
 * @param {Column} column
 * @returns {{ value: any, label: string, count: number }[]}
 */
export function distinctValues(data, column, locale = "en-US") {
    /** @type {Map<string, { value: any, label: string, count: number }>} */
    const map = new Map();
    for (const row of data) {
        const raw = getCellValue(row, column);
        const key = String(raw);
        const entry = map.get(key);
        if (entry) {
            entry.count += 1;
        } else {
            map.set(key, { value: raw, label: toText(raw, column, locale, row), count: 1 });
        }
    }
    const collator = textCollator(locale);
    return Array.from(map.values()).sort((a, b) => collator.compare(String(a.label), String(b.label)));
}

// Short text for an active filter, e.g. "Anna, Ben +2 more" or "between 10 and 20"
// (shown in the filter summary). Values and operands use the column's display format.
/**
 * @param {Filter} filter
 * @param {Column & { optionsMap?: Record<string, any>|null }} column
 * @param {{ t: import("./i18n.js").Translations, locale?: string, maxValues?: number }} options
 * @returns {string}
 */
export function describeFilter(filter, column, { t, locale = "en-US", maxValues = 3 }) {
    if (filter.kind === "value") {
        const labels = filter.values.map((value) => toText(value, column, locale) || t.emptyValue);
        const shown = labels.slice(0, maxValues).join(", ");
        return labels.length > maxValues ? `${shown} ${t.moreValues(labels.length - maxValues)}` : shown;
    }
    const meta = operatorMeta(column.type, filter.operator);
    const operator = t.operators[/** @type {keyof typeof t.operators} */ (filter.operator)] ?? meta?.label ?? filter.operator;
    const arity = meta?.arity ?? filter.arity ?? 1;
    // Operands without a custom formatter: they are not cell values of a row.
    const plain = { type: column.type, format: column.format, options: column.options, optionsMap: column.optionsMap };
    /** @param {any} value */
    const operand = (value) => {
        if (typeGroup(column.type) === "text") return t.quoted(String(value));
        // A date input gives "YYYY-MM-DD", which is a local date (as in the filter), not UTC.
        const [y, m, d] = String(value).split("-").map(Number);
        const local = column.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(y, m - 1, d) : value;
        return toText(local, plain, locale);
    };
    if (arity === 0) return operator;
    if (arity >= 2) return `${operator} ${t.range(operand(filter.operand), operand(filter.operand2))}`;
    return `${operator} ${operand(filter.operand)}`;
}
