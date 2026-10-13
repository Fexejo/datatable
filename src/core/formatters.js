// Type-dependent display formatting.
// Each column can override defaults via `format` options or a custom `formatter`.

import { isEmptyValue, toDate, toBoolean } from "./util.js";
import { getTranslations } from "./i18n.js";

/** @typedef {import("../types.js").ColumnFormat} ColumnFormat */
/**
 * What formatting reads of a column (operands are formatted without a formatter).
 * @typedef {Pick<import("../types.js").Column, "formatter"|"emptyText"|"type"|"format"|"options">
 *     & { optionsMap?: Record<string, any>|null }} FormatColumn
 */

// Intl formatters are expensive to create — simple memoization.
/** @type {Map<string, Intl.NumberFormat>} */
const numberCache = new Map();
/** @type {Map<string, Intl.DateTimeFormat>} */
const dateCache = new Map();

/**
 * @param {string} locale
 * @param {Intl.NumberFormatOptions} options
 */
function numberFormatter(locale, options) {
    const key = locale + "|" + JSON.stringify(options);
    let f = numberCache.get(key);
    if (!f) {
        f = new Intl.NumberFormat(locale, options);
        numberCache.set(key, f);
    }
    return f;
}

/**
 * @param {string} locale
 * @param {Intl.DateTimeFormatOptions} options
 */
function dateFormatter(locale, options) {
    const key = locale + "|" + JSON.stringify(options);
    let f = dateCache.get(key);
    if (!f) {
        f = new Intl.DateTimeFormat(locale, options);
        dateCache.set(key, f);
    }
    return f;
}

/** @param {ColumnFormat} fmt */
function numberOptions(fmt) {
    /** @type {Intl.NumberFormatOptions} */
    const options = {};
    if (fmt.decimals != null) {
        options.minimumFractionDigits = fmt.decimals;
        options.maximumFractionDigits = fmt.decimals;
    }
    if (fmt.minimumFractionDigits != null) options.minimumFractionDigits = fmt.minimumFractionDigits;
    if (fmt.maximumFractionDigits != null) options.maximumFractionDigits = fmt.maximumFractionDigits;
    if (fmt.grouping === false) options.useGrouping = false;
    return options;
}

/** @type {Record<string, Intl.DateTimeFormatOptions>} */
const DATE_DEFAULTS = {
    date: { year: "numeric", month: "2-digit", day: "2-digit" },
    datetime: { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" },
    time: { hour: "2-digit", minute: "2-digit" }
};

// Display-ready value. Usually a string; custom `formatter` may return a DOM node.
/**
 * @param {any} value
 * @param {FormatColumn} column
 * @param {import("../types.js").Row|null} [row]
 * @returns {string|Node}
 */
export function formatValue(value, column, locale = "en-US", row = null) {
    if (typeof column.formatter === "function") {
        return column.formatter(value, { row, column: /** @type {import("../types.js").Column} */ (column), locale });
    }
    if (isEmptyValue(value)) return column.emptyText ?? "";

    const type = column.type ?? "string";
    const fmt = column.format ?? {};

    switch (type) {
        case "number":
        case "float": {
            const num = Number(value);
            if (Number.isNaN(num)) return String(value);
            return numberFormatter(locale, numberOptions(fmt)).format(num);
        }
        case "integer": {
            const num = Number(value);
            if (Number.isNaN(num)) return String(value);
            /** @type {Intl.NumberFormatOptions} */
            const options = { maximumFractionDigits: 0 };
            if (fmt.grouping === false) options.useGrouping = false;
            return numberFormatter(locale, options).format(num);
        }
        case "currency": {
            const num = Number(value);
            if (Number.isNaN(num)) return String(value);
            /** @type {Intl.NumberFormatOptions} */
            const options = { style: "currency", currency: fmt.currency ?? "EUR", ...numberOptions(fmt) };
            return numberFormatter(locale, options).format(num);
        }
        case "percent": {
            const num = Number(value);
            if (Number.isNaN(num)) return String(value);
            // Default: value is a fraction (0.5 -> 50%). With `asNumber: true` the value is
            // already scaled (50 -> 50%).
            const fraction = fmt.asNumber ? num / 100 : num;
            /** @type {Intl.NumberFormatOptions} */
            const options = { style: "percent", ...numberOptions(fmt) };
            if (fmt.decimals == null && fmt.maximumFractionDigits == null) options.maximumFractionDigits = 1;
            return numberFormatter(locale, options).format(fraction);
        }
        case "boolean": {
            const t = getTranslations(locale);
            return toBoolean(value) ? (fmt.trueLabel ?? t.boolTrue) : (fmt.falseLabel ?? t.boolFalse);
        }
        case "date":
        case "datetime":
        case "time": {
            const date = toDate(value);
            if (!date) return String(value);
            return dateFormatter(locale, fmt.options ?? DATE_DEFAULTS[type]).format(date);
        }
        case "enum":
        case "select": {
            const labels = fmt.labels ?? column.optionsMap ?? null;
            if (labels && Object.prototype.hasOwnProperty.call(labels, value)) return labels[value];
            if (Array.isArray(column.options)) {
                const match = column.options.find((o) => o.value === value);
                if (match) return match.label ?? String(match.value);
            }
            return String(value);
        }
        default:
            return String(value);
    }
}

// Plain cell text — for CSV export, copy, and global search.
// Falls back to textContent or raw value when a node is returned.
/**
 * @param {any} value
 * @param {FormatColumn} column
 * @param {import("../types.js").Row|null} [row]
 * @returns {string}
 */
export function toText(value, column, locale = "en-US", row = null) {
    const out = formatValue(value, column, locale, row);
    if (typeof out === "string") return out;
    if (out && typeof out.textContent === "string") return out.textContent;
    return value == null ? "" : String(value);
}
