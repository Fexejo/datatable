// Table state — sort, filters, search, paging, layout and column arrangement —
// as plain data, plus the pure operations on it. The component owns one state
// object and renders it; everything here is DOM-free.
//
// Shape:
//   { sort: [{ key, direction }], filters: { [key]: filter }, globalSearch,
//     page, pageSize, layout, hiddenColumns: Set, pinnedColumns: [key],
//     columnOrder: [key] }
// `pinnedColumns` is in pin order; `columnOrder` lists every column key.

import { applyFilters, isActiveFilter } from "./filtering.js";
import { sortData } from "./comparators.js";
import { paginate } from "./pagination.js";

// The initial state from `config.initial` and the column definitions.
// `defaults`: { pageSize, layout } used when `initial` has none.
export function createState(columns, initial = {}, defaults = {}) {
    const keys = columns.map((c) => c.key);
    initial = knownColumnsOnly(initial, keys);
    return {
        sort: initial.sort ? initial.sort.slice() : [],
        filters: copyFilters(initial.filters),
        globalSearch: initial.globalSearch || "",
        page: initial.page || 1,
        pageSize: initial.pageSize || defaults.pageSize,
        layout: initial.layout || defaults.layout || "table",
        hiddenColumns: new Set(initial.hiddenColumns || columns.filter((c) => c.hidden).map((c) => c.key)),
        pinnedColumns: (initial.pinnedColumns || columns.filter((c) => c.pinned).map((c) => c.key)).slice(),
        columnOrder: normalizeOrder(initial.columnOrder, keys)
    };
}

// Applies a partial (serialized) state, e.g. from `setState()` or a saved view.
// Returns a new state; references to unknown columns are dropped.
export function mergeState(state, partial, keys) {
    partial = knownColumnsOnly(partial, keys);
    const next = { ...state };
    if (partial.sort) next.sort = partial.sort.slice();
    if (partial.filters) next.filters = copyFilters(partial.filters);
    if (partial.globalSearch != null) next.globalSearch = partial.globalSearch;
    if (partial.pageSize) next.pageSize = partial.pageSize;
    if (partial.page) next.page = partial.page;
    if (partial.layout) next.layout = partial.layout;
    if (partial.hiddenColumns) next.hiddenColumns = new Set(partial.hiddenColumns);
    if (partial.pinnedColumns) next.pinnedColumns = partial.pinnedColumns.slice();
    if (partial.columnOrder) next.columnOrder = normalizeOrder(partial.columnOrder, keys);
    return next;
}

// Plain, JSON-safe copy of the state (`getState()`, events, saved views).
// Saved views omit `page` (a saved view opens on page 1).
export function serializeState(state, { includePage = true } = {}) {
    const filters = {};
    for (const [key, filter] of Object.entries(state.filters)) {
        if (!isActiveFilter(filter)) continue;
        filters[key] = filter.kind === "value"
            ? { kind: "value", values: filter.values.slice() }
            : { kind: "pattern", operator: filter.operator, operand: filter.operand, operand2: filter.operand2, arity: filter.arity };
    }
    const result = {
        sort: state.sort.slice(),
        filters,
        globalSearch: state.globalSearch,
        pageSize: state.pageSize,
        layout: state.layout,
        hiddenColumns: Array.from(state.hiddenColumns),
        pinnedColumns: state.pinnedColumns.slice(),
        columnOrder: state.columnOrder.slice()
    };
    if (includePage) result.page = state.page;
    return result;
}

// A serialized view state with order-independent parts sorted, so the same
// view reached by different clicks compares equal.
export function viewSignature(viewState) {
    const state = { ...viewState, hiddenColumns: viewState.hiddenColumns.slice().sort() };
    state.filters = Object.fromEntries(Object.entries(viewState.filters)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, f]) => [key, f.kind === "value" ? { ...f, values: f.values.map(String).sort() } : f]));
    return JSON.stringify(state);
}

function copyFilters(filters) {
    const result = {};
    for (const [key, filter] of Object.entries(filters || {})) {
        if (filter && filter.kind) result[key] = { ...filter };
    }
    return result;
}

// Number of active filters, counting the global search as one.
export function activeFilterCount(state, { globalSearch = true } = {}) {
    const count = Object.values(state.filters).filter(isActiveFilter).length;
    return count + (globalSearch && state.globalSearch ? 1 : 0);
}

// ---- Columns ------------------------------------------------------------

// Column keys in the given order; unknown and repeated keys are dropped,
// missing columns keep their configured order at the end.
export function normalizeOrder(order, keys) {
    const known = (Array.isArray(order) ? order : []).filter((key, i, all) => keys.includes(key) && all.indexOf(key) === i);
    return [...known, ...keys.filter((key) => !known.includes(key))];
}

// Drops references to columns that do not exist (e.g. in a view saved
// before the column configuration changed).
export function knownColumnsOnly(state, keys) {
    const known = new Set(keys);
    const result = { ...state };
    if (Array.isArray(state.sort)) result.sort = state.sort.filter((s) => known.has(s?.key));
    if (state.filters) result.filters = Object.fromEntries(Object.entries(state.filters).filter(([key]) => known.has(key)));
    for (const list of ["hiddenColumns", "pinnedColumns"]) {
        if (Array.isArray(state[list])) result[list] = state[list].filter((key) => known.has(key));
    }
    return result;
}

// Keys of the pinned columns, or none when pinning is off.
export function pinnedKeys(state, pinning) {
    return pinning ? state.pinnedColumns : [];
}

// All columns (including hidden ones) in display order: pinned columns
// first (in pin order), then the others in `columnOrder`.
export function orderedColumns(columns, state, { pinning = false } = {}) {
    const byKey = new Map(columns.map((c) => [c.key, c]));
    const ordered = state.columnOrder.map((key) => byKey.get(key)).filter(Boolean);
    const pinned = pinnedKeys(state, pinning).map((key) => byKey.get(key)).filter(Boolean);
    return pinned.length ? [...pinned, ...ordered.filter((c) => !pinned.includes(c))] : ordered;
}

// Moves column `key` to index `target` within `keys` (the columns as the user
// sees them, in display order). Pinned columns form a block at the front: a
// column moved into it gets pinned, a pinned one moved out of it gets
// unpinned; right at the boundary it keeps its state.
// Returns { pinnedColumns, columnOrder, pinned, wasPinned }, or null when
// nothing moves.
export function moveColumn(state, keys, key, target, { pinning = false } = {}) {
    const from = keys.indexOf(key);
    if (from < 0) return null;
    target = Math.min(Math.max(target, 0), keys.length - 1);
    if (target === from) return null;
    const isPinned = (k) => pinnedKeys(state, pinning).includes(k);
    const wasPinned = isPinned(key);
    const rest = keys.filter((k) => k !== key);
    const pinnedCount = rest.filter(isPinned).length;
    const pinned = pinning && (wasPinned ? target <= pinnedCount : target < pinnedCount);
    rest.splice(target, 0, key);

    let { pinnedColumns, columnOrder } = state;
    if (pinned) {
        const block = rest.slice(0, pinnedCount + 1);
        pinnedColumns = [...block, ...pinnedColumns.filter((k) => !block.includes(k))];
    } else {
        pinnedColumns = pinnedColumns.filter((k) => k !== key);
        // Place it next to its new unpinned neighbour; everything else keeps its order.
        const unpinned = rest.slice(pinnedCount);
        const at = unpinned.indexOf(key);
        const order = columnOrder.filter((k) => k !== key);
        const next = unpinned[at + 1];
        const prev = unpinned[at - 1];
        if (next) order.splice(order.indexOf(next), 0, key);
        else if (prev) order.splice(order.indexOf(prev) + 1, 0, key);
        else order.push(key);
        columnOrder = order;
    }
    return { pinnedColumns, columnOrder, pinned, wasPinned };
}

// ---- Rows -----------------------------------------------------------------

// Filtered and sorted rows (`viewData`) and the rows of the current page
// (`pageData`, all rows without pagination). `page` is clamped to the pages
// that exist.
export function deriveRows(source, state, columns, { locale, globalSearch = true, pagination = true } = {}) {
    const filtered = applyFilters(source, state.filters, columns, {
        locale,
        globalSearch: globalSearch ? state.globalSearch : ""
    });
    const viewData = sortData(filtered, state.sort, columns, locale);
    if (!pagination) return { viewData, pageData: viewData, page: 1, pageCount: 1 };
    const { page, pageCount, rows } = paginate(viewData, state.page, state.pageSize);
    return { viewData, pageData: rows, page, pageCount };
}
