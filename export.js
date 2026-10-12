// Export — builds CSV (RFC 4180) or JSON from rows and columns and downloads
// it, entirely in the browser (no backend).

import { getCellValue, isEmptyValue } from "./util.js";
import { toText } from "./formatters.js";

export const EXPORT_FORMATS = {
    csv: { extension: "csv", mime: "text/csv;charset=utf-8", bom: true },
    json: { extension: "json", mime: "application/json;charset=utf-8", bom: false }
};

// `scope`: "page" | "filtered" | "all"; `names`: "label" | "key".
export const EXPORT_DEFAULTS = {
    format: "csv",
    scope: "filtered",
    allColumns: false,
    localized: false,
    headers: true,
    names: "label",
    delimiter: ";"
};

// ---- Values ---------------------------------------------------------------

// Raw value as plain data: dates as ISO strings, empty values as null.
export function rawValue(value) {
    if (isEmptyValue(value)) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    return value;
}

// Export value of one cell: `exportFormatter` wins, then the displayed text
// (`localized`) or the raw value.
export function exportValue(row, column, { locale = "en-US", localized = false, format = "csv" } = {}) {
    const raw = getCellValue(row, column);
    if (typeof column.exportFormatter === "function") {
        return column.exportFormatter(raw, { row, column, locale, localized, format });
    }
    return localized ? toText(raw, column, locale, row) : rawValue(raw);
}

function valueToText(value) {
    if (value == null) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

// Columns with `exportable: false` are never exported.
export function exportColumns(columns) {
    return columns.filter((c) => c.exportable !== false);
}

function columnName(column, names) {
    return names === "key" ? column.key : (column.label ?? column.key);
}

// ---- CSV ------------------------------------------------------------------

// A cell starting with one of these is run as a formula by spreadsheet apps
// (CSV / formula injection, OWASP), including the full-width variants.
const FORMULA_START = /^[=+\-@\t\r＝＋－＠]/;
// Signed numbers (also formatted, e.g. "-1.234,56 €", "-$5", "+12 %") stay as
// they are: digits, separators and currency signs cannot call anything.
const PLAIN_NUMBER = /^[+-]?[\p{Sc}\s]*\d[\d\s.,'’]*(?:[eE][+-]?\d+)?[\s%‰\p{Sc}]*$/u;

// Prefixes a quote so spreadsheet apps show the text instead of running it.
export function neutralizeFormula(text) {
    return FORMULA_START.test(text) && !PLAIN_NUMBER.test(text) ? "'" + text : text;
}

function escapeField(value, delimiter) {
    const text = neutralizeFormula(valueToText(value));
    if (text.includes('"') || text.includes(delimiter) || text.includes("\n") || text.includes("\r")) {
        return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
}

// Builds the CSV string. Columns are exported as given (filtered by `exportable`).
export function buildCSV(rows, columns, options = {}) {
    const { locale = "en-US", delimiter, headers, names, localized } = { ...EXPORT_DEFAULTS, ...options };
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
export function buildJSON(rows, columns, options = {}) {
    const { locale = "en-US", names, localized } = { ...EXPORT_DEFAULTS, ...options };
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
    return JSON.stringify(records, null, 2);
}

export function buildExport(rows, columns, options = {}) {
    return options.format === "json" ? buildJSON(rows, columns, options) : buildCSV(rows, columns, options);
}

// ---- File name & download ---------------------------------------------------

const pad = (n) => String(n).padStart(2, "0");

// Local time, safe in file names: 2026-10-12_14-30-05
export function timestamp(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

// Removes characters that are not allowed in file names.
export function sanitizeFilename(name) {
    return String(name ?? "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim();
}

// `base` plus timestamp and extension, e.g. "Members_2026-10-12_14-30-05.csv".
export function defaultFilename(base, format = "csv", date = new Date()) {
    return `${sanitizeFilename(base) || "export"}_${timestamp(date)}.${EXPORT_FORMATS[format].extension}`;
}

// Appends the format's extension unless the name already ends with it.
export function withExtension(filename, format = "csv") {
    const ext = "." + EXPORT_FORMATS[format].extension;
    const name = sanitizeFilename(filename) || "export";
    return name.toLowerCase().endsWith(ext) ? name : name + ext;
}

// Starts the download. A leading BOM helps Excel detect UTF-8 in CSV files.
export function downloadFile(content, filename, format = "csv") {
    const { mime, bom } = EXPORT_FORMATS[format];
    const blob = new Blob([bom ? "﻿" + content : content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
