// Export — builds CSV (RFC 4180), XLSX or JSON from rows and columns and
// downloads it, entirely in the browser (no backend).

import { getCellValue, isEmptyValue } from "../core/util.js";
import { toText } from "../core/formatters.js";
import { buildXLSX } from "./xlsx.js";

/** @typedef {import("../types.js").Column} Column */
/** @typedef {import("../types.js").Row} Row */
/** @typedef {import("../types.js").ExportOptions["format"]} ExportFormat */
/**
 * Options of the builders: export options plus the locale and the XLSX sheet name.
 * @typedef {Partial<import("../types.js").ExportOptions> & { locale?: string, sheet?: string }} BuildOptions
 */

// `text`: can go to the clipboard (XLSX is binary).
/** @type {Record<ExportFormat, { extension: string, mime: string, bom: boolean, text: boolean }>} */
export const EXPORT_FORMATS = {
    csv: { extension: "csv", mime: "text/csv;charset=utf-8", bom: true, text: true },
    xlsx: { extension: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bom: false, text: false },
    json: { extension: "json", mime: "application/json;charset=utf-8", bom: false, text: true }
};

// `destination`: "download" | "clipboard"; `scope`: "page" | "filtered" | "all";
// `names`: "label" | "key" (unset: see `defaultNames()`).
/** @type {import("../types.js").ExportOptions} */
export const EXPORT_DEFAULTS = {
    format: "csv",
    destination: "download",
    scope: "filtered",
    allColumns: false,
    localized: false,
    headers: true,
    names: undefined,
    metadata: false,
    delimiter: ";"
};

// JSON property names are keys; headers in CSV and XLSX are labels.
/**
 * @param {string} [format]
 * @returns {"label"|"key"}
 */
export function defaultNames(format) {
    return format === "json" ? "key" : "label";
}

// ---- Values ---------------------------------------------------------------

// Raw value as plain data: dates as ISO strings, empty values as null.
/** @param {any} value */
export function rawValue(value) {
    if (isEmptyValue(value)) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    return value;
}

// Export value of one cell: `exportFormatter` wins, then the displayed text
// (`localized`) or the raw value (XLSX keeps Date objects to type the cell).
/**
 * @param {Row} row
 * @param {Column} column
 * @returns {any}
 */
export function exportValue(row, column, { locale = "en-US", localized = false, format = "csv" } = {}) {
    const raw = getCellValue(row, column);
    if (typeof column.exportFormatter === "function") {
        return column.exportFormatter(raw, { row, column, locale, localized, format });
    }
    if (localized) return toText(raw, column, locale, row);
    if (format === "xlsx") return isEmptyValue(raw) ? null : raw;
    return rawValue(raw);
}

/** @param {any} value */
function valueToText(value) {
    if (value == null) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

// Columns with `exportable: false` are never exported.
/**
 * @template {Column} C
 * @param {C[]} columns
 */
export function exportColumns(columns) {
    return columns.filter((c) => c.exportable !== false);
}

/**
 * @param {Column} column
 * @param {string|undefined} names
 */
function columnName(column, names) {
    return names === "key" ? column.key : (column.label ?? column.key);
}

/**
 * @param {BuildOptions} options
 * @param {ExportFormat} format
 */
function resolveOptions(options, format) {
    const opts = { ...EXPORT_DEFAULTS, ...options };
    opts.names ??= defaultNames(format);
    return opts;
}

// ---- CSV ------------------------------------------------------------------

// A cell starting with one of these is run as a formula by spreadsheet apps
// (CSV / formula injection, OWASP), including the full-width variants.
const FORMULA_START = /^[=+\-@\t\r＝＋－＠]/;
// Signed numbers (also formatted, e.g. "-1.234,56 €", "-$5", "+12 %") stay as
// they are: digits, separators and currency signs cannot call anything.
const PLAIN_NUMBER = /^[+-]?[\p{Sc}\s]*\d[\d\s.,'’]*(?:[eE][+-]?\d+)?[\s%‰\p{Sc}]*$/u;

// Prefixes a quote so spreadsheet apps show the text instead of running it.
/** @param {string} text */
export function neutralizeFormula(text) {
    return FORMULA_START.test(text) && !PLAIN_NUMBER.test(text) ? "'" + text : text;
}

/**
 * @param {any} value
 * @param {string} delimiter
 */
function escapeField(value, delimiter) {
    const text = neutralizeFormula(valueToText(value));
    if (text.includes('"') || text.includes(delimiter) || text.includes("\n") || text.includes("\r")) {
        return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
}

// Builds the CSV string. Columns are exported as given (filtered by `exportable`).
/**
 * @param {Row[]} rows
 * @param {Column[]} columns
 * @param {BuildOptions} [options]
 */
export function buildCSV(rows, columns, options = {}) {
    const { locale = "en-US", delimiter, headers, names, localized } = resolveOptions(options, "csv");
    const cols = exportColumns(columns);
    const lines = [];
    if (headers) lines.push(cols.map((c) => escapeField(columnName(c, names), delimiter)).join(delimiter));
    for (const row of rows) {
        lines.push(cols.map((c) => escapeField(exportValue(row, c, { locale, localized, format: "csv" }), delimiter)).join(delimiter));
    }
    return lines.join("\r\n");
}

// ---- JSON -----------------------------------------------------------------

// Array of objects. A name used twice falls back to the column key.
// `metadata`: { columns: [{ key, label, type }], data: [...] } instead, shaped
// like the table's own config (`key` is the property name in `data`).
/**
 * @param {Row[]} rows
 * @param {Column[]} columns
 * @param {BuildOptions} [options]
 */
export function buildJSON(rows, columns, options = {}) {
    const { locale = "en-US", names, localized, metadata } = resolveOptions(options, "json");
    const cols = exportColumns(columns);
    const used = new Set();
    const keys = cols.map((c) => {
        const name = columnName(c, names);
        const unique = used.has(name) ? c.key : name;
        used.add(unique);
        return unique;
    });
    const records = rows.map((row) => Object.fromEntries(
        cols.map((c, i) => [keys[i], exportValue(row, c, { locale, localized, format: "json" }) ?? null])
    ));
    if (!metadata) return JSON.stringify(records, null, 2);
    const info = cols.map((c, i) => ({ key: keys[i], label: c.label ?? c.key, ...(c.type ? { type: c.type } : {}) }));
    return JSON.stringify({ columns: info, data: records }, null, 2);
}

// ---- XLSX -----------------------------------------------------------------

// One worksheet; numbers, booleans and dates stay typed unless `localized`.
// Cells are written as text or values, never as formulas.
/**
 * @param {Row[]} rows
 * @param {Column[]} columns
 * @param {BuildOptions} [options]
 */
export function buildSheet(rows, columns, options = {}) {
    const { locale = "en-US", headers, names, localized, sheet } = resolveOptions(options, "xlsx");
    const cols = exportColumns(columns);
    return buildXLSX({
        sheet,
        header: headers ? cols.map((c) => columnName(c, names)) : null,
        columns: cols,
        rows: rows.map((row) => cols.map((c) => exportValue(row, c, { locale, localized, format: "xlsx" }))),
        text: localized
    });
}

// String for CSV / JSON, Uint8Array for XLSX.
/**
 * @param {Row[]} rows
 * @param {Column[]} columns
 * @param {BuildOptions} [options]
 * @returns {string|Uint8Array<ArrayBuffer>}
 */
export function buildExport(rows, columns, options = {}) {
    if (options.format === "json") return buildJSON(rows, columns, options);
    if (options.format === "xlsx") return buildSheet(rows, columns, options);
    return buildCSV(rows, columns, options);
}

// ---- File name & download ---------------------------------------------------

const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");

// Local time, safe in file names: 2026-10-12_14-30-05
export function timestamp(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

// Removes characters that are not allowed in file names.
/** @param {string|null|undefined} name */
export function sanitizeFilename(name) {
    // eslint-disable-next-line no-control-regex -- control characters are invalid in file names
    return String(name ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim();
}

// `base` plus timestamp and extension, e.g. "Members_2026-10-12_14-30-05.csv".
/**
 * @param {string|undefined} base
 * @param {ExportFormat} [format]
 */
export function defaultFilename(base, format = "csv", date = new Date()) {
    return `${sanitizeFilename(base) || "export"}_${timestamp(date)}.${EXPORT_FORMATS[format].extension}`;
}

// Appends the format's extension unless the name already ends with it.
/**
 * @param {string} filename
 * @param {ExportFormat} [format]
 */
export function withExtension(filename, format = "csv") {
    const ext = "." + EXPORT_FORMATS[format].extension;
    const name = sanitizeFilename(filename) || "export";
    return name.toLowerCase().endsWith(ext) ? name : name + ext;
}

// Starts the download. A leading BOM helps Excel detect UTF-8 in CSV files.
/**
 * @param {string|Uint8Array<ArrayBuffer>} content
 * @param {string} filename
 * @param {ExportFormat} [format]
 */
export function downloadFile(content, filename, format = "csv") {
    const { mime, bom } = EXPORT_FORMATS[format];
    const blob = new Blob([bom ? "\uFEFF" + content : content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
