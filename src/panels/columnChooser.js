// Column chooser: a visibility switch per column, plus pin and move buttons
// when those features are on. Top of the list = left in the table.

import { el, iconEl, switchEl, deepActiveElement } from "../ui/dom.js";

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
    const list = el("div", { class: "k-dt-check-list" });
    for (const column of columns()) {
        const check = switchEl(column.label, !isHidden(column), {
            onchange: (/** @type {Event & { currentTarget: HTMLInputElement }} */ e) => onToggle(column.key, e.currentTarget.checked)
        });
        if (!pinning && !reorder) { list.appendChild(check); continue; }
        const row = el("div", { class: "k-dt-col-row", "data-key": column.key }, [check]);
        if (pinning) {
            // Toggle button: constant name, state in aria-pressed.
            row.appendChild(el("button", {
                type: "button",
                class: "k-dt-pin-toggle",
                title: t.pinColumn,
                "aria-label": t.pinColumnNamed(column.label),
                "aria-pressed": String(isPinned(column)),
                onclick: () => onPin(column.key, !isPinned(column))
            }, [iconEl("pin")]));
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
                class: "k-dt-icon-btn k-dt-move-btn",
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
    const panel = el("div", { class: "k-dt-panel" }, [
        el("div", { class: "k-dt-panel-head", text: t.columnsPanel }),
        list
    ]);

    // Rows are moved around the focused one (moving it would drop focus).
    const sync = () => {
        if (!list.isConnected) return;
        const children = /** @type {HTMLElement[]} */ (Array.from(list.children));
        const rows = new Map(children.map((row) => [row.dataset.key, row]));
        const ordered = columns().flatMap((c) => rows.get(c.key) ?? []);
        const active = /** @type {(HTMLElement & { disabled?: boolean })|null} */ (deepActiveElement());
        const anchor = ordered.find((row) => row.contains(active));
        const at = anchor ? ordered.indexOf(anchor) : -1;
        ordered.forEach((row, i) => {
            if (i < at) list.insertBefore(row, anchor ?? null);
            else if (i > at) list.appendChild(row);
        });
        const byKey = new Map(columns().map((c) => [c.key, c]));
        ordered.forEach((row, i) => {
            row.querySelector(".k-dt-pin-toggle")?.setAttribute("aria-pressed", String(isPinned(byKey.get(row.dataset.key ?? ""))));
            /** @type {NodeListOf<HTMLButtonElement>} */
            const moveButtons = row.querySelectorAll(".k-dt-move-btn");
            const [up, down] = moveButtons;
            if (up) up.disabled = i === 0;
            if (down) down.disabled = i === ordered.length - 1;
        });
        // A move button that just got disabled hands focus to its neighbour.
        if (active?.disabled && anchor) /** @type {HTMLElement|null} */ (anchor.querySelector(".k-dt-move-btn:not(:disabled)"))?.focus();
    };
    return { panel, sync };
}
