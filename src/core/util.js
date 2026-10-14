// Shared helpers for the jw-datatable component.
// Kept framework-free so modules (formatting, sorting, filtering, CSV, …)
// can be tested and reused in isolation.

// Reads a nested value via a dot path ("address.city").
/**
 * @param {any} obj
 * @param {string} path
 * @returns {any}
 */
export function getByPath(obj, path) {
    if (obj == null || path == null) return undefined;
    if (typeof path !== "string" || path.indexOf(".") === -1) return obj[path];
    return path.split(".").reduce((/** @type {any} */ acc, key) => (acc == null ? undefined : acc[key]), obj);
}

// Resolves the raw cell value. A column may supply the value via `key`
// (including dot paths) or an `accessor` function.
/**
 * @param {import("../types.js").Row|null|undefined} row
 * @param {Pick<import("../types.js").Column, "key"|"accessor">} column
 * @returns {any}
 */
export function getCellValue(row, column) {
    if (row == null) return undefined;
    if (typeof column.accessor === "function") return column.accessor(row);
    return getByPath(row, column.key);
}

// Empty values: null, undefined, empty string, or NaN.
/** @param {any} value */
export function isEmptyValue(value) {
    return (
        value === null ||
        value === undefined ||
        value === "" ||
        (typeof value === "number" && Number.isNaN(value))
    );
}

// Robust date conversion from Date, timestamp (number), or ISO string.
/**
 * @param {any} value
 * @returns {Date|null}
 */
export function toDate(value) {
    if (value == null || value === "") return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

// Lenient number parsing (accepts comma as decimal separator).
/**
 * @param {any} value
 * @returns {number}
 */
export function toNumber(value) {
    if (typeof value === "number") return value;
    if (value == null || value === "") return NaN;
    if (typeof value === "boolean") return value ? 1 : 0;
    return Number(String(value).trim().replace(/\s/g, "").replace(",", "."));
}

// Lenient boolean parsing (true, "true", 1, "1", "yes", "ja").
/** @param {any} value */
export function toBoolean(value) {
    return value === true || value === 1 || value === "1" || value === "true"
        || value === "yes" || value === "ja";
}

/**
 * @template {any[]} A
 * @param {(...args: A) => void} fn
 * @returns {((...args: A) => void) & { cancel: () => void }}
 */
export function debounce(fn, wait = 200) {
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer;
    /** @param {A} args */
    const wrapped = (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
    return Object.assign(wrapped, { cancel: () => clearTimeout(timer) });
}

let counter = 0;
export function uid(prefix = "k") {
    counter += 1;
    return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// Shortens `text` to `max` characters with an ellipsis.
/** @param {any} text */
export function truncate(text, max = 30) {
    const str = String(text);
    return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// Maps concrete column types to one of four families. Drives default formatting,
// sort comparison, and available filter operators.
export const TYPE_GROUPS = {
    number: ["number", "float", "integer", "currency", "percent"],
    date: ["date", "datetime", "time"],
    boolean: ["boolean"],
    text: ["string", "text", "enum", "select"]
};

/**
 * @param {string} [type]
 * @returns {"number"|"date"|"boolean"|"text"}
 */
export function typeGroup(type = "string") {
    if (TYPE_GROUPS.number.includes(type)) return "number";
    if (TYPE_GROUPS.date.includes(type)) return "date";
    if (TYPE_GROUPS.boolean.includes(type)) return "boolean";
    return "text";
}

// URL schemes a link may use; anything else (javascript:, data:, vbscript:, …)
// could run code in the page when clicked.
const SAFE_URL_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

// `url` when it is relative or uses a safe scheme, else null. Browsers ignore
// whitespace and control characters inside a scheme ("java\tscript:"), so
// they are removed before the check.
/**
 * @param {unknown} url
 * @returns {string|null}
 */
export function safeUrl(url) {
    if (typeof url !== "string") return null;
    const trimmed = url.trim();
    // eslint-disable-next-line no-control-regex -- see above
    const scheme = /^([^/?#]*?):/.exec(trimmed.replace(/[\u0000- ]/g, ""))?.[1];
    return scheme === undefined || SAFE_URL_SCHEMES.has(scheme.toLowerCase()) ? trimmed : null;
}
