// A single value as it appears in a cell, card or details dialog: the
// formatted value (as a link, action button or plain text), its copy button,
// and a record's label/value list. Clicks are handled by the component
// (delegated events); `register(node, record)` connects a node to its record.

import { el, iconEl } from "../ui/dom.js";
import { getCellValue, safeUrl } from "../core/util.js";
import { formatValue } from "../core/formatters.js";

/** @typedef {import("../types.js").NormalizedColumn} Column */
/** @typedef {import("../types.js").Row} Row */
/** @typedef {import("../core/i18n.js").Translations} Translations */
/**
 * Record of a rendered cell, card, header or field; a header has no row.
 * @typedef {{ column: Column, row: Row|null, value: any, index?: number }} ItemRecord
 */
/** @typedef {{ row: Row, index: number }} RowRecord Record of a rendered table row. */
/** @typedef {(node: Element, record: ItemRecord|RowRecord) => void} Register */

// Target of a column link: `link.url` as a string or (row, value) => string;
// null when it uses an unsafe scheme (see `safeUrl`).
/**
 * @param {import("../types.js").ColumnLink} link
 * @param {Row} row
 * @param {any} value
 * @returns {string|null}
 */
export function linkHref(link, row, value) {
    const url = typeof link.url === "function" ? link.url(row, value) : link.url;
    return safeUrl(url);
}

// The display node including link logic (href / SPA / custom handler).
// `fk`: focus-key prefix of the containing cell/card (keeps focus across
// re-renders), or null where focus keys are not needed.
/**
 * @param {Column} column
 * @param {Row} row
 * @param {any} value
 * @param {string|null} fk
 * @param {string} locale
 */
export function valueNode(column, row, value, fk, locale) {
    const display = formatValue(value, column, locale, row);
    const content = display instanceof Node ? display : document.createTextNode(display);
    // An empty value gets no link or button: it would be a focus stop without a name.
    if (typeof display === "string" && !display.trim()) return el("span", { class: "k-dt-value" }, [content]);

    // A link whose only purpose is an unsafe URL is shown as plain text.
    const link = column.link;
    const href = link ? linkHref(link, row, value) : null;
    if (link && ((link.url && href !== null) || link.spa || typeof link.handler === "function")) {
        return el("a", { class: "k-dt-link", href: href || "#", "data-fk": fk ? `${fk}:link` : null }, [content]);
    }
    if (typeof column.action === "function") {
        return el("button", { type: "button", class: "k-dt-cell-action", "data-fk": fk ? `${fk}:action` : null }, [content]);
    }
    return el("span", { class: "k-dt-value" }, [content]);
}

// Copies the value of its cell or field.
/**
 * @param {Translations} t
 * @param {Column} column
 * @param {string|null} fk
 */
export function copyButton(t, column, fk) {
    return el("button", {
        type: "button",
        class: "k-dt-copy",
        "data-fk": fk ? `${fk}:copy` : null,
        title: t.copyValue,
        "aria-label": `${t.copyValue}: ${column.label}`
    }, [iconEl("copy")]);
}

// Label/value pairs of one record as a description list (cards, details dialog).
/**
 * @param {{ t: Translations, locale: string, columns: Column[], row: Row, fk: string|null, register: Register }} options
 */
export function buildFields({ t, locale, columns, row, fk, register }) {
    return el("dl", { class: "k-dt-fields" }, columns.map((column) => {
        const value = getCellValue(row, column);
        const key = fk ? `${fk}:${column.key}` : null;
        const val = el("dd", { class: "k-dt-pair-value k-dt-card-val" }, [valueNode(column, row, value, key, locale)]);
        if (column.copyable) val.appendChild(copyButton(t, column, key));
        register(val, { column, row, value });
        return el("div", { class: "k-dt-pair k-dt-card-row" }, [
            el("dt", { class: "k-dt-pair-label k-dt-card-label", text: column.label }),
            val
        ]);
    }));
}
