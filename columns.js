// Infer column definitions from a list of objects —
// useful for dynamic or server-named datasets.

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
