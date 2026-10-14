// The entries of a header's, cell's or card's context menu: details, sorting,
// quick filters, copying, column order, pinning, visibility and export.
// DOM-free: returns the items for ui/contextMenu.js; `on` carries the actions.

import { toText } from "../core/formatters.js";
import { truncate, typeGroup } from "../core/util.js";

/** @typedef {import("../types.js").NormalizedColumn} Column */
/** @typedef {import("../types.js").Row} Row */
/** @typedef {import("../types.js").Filter} Filter */
/** @typedef {import("../ui/contextMenu.js").MenuItem} MenuItem */

/**
 * @typedef {object} MenuContext
 * @property {import("../core/i18n.js").Translations} t
 * @property {string} locale
 * @property {Column} column
 * @property {Row|null} row              Null for a header.
 * @property {any} value
 * @property {Required<import("../types.js").Features>} features
 * @property {boolean} details           Records have a details dialog.
 * @property {boolean} sorted            The column is a sort key.
 * @property {boolean} filtered          The column has an active filter.
 * @property {boolean} pinned
 * @property {{ index: number, count: number, changed: boolean }} order
 *     Position among the shown columns; `changed`: differs from the configured order.
 * @property {MenuActions} on
 */

/**
 * @typedef {object} MenuActions
 * @property {() => void} details
 * @property {(direction: "asc"|"desc"|null, additive?: boolean) => void} sort
 * @property {(filter: Filter|null) => void} filter
 * @property {() => void} openFilter
 * @property {(text: string) => void} copyCell     Gets the displayed text.
 * @property {() => void} copyRow
 * @property {() => void} copyColumn
 * @property {(index: number) => void} move
 * @property {() => void} resetOrder
 * @property {(pinned: boolean) => void} pin
 * @property {() => void} hide
 * @property {() => void} exportData
 */

/**
 * @param {MenuContext} ctx
 * @returns {MenuItem[]}
 */
export function contextMenuItems(ctx) {
    const { t, column, row, value, features, on } = ctx;
    /** @type {MenuItem[]} */
    const items = [];
    const group = typeGroup(column.type);
    const label = row ? toText(value, column, ctx.locale, row) : "";

    if (row && ctx.details) {
        items.push({ label: t.showDetails, icon: "maximize-2", onSelect: () => on.details() });
        items.push({ separator: true });
    }

    if (column.sortable) {
        items.push({ label: t.sortAsc, icon: "arrow-up", onSelect: () => on.sort("asc") });
        items.push({ label: t.sortDesc, icon: "arrow-down", onSelect: () => on.sort("desc") });
        if (features.multiSort) items.push({ label: t.addSortKey, icon: "arrow-up-down", onSelect: () => on.sort("asc", true) });
        if (ctx.sorted) items.push({ label: t.removeSortKey, icon: "x", onSelect: () => on.sort(null, true) });
        items.push({ separator: true });
    }

    if (column.filterable) {
        if (row) {
            items.push({
                label: t.filterByValue(truncate(label)),
                icon: "list-filter",
                onSelect: () => on.filter({ kind: "value", values: [value] })
            });
            if (group === "text" || group === "number") {
                items.push({
                    label: t.excludeValue(truncate(label)),
                    icon: "x",
                    // Numbers compare the raw value; text compares the displayed text.
                    onSelect: () => on.filter({
                        kind: "pattern", operator: "notEquals", operand: group === "number" ? value : label, arity: 1
                    })
                });
            }
        }
        items.push({ label: t.openFilter, icon: "list-filter", onSelect: () => on.openFilter() });
        if (ctx.filtered) items.push({ label: t.clearColumnFilter, icon: "x", onSelect: () => on.filter(null) });
        items.push({ separator: true });
    }

    if (row) {
        items.push({ label: t.copyCell, icon: "copy", onSelect: () => on.copyCell(label) });
        items.push({ label: t.copyRow, icon: "copy", onSelect: () => on.copyRow() });
    }
    items.push({ label: t.copyColumn, icon: "copy", onSelect: () => on.copyColumn() });

    if (features.columnVisibility || features.columnPinning || features.columnReorder) items.push({ separator: true });
    if (features.columnReorder) items.push(...moveItems(ctx));
    if (features.columnPinning) {
        items.push(ctx.pinned
            ? { label: t.unpinColumn, icon: "pin-off", onSelect: () => on.pin(false) }
            : { label: t.pinColumn, icon: "pin", onSelect: () => on.pin(true) });
    }
    if (features.columnVisibility) items.push({ label: t.hideColumn, icon: "eye-off", onSelect: () => on.hide() });

    if (features.export) {
        items.push({ separator: true });
        items.push({ label: t.exportMenu, icon: "download", onSelect: () => on.exportData() });
    }
    return items;
}

// Moves that are possible from the column's position, plus a reset.
/**
 * @param {MenuContext} ctx
 * @returns {MenuItem[]}
 */
function moveItems({ t, order: { index, count, changed }, on }) {
    /** @type {MenuItem[]} */
    const items = [];
    if (index > 0) {
        items.push({ label: t.moveLeft, icon: "arrow-left", onSelect: () => on.move(index - 1) });
        items.push({ label: t.moveToStart, icon: "arrow-left-to-line", onSelect: () => on.move(0) });
    }
    if (index >= 0 && index < count - 1) {
        items.push({ label: t.moveRight, icon: "arrow-right", onSelect: () => on.move(index + 1) });
        items.push({ label: t.moveToEnd, icon: "arrow-right-to-line", onSelect: () => on.move(count - 1) });
    }
    if (changed) items.push({ label: t.resetColumnOrder, onSelect: () => on.resetOrder() });
    return items;
}
