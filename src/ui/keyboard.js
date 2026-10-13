// Keyboard navigation inside the table body and the card grid
// (roving tabindex: one tab stop, arrow keys move between items).

import { clamp } from "../core/util.js";

// Makes `container` a single tab stop over its `selector` items. The item
// whose focus key is `rememberedKey` keeps the tab stop across re-renders;
// `onFocus(key)` reports the newly focused item. `onKey(event, item)` gets
// keydowns on the items themselves (links/buttons inside keep their keys).
export function initRoving(container, selector, { rememberedKey, onFocus, onKey }) {
    const items = Array.from(container.querySelectorAll(selector));
    if (!items.length) return;
    const remembered = rememberedKey && items.find((i) => i.dataset.fk === rememberedKey);
    (remembered || items[0]).tabIndex = 0;

    container.addEventListener("focusin", (event) => {
        const item = event.target.closest(selector);
        if (!item || !container.contains(item)) return;
        items.forEach((i) => { i.tabIndex = i === item ? 0 : -1; });
        onFocus(item.dataset.fk);
    });
    container.addEventListener("keydown", (event) => {
        const item = event.target.closest(selector);
        if (item && event.target === item) onKey(event, item);
    });
}

// The cell an arrow key, Home/End (with Ctrl: first/last row) leads to from
// `cell`, or null for other keys.
export function tableCellTarget(event, cell) {
    const rows = Array.from(cell.closest("tbody").rows);
    const colCount = cell.parentElement.cells.length;
    let r = rows.indexOf(cell.parentElement);
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
