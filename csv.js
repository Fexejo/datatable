// CSV export — entirely in the browser, no backend.
// Builds RFC 4180 CSV and triggers download via Blob.

import { getCellValue } from "./util.js";
import { toText } from "./formatters.js";

function escapeField(value, delimiter) {
    const text = value == null ? "" : String(value);
    if (text.includes('"') || text.includes(delimiter) || text.includes("\n") || text.includes("\r")) {
        return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
}

// Builds the CSV string from rows and columns.
// Only visible columns with `exportable !== false` are included.
export function buildCSV(rows, columns, { locale = "en-US", delimiter = ";", includeHeaders = true } = {}) {
    const exportColumns = columns.filter((c) => !c.hidden && c.exportable !== false);
    const lines = [];

    if (includeHeaders) {
        lines.push(exportColumns.map((c) => escapeField(c.label ?? c.key, delimiter)).join(delimiter));
    }

    for (const row of rows) {
        const cells = exportColumns.map((column) => {
            const raw = getCellValue(row, column);
            const text = typeof column.exportFormatter === "function"
                ? column.exportFormatter(raw, { row, column, locale })
                : toText(raw, column, locale, row);
            return escapeField(text, delimiter);
        });
        lines.push(cells.join(delimiter));
    }

    return lines.join("\r\n");
}

// Starts the download. Leading BOM helps Excel detect UTF-8 correctly.
export function downloadCSV(csv, filename = "export.csv") {
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.endsWith(".csv") ? filename : filename + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
