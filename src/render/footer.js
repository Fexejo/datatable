// Table footer: "11–20 of 42", the page size select and the pager.

import { el, iconEl } from "../ui/dom.js";
import { pageItems, pageRange } from "../core/pagination.js";
import { formatCount } from "../core/formatters.js";

// "11–20 of 42", numbers formatted for `locale`.
/**
 * @param {import("../core/i18n.js").Translations} t
 * @param {string} locale
 * @param {number} page
 * @param {number} pageSize
 * @param {number} total
 */
export function pageInfoText(t, locale, page, pageSize, total) {
    const { start, end } = pageRange(page, pageSize, total);
    const [a, b, n] = [start, end, total].map((v) => formatCount(v, locale));
    return t.pageInfo(a, b, n);
}

// `onPage(page)`: go to a page. `onPageSize(size)`: change the page size.
// `title`: the table's title; it names the pager, so several tables on one
// page have distinct navigation landmarks. `locale` formats the numbers.
/**
 * @param {{ t: import("../core/i18n.js").Translations, locale: string, title?: string, page: number,
 *     pageCount: number, pageSize: number,
 *     pageSizeOptions: number[], total: number, onPage: (page: number) => void,
 *     onPageSize: (size: number) => void }} options
 */
export function buildFooter({ t, locale, title, page, pageCount, pageSize, pageSizeOptions, total, onPage, onPageSize }) {
    const info = el("div", { class: "jw-dt-info" }, [
        el("span", { text: pageInfoText(t, locale, page, pageSize, total) }),
        el("label", { class: "jw-dt-pagesize" }, [
            el("span", { text: t.perPage }),
            el("select", {
                class: "jw-dt-select",
                "data-fk": "pagesize",
                "aria-label": t.rowsPerPage,
                onchange: (e) => onPageSize(Number(e.currentTarget.value))
            }, pageSizeOptions.map((size) =>
                el("option", { value: String(size), text: formatCount(size, locale), selected: size === pageSize })
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
        class: "jw-dt-page-btn",
        "data-fk": `page:${icon}`,
        title: label,
        "aria-label": label,
        disabled,
        onclick: () => onPage(target)
    }, [iconEl(icon)]);
    /** @param {number|"…"} item */
    const pageButton = (item) => (item === "…"
        ? el("span", { class: "jw-dt-page-gap", text: "…" })
        : el("button", {
            type: "button",
            class: "jw-dt-page-btn jw-dt-page-num" + (item === page ? " is-active" : ""),
            "data-fk": `page:n:${item}`,
            "aria-label": t.pageN(formatCount(item, locale)),
            "aria-current": item === page ? "page" : null,
            text: formatCount(item, locale),
            onclick: () => onPage(item)
        }));

    const nav = el("div", {
        class: "jw-dt-pager",
        role: "navigation",
        "aria-label": title ? t.paginationNamed(title) : t.paginationAriaLabel
    }, [
        navBtn("chevrons-left", t.firstPage, 1, page <= 1),
        navBtn("chevron-left", t.prevPage, page - 1, page <= 1),
        ...pageItems(page, pageCount).map(pageButton),
        navBtn("chevron-right", t.nextPage, page + 1, page >= pageCount),
        navBtn("chevrons-right", t.lastPage, pageCount, page >= pageCount)
    ]);

    return el("div", { class: "jw-dt-footer", part: "footer" }, [info, nav]);
}
