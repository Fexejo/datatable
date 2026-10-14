// Table layout (also the compact layout): header with sort, filter and unpin
// buttons, one row per record, pinned columns, and keyboard navigation
// between cells (roving tabindex: the body is one tab stop).
//
// Built from a `TableView`: the data to show plus callbacks. Clicks inside
// cells are handled by the component (delegated events); `register(node,
// record)` connects rows, cells and headers to their records.

import { el, iconEl } from "../ui/dom.js";
import { initRoving, tableCellTarget } from "../ui/keyboard.js";
import { bindColumnMove } from "../ui/columnDrag.js";
import { isActiveFilter } from "../core/filtering.js";
import { getCellValue, typeGroup } from "../core/util.js";
import { copyButton, valueNode } from "./values.js";

/** @typedef {import("../types.js").NormalizedColumn} Column */
/** @typedef {import("../types.js").Row} Row */

/**
 * @typedef {object} TableView
 * @property {import("../core/i18n.js").Translations} t
 * @property {string} locale
 * @property {Column[]} columns          Columns shown, in display order.
 * @property {Row[]} rows                The rows of the current page.
 * @property {boolean} compact           Compact layout: an extra details column.
 * @property {import("../types.js").SortSpec[]} sort
 * @property {Record<string, import("../types.js").Filter>} filters
 * @property {(column: Column|undefined) => boolean} isPinned
 * @property {string|null} openerKey     Focus key of the button whose panel is open.
 * @property {string|null} labelledBy    Id of the element that names the table.
 * @property {string} hintId             Id for the keyboard hint.
 * @property {string|undefined} emptyText Shown without rows.
 * @property {"wrap"|"ellipsis"} [cellOverflow]
 * @property {((row: Row, index: number) => string) | undefined} rowClass
 * @property {boolean} rowsClickable     Rows react to a click (styling).
 * @property {boolean} cellsActivatable  Enter on a plain cell clicks it.
 * @property {(row: Row) => string} recordTitle
 * @property {import("./values.js").Register} register
 * @property {{ key: string|undefined, onFocus: (key: string|undefined) => void }} roving
 * @property {boolean} multiSort
 * @property {(key: string, additive: boolean) => void} onSort
 * @property {(column: Column, anchor: HTMLElement) => void} onFilter
 * @property {(key: string) => void} onUnpin
 * @property {null|{ drag: { key: string|null }, canDrag: () => boolean,
 *     onStep: (key: string, step: number) => void,
 *     onDrop: (draggedKey: string, targetKey: string, after: boolean) => void }} reorder
 */

/**
 * @param {TableView} view
 * @returns {HTMLElement}
 */
export function buildTable(view) {
    const { t, columns, compact } = view;
    const headRow = el("tr", {}, columns.map((column, i) => pinCell(buildHeaderCell(view, column), i, columns, view.isPinned)));
    if (compact) {
        headRow.appendChild(el("th", { class: "k-dt-th k-dt-details-col", scope: "col" }, [
            el("span", { class: "k-dt-sr-only", text: t.details })
        ]));
    }
    const table = el("table", {
        class: "k-dt-table" + (compact ? " k-dt-table--compact" : ""),
        part: "table",
        // The toolbar title names the table for assistive tech.
        "aria-labelledby": view.labelledBy
    }, [el("thead", {}, [headRow]), buildTbody(view)]);
    if (view.rows.length === 0) return el("div", { class: "k-dt-scroll" }, [table]);
    table.setAttribute("aria-describedby", view.hintId);
    return el("div", { class: "k-dt-scroll" }, [
        el("p", { id: view.hintId, class: "k-dt-sr-only", text: compact ? t.compactKeyboardHint : t.tableKeyboardHint }),
        table
    ]);
}

/**
 * @param {TableView} view
 * @returns {HTMLTableSectionElement}
 */
export function buildTbody(view) {
    const { columns, rows, compact } = view;
    if (rows.length === 0) {
        return el("tbody", {}, [el("tr", {}, [
            el("td", { class: "k-dt-empty", colSpan: (columns.length + (compact ? 1 : 0)) || 1 }, [view.emptyText])
        ])]);
    }
    const tbody = el("tbody", {}, rows.map((row, index) => buildRow(view, row, index)));
    initRoving(tbody, ".k-dt-td", {
        rememberedKey: view.roving.key,
        onFocus: view.roving.onFocus,
        onKey: (event, cell) => onCellKey(view, event, /** @type {HTMLTableCellElement} */ (cell))
    });
    return tbody;
}

// Enter activates the cell's link, action or details button, else the cell
// (row/cell click); arrows, Home/End move between cells.
/**
 * @param {TableView} view
 * @param {KeyboardEvent} event
 * @param {HTMLTableCellElement} cell
 */
function onCellKey(view, event, cell) {
    if (event.key === "Enter") {
        /** @type {HTMLElement|null} */
        const inner = cell.querySelector(".k-dt-link, .k-dt-cell-action, .k-dt-details-btn");
        if (inner) inner.click();
        else if (view.cellsActivatable) cell.click();
        else return;
        event.preventDefault();
        return;
    }
    const target = tableCellTarget(event, cell);
    if (!target) return;
    event.preventDefault();
    target.focus();
}

// ---- Header -------------------------------------------------------------

/**
 * @param {TableView} view
 * @param {Column} column
 * @returns {HTMLTableCellElement}
 */
export function buildHeaderCell(view, column) {
    const { t } = view;
    const th = el("th", {
        class: "k-dt-th k-dt-align-" + column.align + (column.minWidth ? " k-dt-has-min" : ""),
        scope: "col",
        "data-key": column.key,
        "aria-sort": ariaSort(view.sort, column),
        style: (column.width ? `width:${column.width};` : "")
            + (column.minWidth ? `--k-dt-col-min:${column.minWidth};` : "") || null
    });

    const inner = el("div", { class: "k-dt-th-inner" });
    const labelBtn = el(column.sortable ? "button" : "span", {
        class: "k-dt-th-label",
        type: column.sortable ? "button" : null,
        "data-fk": column.sortable ? `sort:${column.key}` : null,
        title: column.sortable ? t.sortHint : null,
        onclick: column.sortable ? (e) => view.onSort(column.key, e.shiftKey && view.multiSort) : undefined
    }, [el("span", { text: column.label })]);
    if (column.sortable) labelBtn.appendChild(sortIndicator(view, column));
    inner.appendChild(labelBtn);

    if (column.filterable) {
        const active = isActiveFilter(view.filters[column.key]);
        inner.appendChild(el("button", {
            type: "button",
            class: "k-dt-filter-btn" + (active ? " is-active" : ""),
            "data-fk": `filter:${column.key}`,
            "aria-haspopup": "dialog",
            "aria-expanded": String(view.openerKey === `filter:${column.key}`),
            title: active ? t.filterActive : t.filter,
            "aria-label": t.filterPanelTitle(column.label),
            onclick: (e) => view.onFilter(column, e.currentTarget)
        }, [iconEl("list-filter")]));
    }
    if (view.isPinned(column)) inner.appendChild(unpinButton(view, column));
    th.appendChild(inner);

    view.register(th, { column, row: null, value: null });
    const { reorder } = view;
    if (reorder) {
        bindColumnMove(th, {
            key: column.key,
            label: column.label,
            drag: reorder.drag,
            canDrag: reorder.canDrag,
            onStep: (step) => reorder.onStep(column.key, step),
            onDrop: (key, after) => reorder.onDrop(key, column.key, after)
        });
    }
    return th;
}

/**
 * @param {import("../types.js").SortSpec[]} sort
 * @param {Column} column
 */
export function ariaSort(sort, column) {
    const spec = sort.find((s) => s.key === column.key);
    return spec ? (spec.direction === "asc" ? "ascending" : "descending") : "none";
}

// Sort icon, plus rank (visual) and priority (screen readers) for multi-sort.
/**
 * @param {Pick<TableView, "t"|"sort">} view
 * @param {Column} column
 */
export function sortIndicator({ t, sort }, column) {
    const sortIndex = sort.findIndex((s) => s.key === column.key);
    const spec = sortIndex >= 0 ? sort[sortIndex] : null;
    const icon = spec ? (spec.direction === "asc" ? "arrow-up" : "arrow-down") : "arrow-up-down";
    const wrap = el("span", { class: "k-dt-sort-ind" }, [
        iconEl(icon, "k-dt-sort-ic" + (spec ? " is-active" : ""))
    ]);
    if (spec && sort.length > 1) {
        wrap.appendChild(el("span", { class: "k-dt-sort-rank", "aria-hidden": "true", text: String(sortIndex + 1) }));
        wrap.appendChild(el("span", { class: "k-dt-sr-only", text: t.sortPriority(sortIndex + 1) }));
    }
    return wrap;
}

// Shown in the header of pinned columns.
/**
 * @param {Pick<TableView, "t"|"onUnpin">} view
 * @param {Column} column
 */
function unpinButton({ t, onUnpin }, column) {
    return el("button", {
        type: "button",
        class: "k-dt-pin-btn",
        "data-fk": `pin:${column.key}`,
        title: t.unpinColumn,
        "aria-label": t.unpinColumnNamed(column.label),
        onclick: (event) => {
            // This button goes away: move focus to the column's header button
            // first, so it stays on the same element while the column moves.
            /** @type {HTMLElement|null|undefined} */
            const headerButton = event.currentTarget.closest("th")?.querySelector("button.k-dt-th-label, .k-dt-filter-btn");
            headerButton?.focus();
            onUnpin(column.key);
        }
    }, [iconEl("pin")]);
}

// Brings a reused header cell's pinned state (sticky offset, unpin button) up to date.
/**
 * @param {Pick<TableView, "t"|"onUnpin"|"isPinned">} view
 * @param {HTMLTableCellElement} th
 * @param {number} index
 * @param {Column[]} columns
 */
export function updateHeaderPin(view, th, index, columns) {
    th.classList.remove("k-dt-pinned", "k-dt-pinned-last");
    th.style.removeProperty("--k-dt-pin-left");
    pinCell(th, index, columns, view.isPinned);
    const button = th.querySelector(".k-dt-pin-btn");
    if (view.isPinned(columns[index])) {
        if (!button) th.querySelector(".k-dt-th-inner")?.appendChild(unpinButton(view, columns[index]));
    } else {
        button?.remove();
    }
}

// Marks the cell at `index` as pinned (sticky offset + last-pinned edge).
/**
 * @template {HTMLTableCellElement} T
 * @param {T} cell
 * @param {number} index
 * @param {Column[]} columns
 * @param {(column: Column|undefined) => boolean} isPinned
 * @returns {T}
 */
function pinCell(cell, index, columns, isPinned) {
    if (!isPinned(columns[index])) return cell;
    cell.classList.add("k-dt-pinned");
    cell.style.setProperty("--k-dt-pin-left", `var(--k-dt-pin-${index})`);
    if (!isPinned(columns[index + 1])) cell.classList.add("k-dt-pinned-last");
    return cell;
}

// ---- Body ---------------------------------------------------------------

/**
 * @param {TableView} view
 * @param {Row} row
 * @param {number} index
 */
function buildRow(view, row, index) {
    const { columns } = view;
    const tr = el("tr", { class: "k-dt-tr" + (view.rowsClickable ? " k-dt-clickable" : "") });
    if (view.rowClass) {
        const cls = view.rowClass(row, index);
        if (cls) tr.classList.add(...String(cls).split(/\s+/));
    }
    view.register(tr, { row, index });
    columns.forEach((column, i) => tr.appendChild(pinCell(buildCell(view, column, row, index), i, columns, view.isPinned)));
    if (view.compact) tr.appendChild(buildDetailsCell(view, row, index));
    return tr;
}

// Last cell of a compact row: the button that opens the record's details.
/**
 * @param {TableView} view
 * @param {Row} row
 * @param {number} index
 */
function buildDetailsCell(view, row, index) {
    const { t } = view;
    const td = el("td", { class: "k-dt-td k-dt-details-col", tabIndex: -1, "data-fk": `cell:${index}:#details` }, [
        el("button", {
            type: "button",
            class: "k-dt-details-btn",
            "data-fk": `details:${index}`,
            "aria-haspopup": "dialog",
            "aria-expanded": "false",
            title: t.showDetails,
            "aria-label": t.showDetailsFor(view.recordTitle(row))
        }, [iconEl("maximize-2")])
    ]);
    // Its context menu is the one of the row's first column.
    const column = view.columns[0];
    view.register(td, { column, row, value: getCellValue(row, column), index });
    return td;
}

/**
 * @param {TableView} view
 * @param {Column} column
 * @param {Row} row
 * @param {number} index
 */
function buildCell(view, column, row, index) {
    const value = getCellValue(row, column);
    const fk = `cell:${index}:${column.key}`;
    const td = el("td", { class: "k-dt-td k-dt-align-" + column.align, tabIndex: -1, "data-fk": fk });
    if (typeGroup(column.type) !== "text") td.classList.add("k-dt-nowrap");
    if (typeof column.cellClass === "function") {
        const cls = column.cellClass(value, row);
        if (cls) td.classList.add(...String(cls).split(/\s+/));
    }

    const content = el("div", { class: "k-dt-cell" }, [valueNode(column, row, value, fk, view.locale)]);
    if (column.copyable) content.appendChild(copyButton(view.t, column, fk));
    td.appendChild(content);
    // Single-line cell with an ellipsis; the full text shows as a tooltip
    // (set by the component on hover) and while the cell has focus (CSS).
    if ((column.overflow || view.cellOverflow) === "ellipsis") {
        td.classList.add("k-dt-truncate");
        if (column.maxWidth) td.style.setProperty("--k-dt-cell-max-width", column.maxWidth);
    }
    view.register(td, { column, row, value, index });
    return td;
}
