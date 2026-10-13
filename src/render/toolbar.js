// Toolbar: title and global search on the left; the active filters, the layout
// switch and the panel buttons (columns, saved views, export) on the right.

import { el, iconEl } from "../ui/dom.js";

// `search`: { value, placeholder, onInput(value) }, or null without search.
// `filterCount`: active filters; above 0 shows "Filter (n)", which calls
// `onShowFilters(anchor)`, joined with an "x" that calls `onClearFilters()`.
// `layouts`: [{ layout, icon, label }], shown when there are several;
// `onLayout(layout)` for a click on another one than `currentLayout`.
// `panels`: [{ fk, icon, label, open(anchor) }] — buttons that open a panel;
// the one whose focus key is `openerKey` is expanded.
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
                oninput: (e) => search.onInput(e.target.value)
            })
        ])
    ]);

    const right = el("div", { class: "k-dt-toolbar-right" }, [
        filterCount > 0 && el("div", { class: "k-dt-btn-group" }, [
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
        ]),
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
