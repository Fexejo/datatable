// Shared helpers for the jw-datatable component.
// Kept framework-free so modules (formatting, sorting, filtering, CSV, …)
// can be tested and reused in isolation.

// Reads a nested value via a dot path ("address.city").
export function getByPath(obj, path) {
    if (obj == null || path == null) return undefined;
    if (typeof path !== "string" || path.indexOf(".") === -1) return obj[path];
    return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

// Resolves the raw cell value. A column may supply the value via `key`
// (including dot paths) or an `accessor` function.
export function getCellValue(row, column) {
    if (row == null) return undefined;
    if (typeof column.accessor === "function") return column.accessor(row);
    return getByPath(row, column.key);
}

// Empty values: null, undefined, empty string, or NaN.
export function isEmptyValue(value) {
    return (
        value === null ||
        value === undefined ||
        value === "" ||
        (typeof value === "number" && Number.isNaN(value))
    );
}

// Robust date conversion from Date, timestamp (number), or ISO string.
export function toDate(value) {
    if (value == null || value === "") return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === "number") {
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

// Lenient number parsing (accepts comma as decimal separator).
export function toNumber(value) {
    if (typeof value === "number") return value;
    if (value == null || value === "") return NaN;
    if (typeof value === "boolean") return value ? 1 : 0;
    return Number(String(value).trim().replace(/\s/g, "").replace(",", "."));
}

// Lenient boolean parsing (true, "true", 1, "1", "yes", "ja").
export function toBoolean(value) {
    return value === true || value === 1 || value === "1" || value === "true"
        || value === "yes" || value === "ja";
}

export function debounce(fn, wait = 200) {
    let timer;
    const wrapped = (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
    wrapped.cancel = () => clearTimeout(timer);
    return wrapped;
}

let counter = 0;
export function uid(prefix = "k") {
    counter += 1;
    return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// Maps concrete column types to one of four families. Drives default formatting,
// sort comparison, and available filter operators.
export const TYPE_GROUPS = {
    number: ["number", "float", "integer", "currency", "percent"],
    date: ["date", "datetime", "time"],
    boolean: ["boolean"],
    text: ["string", "text", "enum", "select"]
};

export function typeGroup(type) {
    if (TYPE_GROUPS.number.includes(type)) return "number";
    if (TYPE_GROUPS.date.includes(type)) return "date";
    if (TYPE_GROUPS.boolean.includes(type)) return "boolean";
    return "text";
}
