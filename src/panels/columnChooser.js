// Column chooser: a visibility switch per column, plus pin and move buttons
// when those features are on. Top of the list = left in the table.

import { el, iconEl, switchEl, deepActiveElement } from "../ui/dom.js";

// `columns()`: all columns in display order. `isHidden(column)`,
// `isPinned(column)`: current state. `pinning`, `reorder`: show those
// controls. `onToggle(key, visible)`, `onPin(key, pinned)`, `onMove(key, step)`.
// Returns { panel, sync }: `sync()` brings an open chooser in line with the
// current order and pins.
export function buildColumnChooser({ t, columns, isHidden, isPinned, pinning, reorder, onToggle, onPin, onMove }) {
    const list = el("div", { class: "k-dt-check-list" });
    for (const column of columns()) {
        const check = switchEl(column.label, !isHidden(column), {
            onchange: (e) => onToggle(column.key, e.target.checked)
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
        const rows = new Map(Array.from(list.children).map((row) => [row.dataset.key, row]));
        const ordered = columns().map((c) => rows.get(c.key)).filter(Boolean);
        const active = deepActiveElement();
        const anchor = ordered.find((row) => row.contains(active));
        const at = ordered.indexOf(anchor);
        ordered.forEach((row, i) => {
            if (i < at) list.insertBefore(row, anchor);
            else if (i > at) list.appendChild(row);
        });
        const byKey = new Map(columns().map((c) => [c.key, c]));
        ordered.forEach((row, i) => {
            row.querySelector(".k-dt-pin-toggle")?.setAttribute("aria-pressed", String(isPinned(byKey.get(row.dataset.key))));
            const [up, down] = row.querySelectorAll(".k-dt-move-btn");
            if (up) up.disabled = i === 0;
            if (down) down.disabled = i === ordered.length - 1;
        });
        // A move button that just got disabled hands focus to its neighbour.
        if (active?.disabled && anchor) anchor.querySelector(".k-dt-move-btn:not(:disabled)")?.focus();
    };
    return { panel, sync };
}
