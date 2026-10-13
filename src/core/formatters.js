// Type-dependent display formatting.
// Each column can override defaults via `format` options or a custom `formatter`.

import { isEmptyValue, toDate, toBoolean } from "./util.js";
import { getTranslations } from "./i18n.js";

// Intl formatters are expensive to create — simple memoization.
const numberCache = new Map();
const dateCache = new Map();

function numberFormatter(locale, options) {
    const key = locale + "|" + JSON.stringify(options);
    let f = numberCache.get(key);
    if (!f) {
        f = new Intl.NumberFormat(locale, options);
        numberCache.set(key, f);
    }
    return f;
}

function dateFormatter(locale, options) {
    const key = locale + "|" + JSON.stringify(options);
    let f = dateCache.get(key);
    if (!f) {
        f = new Intl.DateTimeFormat(locale, options);
        dateCache.set(key, f);
    }
    return f;
}

function numberOptions(fmt) {
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

const DATE_DEFAULTS = {
    date: { year: "numeric", month: "2-digit", day: "2-digit" },
    datetime: { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" },
    time: { hour: "2-digit", minute: "2-digit" }
};

// Display-ready value. Usually a string; custom `formatter` may return a DOM node.
export function formatValue(value, column, locale = "en-US", row = null) {
    if (typeof column.formatter === "function") {
        return column.formatter(value, { row, column, locale });
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
            const options = { maximumFractionDigits: 0 };
            if (fmt.grouping === false) options.useGrouping = false;
            return numberFormatter(locale, options).format(num);
        }
        case "currency": {
            const num = Number(value);
            if (Number.isNaN(num)) return String(value);
            const options = { style: "currency", currency: fmt.currency ?? "EUR", ...numberOptions(fmt) };
            return numberFormatter(locale, options).format(num);
        }
        case "percent": {
            const num = Number(value);
            if (Number.isNaN(num)) return String(value);
            // Default: value is a fraction (0.5 -> 50%). With `asNumber: true` the value is
            // already scaled (50 -> 50%).
            const fraction = fmt.asNumber ? num / 100 : num;
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
export function toText(value, column, locale = "en-US", row = null) {
    const out = formatValue(value, column, locale, row);
    if (typeof out === "string") return out;
    if (out && typeof out.textContent === "string") return out.textContent;
    return value == null ? "" : String(value);
}
