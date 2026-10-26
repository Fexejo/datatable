// Filter summary: the active filters (global search and column filters) with
// their values. An entry opens that filter, its "x" removes it; "Clear all
// filters" at the bottom removes everything, "Close" next to it closes the panel.

import { el, iconEl } from "../ui/dom.js";

// `entries()`: the active filters as [{ id, label, value }], read on every
// refresh. `onEdit(id)`, `onRemove(id)`, `onClearAll()`, `onClose()`.
// Returns { panel, refresh(focusIndex) }: `refresh` rebuilds the list after a
// removal and focuses the remove button at `focusIndex` (or the last one).
// `focusId` marks the entry that takes focus when the panel opens.
/**
 * @param {{ t: import("../core/i18n.js").Translations, entries: () => { id: string, label: string, value: string }[],
 *     focusId?: string|null, onEdit: (id: string) => void, onRemove: (id: string) => void,
 *     onClearAll: () => void, onClose: () => void }} options
 * @returns {{ panel: HTMLElement, refresh: (focusIndex: number) => void }}
 */
export function buildFilterSummary({ t, entries, focusId = null, onEdit, onRemove, onClearAll, onClose }) {
    const list = el("ul", { class: "jw-dt-fsum-items", "aria-label": t.filterSummaryTitle });
    const panel = el("div", { class: "jw-dt-panel jw-dt-fsum-panel" }, [
        el("h2", { class: "jw-dt-panel-head", text: t.filterSummaryTitle }),
        list,
        el("div", { class: "jw-dt-panel-actions" }, [
            el("button", { type: "button", class: "jw-dt-btn", "data-fk": "fsum:clear", onclick: () => onClearAll() }, [
                iconEl("x"), el("span", { text: t.clearFilters })
            ]),
            el("button", { type: "button", class: "jw-dt-btn", "data-fk": "fsum:close", text: t.close, onclick: () => onClose() })
        ])
    ]);

    /** @param {string|null} autofocusId */
    const render = (autofocusId) => {
        list.replaceChildren(...entries().map(({ id, label, value }) => el("li", { class: "jw-dt-fsum-item" }, [
            el("button", {
                type: "button",
                class: "jw-dt-fsum-edit",
                "data-fk": `fsum:edit:${id}`,
                "aria-label": t.editFilterNamed(label, value),
                title: value,
                "data-autofocus": id === autofocusId ? "" : null,
                onclick: () => onEdit(id)
            }, [
                el("span", { class: "jw-dt-fsum-label", text: label }),
                // Separates the visible words ("Name Anna"), so they are part of
                // the accessible name (WCAG 2.5.3); flex layout does not render it.
                " ",
                el("span", { class: "jw-dt-fsum-value", text: value })
            ]),
            el("button", {
                type: "button",
                class: "jw-dt-icon-btn",
                "data-fk": `fsum:remove:${id}`,
                title: t.removeFilterNamed(label),
                "aria-label": t.removeFilterNamed(label),
                onclick: () => onRemove(id)
            }, [iconEl("x")])
        ])));
    };
    render(focusId);

    /** @param {number} focusIndex */
    const refresh = (focusIndex) => {
        render(null);
        /** @type {NodeListOf<HTMLElement>} */
        const buttons = list.querySelectorAll('[data-fk^="fsum:remove:"]');
        /** @type {HTMLElement|null} */
        const target = buttons[Math.min(focusIndex, buttons.length - 1)] ?? panel.querySelector('[data-fk="fsum:clear"]');
        target?.focus();
    };
    return { panel, refresh };
}
