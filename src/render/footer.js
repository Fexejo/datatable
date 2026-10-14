// Table footer: "11–20 of 42", the page size select and the pager.

import { el, iconEl } from "../ui/dom.js";
import { pageItems, pageRange } from "../core/pagination.js";

// `onPage(page)`: go to a page. `onPageSize(size)`: change the page size.
// `title`: the table's title; it names the pager, so several tables on one
// page have distinct navigation landmarks.
/**
 * @param {{ t: import("../core/i18n.js").Translations, title?: string, page: number, pageCount: number, pageSize: number,
 *     pageSizeOptions: number[], total: number, onPage: (page: number) => void,
 *     onPageSize: (size: number) => void }} options
 */
export function buildFooter({ t, title, page, pageCount, pageSize, pageSizeOptions, total, onPage, onPageSize }) {
    const { start, end } = pageRange(page, pageSize, total);
    const info = el("div", { class: "k-dt-info" }, [
        el("span", { text: t.pageInfo(start, end, total) }),
        el("label", { class: "k-dt-pagesize" }, [
            el("span", { text: t.perPage }),
            el("select", {
                class: "k-dt-select",
                "data-fk": "pagesize",
                "aria-label": t.rowsPerPage,
                onchange: (e) => onPageSize(Number(e.currentTarget.value))
            }, pageSizeOptions.map((size) =>
                el("option", { value: String(size), text: String(size), selected: size === pageSize })
            ))
        ])
    ]);

    /**
     * @param {string} icon
     * @param {string} label
     * @param {number} target
     * @param {boolean} disabled
     */
    const navBtn = (icon, label, target, disabled) => el("button", {
        type: "button",
        class: "k-dt-page-btn",
        "data-fk": `page:${icon}`,
        title: label,
        "aria-label": label,
        disabled,
        onclick: () => onPage(target)
    }, [iconEl(icon)]);
    /** @param {number|"…"} item */
    const pageButton = (item) => (item === "…"
        ? el("span", { class: "k-dt-page-gap", text: "…" })
        : el("button", {
            type: "button",
            class: "k-dt-page-btn k-dt-page-num" + (item === page ? " is-active" : ""),
            "data-fk": `page:n:${item}`,
            "aria-label": t.pageN(item),
            "aria-current": item === page ? "page" : null,
            text: String(item),
            onclick: () => onPage(item)
        }));

    const nav = el("div", {
        class: "k-dt-pager",
        role: "navigation",
        "aria-label": title ? t.paginationNamed(title) : t.paginationAriaLabel
    }, [
        navBtn("chevrons-left", t.firstPage, 1, page <= 1),
        navBtn("chevron-left", t.prevPage, page - 1, page <= 1),
        ...pageItems(page, pageCount).map(pageButton),
        navBtn("chevron-right", t.nextPage, page + 1, page >= pageCount),
        navBtn("chevrons-right", t.lastPage, pageCount, page >= pageCount)
    ]);

    return el("div", { class: "k-dt-footer", part: "footer" }, [info, nav]);
}
