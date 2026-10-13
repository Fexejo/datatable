// Toolbar: title and global search on the left; the active filters, the layout
// switch and the panel buttons (columns, saved views, export) on the right.

import { el, iconEl } from "../ui/dom.js";

/** @typedef {import("../core/i18n.js").Translations} Translations */
/**
 * @typedef {object} FilterButtonsOptions
 * @property {Translations} t
 * @property {number} filterCount
 * @property {(anchor: HTMLElement) => void} onShowFilters
 * @property {() => void} onClearFilters
 * @property {string|null} openerKey
 */

// `search`: { value, placeholder, onInput(value) }, or null without search.
// `filterCount`: active filters; above 0 shows "Filter (n)", which calls
// `onShowFilters(anchor)`, joined with an "x" that calls `onClearFilters()`.
// `layouts`: [{ layout, icon, label }], shown when there are several;
// `onLayout(layout)` for a click on another one than `currentLayout`.
// `panels`: [{ fk, icon, label, open(anchor) }] — buttons that open a panel;
// the one whose focus key is `openerKey` is expanded.
/**
 * @param {FilterButtonsOptions & {
 *     title?: string, titleId: string,
 *     search: { value: string, placeholder: string, onInput: (value: string) => void }|null,
 *     layouts: { layout: import("../types.js").Layout, icon: string, label: string }[],
 *     currentLayout: import("../types.js").Layout, onLayout: (layout: import("../types.js").Layout) => void,
 *     panels: { fk: string, icon: string, label: string, open: (anchor: HTMLElement) => void }[]
 * }} options
 */
export function buildToolbar({
    t, title, titleId, search, filterCount, onShowFilters, onClearFilters,
    layouts, currentLayout, onLayout, panels, openerKey
}) {
    const left = el("div", { class: "k-dt-toolbar-left" }, [
        title && el("div", { class: "k-dt-title", id: titleId, text: title }),
        search && el("div", { class: "k-dt-search" }, [
            iconEl("search", "k-dt-search-ic"),
            el("input", {
                type: "search",
                class: "k-dt-search-input",
                "data-fk": "search",
                placeholder: search.placeholder,
                value: search.value,
                "aria-label": t.searchAriaLabel,
                oninput: (e) => search.onInput(e.currentTarget.value)
            })
        ])
    ]);

    const right = el("div", { class: "k-dt-toolbar-right" }, [
        buildFilterButtons({ t, filterCount, onShowFilters, onClearFilters, openerKey }),
        // One toggle button per layout; the current one is pressed.
        layouts.length > 1 && el("div", { class: "k-dt-layout-switch", role: "group", "aria-label": t.layoutSwitch },
            layouts.map(({ layout, icon, label }) => el("button", {
                type: "button",
                class: "k-dt-btn",
                "data-fk": `tb:layout:${layout}`,
                title: label,
                "aria-label": label,
                "aria-pressed": String(layout === currentLayout),
                onclick: () => { if (layout !== currentLayout) onLayout(layout); }
            }, [iconEl(icon)]))),
        ...panels.map(({ fk, icon, label, open }) => el("button", {
            type: "button",
            class: "k-dt-btn",
            "data-fk": fk,
            "aria-haspopup": "dialog",
            "aria-expanded": String(openerKey === fk),
            title: label,
            "aria-label": label,
            onclick: (e) => open(e.currentTarget)
        }, [iconEl(icon)]))
    ]);

    return el("div", { class: "k-dt-toolbar", part: "toolbar" }, [left, right]);
}

// "Filter (n)" joined with its "x", or null without active filters. Also
// used on its own to update them while the search field keeps focus.
/** @param {FilterButtonsOptions} options */
export function buildFilterButtons({ t, filterCount, onShowFilters, onClearFilters, openerKey }) {
    if (!(filterCount > 0)) return null;
    return el("div", { class: "k-dt-btn-group" }, [
        el("button", {
            type: "button",
            class: "k-dt-btn",
            "data-fk": "tb:filters",
            "aria-haspopup": "dialog",
            "aria-expanded": String(openerKey === "tb:filters"),
            title: t.showFilters,
            text: t.filterCount(filterCount),
            onclick: (e) => onShowFilters(e.currentTarget)
        }),
        el("button", {
            type: "button",
            class: "k-dt-btn",
            "data-fk": "tb:clear",
            title: t.clearFilters,
            "aria-label": t.clearFilters,
            onclick: onClearFilters
        }, [iconEl("x")])
    ]);
}
