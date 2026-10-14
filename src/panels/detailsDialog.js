// Record details: a modal dialog with every field of one row. Previous/next
// walk through all filtered and sorted rows (across pages).

import { el, iconEl, deepActiveElement } from "../ui/dom.js";
import { clamp } from "../core/util.js";

// `rows()`: the filtered and sorted rows; `index`: the row to show first.
// `title(row)`: short name of a record ("" if none). `fields(row)`: its
// label/value list. `onNavigate(row, message)`: after previous/next.
// `onOpen(row)`: optional primary action ("Open"). `onClose()`.
/** @typedef {import("../types.js").Row} Row */
/**
 * @param {{ t: import("../core/i18n.js").Translations, rows: () => Row[], index: number,
 *     title: (row: Row) => string, fields: (row: Row) => Node,
 *     onNavigate: (row: Row, message: string) => void, onOpen?: ((row: Row) => void)|null,
 *     onClose: () => void }} options
 */
export function buildDetailsDialog({ t, rows, index, title, fields, onNavigate, onOpen, onClose }) {
    let current = index;
    const head = el("h2", { class: "jw-dt-panel-head", tabIndex: -1, "data-autofocus": "" });
    const position = el("p", { class: "jw-dt-details-pos" });
    const body = el("div", { class: "jw-dt-details-body" });
    /**
     * @param {string} icon
     * @param {string} text
     * @param {string} label
     * @param {number} step
     */
    const navButton = (icon, text, label, step) => el("button", {
        type: "button",
        class: "jw-dt-btn",
        "aria-label": label,
        onclick: () => show(current + step, true)
    }, step < 0 ? [iconEl(icon), el("span", { text })] : [el("span", { text }), iconEl(icon)]);
    const prev = navButton("chevron-left", t.previous, t.prevRecord, -1);
    const next = navButton("chevron-right", t.next, t.nextRecord, 1);
    const actions = el("div", { class: "jw-dt-panel-actions jw-dt-details-actions" }, [prev, next]);
    if (onOpen) {
        actions.prepend(el("button", {
            type: "button",
            class: "jw-dt-btn jw-dt-btn-primary jw-dt-details-open",
            text: t.openRecord,
            onclick: () => onOpen(rows()[current])
        }));
    }

    /**
     * @param {number} target
     * @param {boolean} navigated
     */
    const show = (target, navigated) => {
        const all = rows();
        current = clamp(target, 0, all.length - 1);
        const record = all[current];
        const name = title(record);
        head.textContent = name ? t.detailsTitle(name) : t.details;
        position.textContent = t.recordPosition(current + 1, all.length);
        body.replaceChildren(fields(record));
        prev.disabled = current <= 0;
        next.disabled = current >= all.length - 1;
        if (!navigated) return;
        // Focus stays on the pressed button, or moves to the other one at an end.
        const active = /** @type {(HTMLElement & { disabled?: boolean })|null} */ (deepActiveElement());
        if (!active || active.disabled) (prev.disabled ? next : prev).focus();
        onNavigate(record, name ? `${position.textContent}: ${name}` : position.textContent);
    };

    const panel = el("div", { class: "jw-dt-panel jw-dt-details" }, [
        el("div", { class: "jw-dt-details-head" }, [
            head,
            el("button", {
                type: "button",
                class: "jw-dt-icon-btn",
                title: t.close,
                "aria-label": t.close,
                onclick: onClose
            }, [iconEl("x")])
        ]),
        position,
        body,
        actions
    ]);
    show(current, false);
    return panel;
}
