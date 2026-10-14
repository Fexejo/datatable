// Card layout ("grid"): one card per record with an optional title value and
// a label/value list, as a list with keyboard navigation between cards
// (roving tabindex: the grid is one tab stop).

import { el } from "../ui/dom.js";
import { initRoving, listItemTarget } from "../ui/keyboard.js";
import { getCellValue } from "../core/util.js";
import { buildFields, valueNode } from "./values.js";

/** @typedef {import("../types.js").NormalizedColumn} Column */
/** @typedef {import("../types.js").Row} Row */

/**
 * @typedef {object} GridView
 * @property {import("../core/i18n.js").Translations} t
 * @property {string} locale
 * @property {Column[]} columns          Visible columns, in display order.
 * @property {Row[]} rows                The rows of the current page.
 * @property {string|undefined} titleColumn Key of the column shown as the card title.
 * @property {string} minWidth           Minimum card width.
 * @property {string|null} labelledBy    Id of the element that names the list.
 * @property {string} hintId             Id for the keyboard hint.
 * @property {string|undefined} emptyText Shown without rows.
 * @property {boolean} cardsClickable    Cards react to a click (and Enter).
 * @property {import("./values.js").Register} register
 * @property {{ key: string|undefined, onFocus: (key: string|undefined) => void }} roving
 */

/**
 * @param {GridView} view
 * @returns {Node}
 */
export function buildGrid(view) {
    const { t, columns, locale } = view;
    const grid = el("div", { class: "k-dt-grid", part: "grid", role: "list", "aria-labelledby": view.labelledBy });
    grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${view.minWidth}, 1fr))`;
    if (view.rows.length === 0) {
        grid.appendChild(el("div", { class: "k-dt-empty", text: view.emptyText }));
        return grid;
    }

    const titleColumn = view.titleColumn ? columns.find((c) => c.key === view.titleColumn) : undefined;
    const fieldColumns = columns.filter((c) => c !== titleColumn);
    view.rows.forEach((row, index) => {
        const fk = `card:${index}`;
        const card = el("div", {
            class: "k-dt-card" + (view.cardsClickable ? " k-dt-clickable" : ""),
            part: "card",
            role: "listitem",
            tabIndex: -1,
            "data-fk": fk
        });
        if (titleColumn) {
            const value = getCellValue(row, titleColumn);
            const title = el("div", { class: "k-dt-card-title" }, [
                valueNode(titleColumn, row, value, `${fk}:${titleColumn.key}`, locale)
            ]);
            view.register(title, { column: titleColumn, row, value });
            card.appendChild(title);
        }
        card.appendChild(buildFields({ t, locale, columns: fieldColumns, row, fk, register: view.register }));
        // Its context menu is the one of the first column.
        view.register(card, { column: columns[0], row, value: getCellValue(row, columns[0]), index });
        grid.appendChild(card);
    });
    initRoving(grid, ".k-dt-card", {
        rememberedKey: view.roving.key,
        onFocus: view.roving.onFocus,
        onKey: (event, card) => onCardKey(view, event, card)
    });
    grid.setAttribute("aria-describedby", view.hintId);
    // The hint sits next to the list (a list may only contain list items).
    const fragment = document.createDocumentFragment();
    fragment.append(grid, el("p", { id: view.hintId, class: "k-dt-sr-only", text: t.gridKeyboardHint }));
    return fragment;
}

// Enter clicks a clickable card; arrows, Home/End move between cards.
/**
 * @param {GridView} view
 * @param {KeyboardEvent} event
 * @param {HTMLElement} card
 */
function onCardKey(view, event, card) {
    if (event.key === "Enter") {
        if (!view.cardsClickable) return;
        event.preventDefault();
        card.click();
        return;
    }
    /** @type {HTMLElement[]} */
    const cards = Array.from(card.parentElement?.querySelectorAll(".k-dt-card") ?? []);
    const target = listItemTarget(event, card, cards);
    if (!target) return;
    event.preventDefault();
    target.focus();
}
