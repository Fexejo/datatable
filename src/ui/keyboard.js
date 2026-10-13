// Keyboard navigation inside the table body and the card grid
// (roving tabindex: one tab stop, arrow keys move between items).

import { clamp } from "../core/util.js";

// Makes `container` a single tab stop over its `selector` items. The item
// whose focus key is `rememberedKey` keeps the tab stop across re-renders;
// `onFocus(key)` reports the newly focused item. `onKey(event, item)` gets
// keydowns on the items themselves (links/buttons inside keep their keys).
// Only the current tab stop is tracked, so a focus move costs the same on any
// number of items.
/**
 * @param {HTMLElement} container
 * @param {string} selector
 * @param {{ rememberedKey?: string|null, onFocus: (key: string|undefined) => void,
 *     onKey: (event: KeyboardEvent, item: HTMLElement) => void }} options
 */
export function initRoving(container, selector, { rememberedKey, onFocus, onKey }) {
    /** @type {HTMLElement|null} */
    const remembered = rememberedKey
        ? container.querySelector(`${selector}[data-fk="${CSS.escape(rememberedKey)}"]`)
        : null;
    /** @type {HTMLElement|null} */
    let current = remembered || container.querySelector(selector);
    if (!current) return;
    current.tabIndex = 0;

    container.addEventListener("focusin", (event) => {
        /** @type {HTMLElement|null} */
        const item = /** @type {Element} */ (event.target).closest(selector);
        if (!item || !container.contains(item)) return;
        if (item !== current) {
            if (current) current.tabIndex = -1;
            item.tabIndex = 0;
            current = item;
        }
        onFocus(item.dataset.fk);
    });
    container.addEventListener("keydown", (event) => {
        /** @type {HTMLElement|null} */
        const item = /** @type {Element} */ (event.target).closest(selector);
        if (item && event.target === item) onKey(event, item);
    });
}

// The cell an arrow key, Home/End (with Ctrl: first/last row) leads to from
// `cell`, or null for other keys.
/**
 * @param {KeyboardEvent} event
 * @param {HTMLTableCellElement} cell
 * @returns {HTMLTableCellElement|null}
 */
export function tableCellTarget(event, cell) {
    const row = /** @type {HTMLTableRowElement} */ (cell.parentElement);
    const rows = Array.from(/** @type {HTMLTableSectionElement} */ (cell.closest("tbody")).rows);
    const colCount = row.cells.length;
    let r = rows.indexOf(row);
    let c = cell.cellIndex;
    switch (event.key) {
        case "ArrowRight": c += 1; break;
        case "ArrowLeft": c -= 1; break;
        case "ArrowDown": r += 1; break;
        case "ArrowUp": r -= 1; break;
        case "Home": c = 0; if (event.ctrlKey) r = 0; break;
        case "End": c = colCount - 1; if (event.ctrlKey) r = rows.length - 1; break;
        default: return null;
    }
    return rows[clamp(r, 0, rows.length - 1)].cells[clamp(c, 0, colCount - 1)];
}

// The item an arrow key or Home/End leads to in a flat list, or null.
/**
 * @template T
 * @param {KeyboardEvent} event
 * @param {T} item
 * @param {T[]} items
 * @returns {T|null}
 */
export function listItemTarget(event, item, items) {
    let i = items.indexOf(item);
    switch (event.key) {
        case "ArrowRight": case "ArrowDown": i += 1; break;
        case "ArrowLeft": case "ArrowUp": i -= 1; break;
        case "Home": i = 0; break;
        case "End": i = items.length - 1; break;
        default: return null;
    }
    return items[clamp(i, 0, items.length - 1)];
}
