// Column definitions: inference from data (useful for dynamic or
// server-named datasets) and normalization of the configured columns.

import { typeGroup } from "./util.js";

// Infers column type from the first non-empty values.
export function inferType(rows, key) {
    for (const row of rows) {
        const value = row?.[key];
        if (value == null || value === "") continue;
        if (typeof value === "boolean") return "boolean";
        if (typeof value === "number") return "number";
        if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(value)) return "date";
        return "string";
    }
    return "string";
}

// Builds column definitions from keys on the first row.
// options.overrides: { [key]: PartialColumn } — per-column overrides.
export function inferColumns(rows, options = {}) {
    const overrides = options.overrides || {};
    const sample = (Array.isArray(rows) ? rows : []).find((r) => r && typeof r === "object") || {};
    return Object.keys(sample).map((key) => ({
        key,
        label: key,
        type: inferType(rows, key),
        ...(overrides[key] || {})
    }));
}

// Fills in the defaults the component relies on. `features` switch sorting,
// filtering and copy buttons on for all columns; a column can opt out.
// `columnMinWidth`: default minimum width of text columns.
export function normalizeColumns(columns, { features = {}, columnMinWidth } = {}) {
    return columns.map((col) => {
        const type = col.type || "string";
        const group = typeGroup(type);
        const link = typeof col.link === "function" ? { url: col.link } : col.link;
        const optionsMap = col.optionsMap
            || (Array.isArray(col.options)
                ? Object.fromEntries(col.options.map((o) => [o.value, o.label ?? o.value]))
                : null);
        return {
            ...col,
            key: col.key,
            label: col.label ?? col.key,
            type,
            align: col.align || (group === "number" ? "right" : group === "boolean" ? "center" : "left"),
            sortable: !!features.sorting && col.sortable !== false,
            filterable: !!features.filtering && col.filterable !== false,
            copyable: features.copyButtons !== false && !!col.copyable,
            hidden: !!col.hidden,
            pinned: !!col.pinned,
            // Floor for the column width: explicit `minWidth`, else a fixed
            // `width`, else the global default (text columns only; numbers,
            // dates and booleans stay on one line at their natural width).
            minWidth: col.minWidth || col.width || (group === "text" ? columnMinWidth : undefined) || null,
            link,
            optionsMap
        };
    });
}
