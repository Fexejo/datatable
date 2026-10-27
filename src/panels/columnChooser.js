// Column chooser: a visibility switch per column, plus pin and move buttons
// when those features are on. Top of the list = left in the table. A hidden
// column can't be pinned or unpinned (its pin button is disabled); it keeps
// its pin and shows up pinned again.

import { el, iconEl, switchEl, deepActiveElement, reorderAroundFocus } from "../ui/dom.js";

/** @typedef {import("../types.js").NormalizedColumn} Column */

// `columns()`: all columns in display order. `isHidden(column)`,
// `isPinned(column)`: current state. `pinning`, `reorder`: show those
// controls. `onToggle(key, visible)`, `onPin(key, pinned)`, `onMove(key, step)`.
// Returns { panel, sync }: `sync()` brings an open chooser in line with the
// current order and pins.
/**
 * @param {{ t: import("../core/i18n.js").Translations, columns: () => Column[],
 *     isHidden: (column: Column) => boolean, isPinned: (column: Column|undefined) => boolean,
 *     pinning: boolean, reorder: boolean, onToggle: (key: string, visible: boolean) => void,
 *     onPin: (key: string, pinned: boolean) => void, onMove: (key: string, step: number) => void }} options
 * @returns {{ panel: HTMLElement, sync: () => void }}
 */
export function buildColumnChooser({ t, columns, isHidden, isPinned, pinning, reorder, onToggle, onPin, onMove }) {
    const list = el("div", { class: "jw-dt-check-list" });
    // Toggle button: constant name, state in aria-pressed; disabled while the column is hidden.
    /**
     * @param {HTMLButtonElement} button
     * @param {Column} column
     */
    const syncPin = (button, column) => {
        const hidden = isHidden(column);
        button.setAttribute("aria-pressed", String(isPinned(column)));
        button.disabled = hidden;
        button.title = hidden ? t.pinHiddenColumn : t.pinColumn;
    };
    for (const column of columns()) {
        const check = switchEl(column.label, !isHidden(column), {
            onchange: (/** @type {Event & { currentTarget: HTMLInputElement }} */ e) => onToggle(column.key, e.currentTarget.checked)
        });
        if (!pinning && !reorder) { list.appendChild(check); continue; }
        const row = el("div", { class: "jw-dt-col-row", "data-key": column.key }, [check]);
        if (pinning) {
            const pin = el("button", {
                type: "button",
                class: "jw-dt-pin-toggle",
                "aria-label": t.pinColumnNamed(column.label),
                onclick: () => onPin(column.key, !isPinned(column))
            }, [iconEl("pin")]);
            syncPin(pin, column);
            row.appendChild(pin);
        }
        if (reorder) {
            /**
             * @param {string} direction
             * @param {number} step
             * @param {string} icon
             * @param {string} title
             * @param {string} label
             */
            const moveButton = (direction, step, icon, title, label) => el("button", {
                type: "button",
                class: "jw-dt-icon-btn jw-dt-move-btn",
                "data-fk": `colmove:${direction}:${column.key}`,
                title,
                "aria-label": label,
                onclick: () => onMove(column.key, step)
            }, [iconEl(icon)]);
            row.appendChild(moveButton("up", -1, "arrow-up", t.moveUp, t.moveUpNamed(column.label)));
            row.appendChild(moveButton("down", 1, "arrow-down", t.moveDown, t.moveDownNamed(column.label)));
        }
        list.appendChild(row);
    }
    const panel = el("div", { class: "jw-dt-panel" }, [
        el("div", { class: "jw-dt-panel-head", text: t.columnsPanel }),
        list
    ]);

    // Rows are moved around the focused one (see `reorderAroundFocus`); pin
    // buttons follow the pins and the visibility.
    const sync = () => {
        if (!list.isConnected) return;
        const children = /** @type {HTMLElement[]} */ (Array.from(list.children));
        const rows = new Map(children.map((row) => [row.dataset.key, row]));
        const ordered = columns().flatMap((c) => rows.get(c.key) ?? []);
        const active = /** @type {(HTMLElement & { disabled?: boolean })|null} */ (deepActiveElement());
        const anchor = reorderAroundFocus(list, ordered);
        const byKey = new Map(columns().map((c) => [c.key, c]));
        ordered.forEach((row, i) => {
            /** @type {HTMLButtonElement|null} */
            const pin = row.querySelector(".jw-dt-pin-toggle");
            const column = byKey.get(row.dataset.key ?? "");
            if (pin && column) syncPin(pin, column);
            /** @type {NodeListOf<HTMLButtonElement>} */
            const moveButtons = row.querySelectorAll(".jw-dt-move-btn");
            const [up, down] = moveButtons;
            if (up) up.disabled = i === 0;
            if (down) down.disabled = i === ordered.length - 1;
        });
        // A move button that just got disabled hands focus to its neighbour.
        if (active?.disabled && anchor) /** @type {HTMLElement|null} */ (anchor.querySelector(".jw-dt-move-btn:not(:disabled)"))?.focus();
    };
    return { panel, sync };
}
