// Accessibility: roles and names, keyboard, focus management, roving focus, announcements.

import { test, assert, sleep, waitFor, deepActiveElement, accessibleName, input } from "./harness.js";
import { COLUMNS, ALL_FEATURES, mount, $, $$, columnTexts, rightClick, statusText, announced, hasIcon, status, root } from "./helpers.js";
import { createIcon } from "../../src/ui/icons.js";

// ---- Accessibility --------------------------------------------------------

test("every button has an accessible name (all features on)", () => {
    const table = mount({ features: ALL_FEATURES, title: "Members" });
    const unnamed = $$(table, "button").filter((b) => !accessibleName(b)).map((b) => b.className);
    assert.deepEqual(unnamed, [], "buttons without accessible name");
});

test("icons are decorative SVGs hidden from assistive tech", () => {
    const table = mount({ features: ALL_FEATURES });
    const svgs = $$(table, "svg");
    assert.ok(svgs.length > 0, "renders icons");
    assert.ok(svgs.every((s) => s.getAttribute("aria-hidden") === "true"), "aria-hidden on all icons");
    assert.ok(svgs.every((s) => !s.querySelector("title")), "no <title> inside icons");
});

// Visible interactive controls of the table and the open filter panel with
// their size; the copy button counts its (larger) tap area.
/** @param {HTMLElement} table */
function targetSizes(table) {
    const selector = ".jw-dt-btn, .jw-dt-icon-btn, .jw-dt-filter-btn, .jw-dt-page-btn, .jw-dt-copy, .jw-dt-tab, .jw-dt-check";
    return $$(table, selector).filter((node) => node.getClientRects().length > 0).map((node) => {
        const r = node.getBoundingClientRect();
        const inset = node.classList.contains("jw-dt-copy") ? -(parseFloat(getComputedStyle(node, "::after").top) || 0) : 0;
        return { node, name: node.className.split(" ")[0], width: r.width + 2 * inset, height: r.height + 2 * inset };
    });
}

test("target sizes: at least 24px on desktop, 44px with visible copy buttons on a touch tablet", async () => {
    for (const [width, touch, min] of /** @type {const} */ ([[1280, false, 24], [820, true, 44]])) {
        await input.viewport(width, 900);
        await input.touch(touch);
        const table = mount({ features: ALL_FEATURES });
        const copy = /** @type {HTMLElement} */ ($(table, ".jw-dt-copy"));
        assert.equal(getComputedStyle(copy).opacity, touch ? "1" : "0", "copy button visible without hover only on touch");
        if (touch) {
            // A tap just outside the drawn button still hits it (before a panel covers the page).
            const r = copy.getBoundingClientRect();
            assert.equal(root(table).elementFromPoint(r.right + 6, r.top + r.height / 2), copy, "tap area beyond the button");
        }
        $(table, 'th[data-key="name"] .jw-dt-filter-btn').click();
        await waitFor(() => $(table, ".jw-dt-check")?.getClientRects().length, { message: "value filter open" });
        const sizes = targetSizes(table);
        for (const name of ["jw-dt-btn", "jw-dt-filter-btn", "jw-dt-page-btn", "jw-dt-copy", "jw-dt-tab", "jw-dt-check"]) {
            assert.ok(sizes.some((s) => s.name === name), `${name} measured at ${width}px`);
        }
        const small = sizes.filter((s) => Math.round(s.width) < min || Math.round(s.height) < min)
            .map((s) => `${s.name} ${Math.round(s.width)}×${Math.round(s.height)}`);
        assert.deepEqual(small, [], `targets below ${min}px at ${width}px${touch ? " (touch)" : ""}`);
        table.remove();
    }
}, { cdp: true });

// WCAG contrast ratio of two computed colors ("rgb(r, g, b)").
/**
 * @param {string} a
 * @param {string} b
 */
function contrast(a, b) {
    const luminance = (/** @type {string} */ color) => {
        const [r, g, bl] = (color.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((c) => {
            const v = Number(c) / 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

test("form field borders have 3:1 contrast with the default colors (WCAG 1.4.11)", async () => {
    const table = mount({ features: ALL_FEATURES });
    $(table, 'th[data-key="fee"] .jw-dt-filter-btn').click();
    await waitFor(() => $(table, ".jw-dt-overlay .jw-dt-input"), { message: "filter panel open" });
    for (const selector of [".jw-dt-search", ".jw-dt-footer .jw-dt-select", ".jw-dt-overlay .jw-dt-select", ".jw-dt-overlay .jw-dt-input"]) {
        const field = $(table, selector);
        assert.ok(field, `${selector} rendered`);
        const style = getComputedStyle(field);
        const ratio = contrast(style.borderTopColor, style.backgroundColor);
        assert.ok(ratio >= 3, `${selector}: border contrast ${ratio.toFixed(2)}:1`);
    }
});

test("an unknown icon name warns and renders an empty decorative SVG", () => {
    const warn = console.warn;
    /** @type {string[]} */
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
        const svg = createIcon("no-such-icon");
        assert.equal(svg.childElementCount, 0);
        assert.equal(svg.getAttribute("aria-hidden"), "true");
        assert.deepEqual(warnings, ['jw-datatable: unknown icon "no-such-icon"']);
    } finally {
        console.warn = warn;
    }
});

test("form controls have accessible names", () => {
    const table = mount({ features: ALL_FEATURES });
    const unnamed = $$(table, "input, select").filter((c) => !c.getAttribute("aria-label") && !c.labels?.length);
    assert.deepEqual(unnamed.map((c) => c.outerHTML), []);
});

test("form controls inside panels have accessible names", async () => {
    const table = mount({ features: ALL_FEATURES });
    const check = (/** @type {string} */ what) => {
        const unnamed = $$(table, ".jw-dt-overlay input, .jw-dt-overlay select")
            .filter((c) => !c.getAttribute("aria-label") && !c.labels?.length);
        assert.deepEqual(unnamed.map((c) => c.outerHTML), [], what);
    };
    $(table, '[data-fk="filter:fee"]').click();          // number column → pattern tab
    check("filter panel (pattern)");
    $(table, '.jw-dt-overlay [role="tab"]').click();     // values tab
    check("filter panel (values)");
    $(table, '[data-fk="tb:columns"]').click();
    check("column chooser");
    $(table, '[data-fk="tb:saved-views"]').click();
    await waitFor(() => $(table, ".jw-dt-overlay .jw-dt-views-save"));
    check("saved views panel");
});

// ---- Keyboard (trusted input via CDP) -------------------------------------

test("sort header is operable with Enter and Space", async () => {
    const table = mount({ features: { sorting: true } });
    const th = () => $$(table, "thead th")[1];
    th().querySelector("button").focus();
    await input.press("Enter");
    assert.equal(th().getAttribute("aria-sort"), "ascending");
    // The re-render keeps focus on the (new) sort button.
    assert.equal(deepActiveElement(), th().querySelector("button"), "focus kept after re-render");
    await input.press(" ");
    assert.equal(th().getAttribute("aria-sort"), "descending");
}, { cdp: true });

test("Tab moves from the search field into the toolbar buttons", async () => {
    const table = mount({ features: ALL_FEATURES });
    $(table, "input[type=search]").focus();
    await input.press("Tab");
    const active = deepActiveElement();
    assert.equal(active?.tagName, "BUTTON");
    assert.ok(active.closest(".jw-dt-toolbar"), "focus stays in toolbar");
}, { cdp: true });

// ---- Focus management -----------------------------------------------------

test("pagination keeps focus on the pressed button, then on the current page", () => {
    const table = mount();
    $(table, '[data-fk="page:chevron-right"]').focus();
    $(table, '[data-fk="page:chevron-right"]').click();
    assert.equal(deepActiveElement()?.dataset.fk, "page:chevron-right");
    $(table, '[data-fk="page:chevron-right"]').click();   // page 3 = last → "next" disabled
    assert.equal(deepActiveElement()?.getAttribute("aria-current"), "page");
    assert.equal(deepActiveElement()?.getAttribute("aria-label"), "Page 3");
});

test("empty state spans all columns", () => {
    const table = mount({ data: [] });
    assert.equal($(table, ".jw-dt-empty").colSpan, COLUMNS.length);
});

// ---- Table cells: roving focus -------------------------------------------

test("table body is a single tab stop with arrow-key navigation", async () => {
    const table = mount();
    const stops = $$(table, "tbody td").filter((td) => td.tabIndex === 0);
    assert.equal(stops.length, 1, "exactly one cell in tab order");
    stops[0].focus();
    await input.press("ArrowRight");
    assert.equal(deepActiveElement()?.dataset.fk, "cell:0:name");
    await input.press("ArrowDown");
    assert.equal(deepActiveElement()?.dataset.fk, "cell:1:name");
    await input.press("End");
    assert.equal(deepActiveElement()?.dataset.fk, "cell:1:joined");
    await input.press("End", ["Control"]);
    assert.equal(deepActiveElement()?.dataset.fk, "cell:9:joined");
    await input.press("Home", ["Control"]);
    assert.equal(deepActiveElement()?.dataset.fk, "cell:0:id");
    await input.press("ArrowLeft");
    assert.equal(deepActiveElement()?.dataset.fk, "cell:0:id", "stops at the first column");
    await input.press("ArrowDown");
    await input.press("ArrowRight");
    await input.press("ArrowUp");
    assert.equal(deepActiveElement()?.dataset.fk, "cell:0:name");
    await input.press("ArrowLeft");
    assert.equal(deepActiveElement()?.dataset.fk, "cell:0:id");
    await input.press("Enter");
    assert.equal(deepActiveElement()?.dataset.fk, "cell:0:id", "Enter on a plain cell does nothing");
    assert.equal($$(table, "tbody td").filter((td) => td.tabIndex === 0).length, 1);
    assert.ok($(table, "table").getAttribute("aria-describedby"), "keyboard hint");
}, { cdp: true });

test("Enter on a cell activates its link or the row handler", async () => {
    /** @type {any} */
    let linked = null;
    /** @type {any} */
    let rowClicked = null;
    const columns = COLUMNS.map((c) => c.key === "name" ? { ...c, link: { handler: (/** @type {any} */ row) => { linked = row.id; } } } : c);
    const table = mount({ columns, onRowClick: (/** @type {any} */ row) => { rowClicked = row.id; } });
    $(table, '[data-fk="cell:2:name"]').focus();
    await input.press("Enter");
    assert.equal(linked, 3);
    $(table, '[data-fk="cell:4:fee"]').focus();
    await input.press("Enter");
    assert.equal(rowClicked, 5);
}, { cdp: true });

test("clicks: action stops at its button, links reach cell and row, SPA links emit navigate", () => {
    /** @type {string[]} */
    const calls = [];
    const columns = COLUMNS.map((c) =>
        c.key === "name" ? { ...c, link: { url: (/** @type {any} */ row) => `/m/${row.id}`, spa: true } } :
        c.key === "fee" ? { ...c, action: (/** @type {any} */ row) => calls.push(`action:${row.id}`) } : c);
    const table = mount({
        columns,
        onCellClick: (value, row, column) => calls.push(`cell:${row.id}:${column.key}`),
        onRowClick: (row, index) => calls.push(`row:${row.id}:${index}`)
    });
    table.addEventListener("jw-datatable:navigate", (/** @type {any} */ e) => calls.push(`navigate:${e.detail.href}`));
    $(table, '[data-fk="cell:1:fee:action"]').click();
    assert.deepEqual(calls.splice(0), ["action:2"]);
    $(table, '[data-fk="cell:1:name:link"]').click();
    assert.deepEqual(calls.splice(0), ["navigate:/m/2", "cell:2:name", "row:2:1"]);
    $(table, '[data-fk="cell:3:active"]').click();
    assert.deepEqual(calls.splice(0), ["cell:4:active", "row:4:3"]);
});

test("record details: copy buttons and links in the dialog act on the shown record", async () => {
    /** @type {number[]} */
    const linked = [];
    const columns = COLUMNS.map((c) => c.key === "name" ? { ...c, link: { handler: (/** @type {any} */ row) => linked.push(row.id) } } : c);
    const table = mount({ columns, features: { rowDetails: true } });
    rightClick($$(table, "tbody td")[0]);
    Array.from($$(table, '[role="menuitem"]')).find((i) => i.textContent.includes("details")).click();
    const dialog = $(table, '[role="dialog"]');
    dialog.querySelector(".jw-dt-link").click();
    assert.deepEqual(linked, [1]);
    dialog.querySelector(".jw-dt-copy").click();
    await waitFor(() => dialog.querySelector(".jw-dt-copy.is-copied"), { message: "copy feedback" });
});

test("empty values get no link or action button", () => {
    const columns = COLUMNS.map((c) =>
        c.key === "name" ? { ...c, link: (/** @type {any} */ row) => `/m/${row.id}` } :
        c.key === "fee" ? { ...c, action: () => {} } : c);
    const data = [{ id: 1, name: "Anna", fee: 5 }, { id: 2, name: "", fee: null }];
    const table = mount({ columns, data });
    assert.ok($(table, '[data-fk="cell:0:name:link"]'), "filled value is a link");
    assert.ok($(table, '[data-fk="cell:0:fee:action"]'), "filled value is a button");
    assert.equal($(table, '[data-fk="cell:1:name:link"]'), null, "empty value: no link");
    assert.equal($(table, '[data-fk="cell:1:fee:action"]'), null, "empty value: no button");
});

test("links with an unsafe URL scheme render as text; SPA links get a safe href", () => {
    const evil = "javascript:alert(1)";
    const data = [{ id: 1, name: "Anna", site: "https://example.org" }, { id: 2, name: "Ben", site: evil }];
    const table = mount({
        data,
        columns: [
            { key: "name", label: "Name", link: { spa: true, url: (/** @type {any} */ row) => row.site } },
            { key: "site", label: "Site", link: (/** @type {any} */ row) => row.site }
        ]
    });
    assert.equal($(table, '[data-fk="cell:0:site:link"]').getAttribute("href"), "https://example.org");
    assert.equal($(table, '[data-fk="cell:1:site:link"]'), null, "unsafe URL: no link");
    assert.equal($(table, '[data-fk="cell:1:site"] .jw-dt-value').textContent, evil, "value still shown");
    const spa = $(table, '[data-fk="cell:1:name:link"]');
    assert.equal(spa.getAttribute("href"), "#", "SPA link keeps working without the unsafe href");
    /** @type {any} */
    let detail = null;
    table.addEventListener("jw-datatable:navigate", (/** @type {any} */ e) => { detail = e.detail; });
    spa.click();
    assert.equal(detail.href, null, "navigate carries no unsafe href");
});

test("cards: single tab stop, arrow navigation, Enter triggers onRowClick", async () => {
    /** @type {any} */
    let clicked = null;
    const table = mount({ features: { grid: true }, defaultLayout: "grid", onRowClick: (/** @type {any} */ row) => { clicked = row.id; } });
    assert.equal($(table, ".jw-dt-grid").getAttribute("role"), "list");
    assert.equal($$(table, ".jw-dt-card").filter((c) => c.tabIndex === 0).length, 1);
    $(table, '[data-fk="card:0"]').focus();
    await input.press("ArrowDown");
    await input.press("ArrowRight");
    assert.equal(deepActiveElement()?.dataset.fk, "card:2");
    await input.press("Enter");
    assert.equal(clicked, 3);
    await input.press("End");
    assert.equal(deepActiveElement()?.dataset.fk, "card:9");
    await input.press("ArrowLeft");
    assert.equal(deepActiveElement()?.dataset.fk, "card:8");
    await input.press("Home");
    await input.press("ArrowUp");
    assert.equal(deepActiveElement()?.dataset.fk, "card:0", "stops at the first card");
    await input.press("x");
    assert.equal(deepActiveElement()?.dataset.fk, "card:0", "other keys do not move");
}, { cdp: true });

test("cards without onRowClick ignore Enter", async () => {
    const table = mount({ features: { grid: true }, defaultLayout: "grid" });
    const card = $(table, '[data-fk="card:0"]');
    assert.ok(!card.classList.contains("jw-dt-clickable"));
    let clicks = 0;
    card.addEventListener("click", () => { clicks += 1; });
    card.focus();
    await input.press("Enter");
    assert.equal(clicks, 0);
}, { cdp: true });

// ---- Announcements ---------------------------------------------------------

test("status messages: search results, sort, page, copy", async () => {
    const table = mount({ features: { globalSearch: true, sorting: true } });
    const announcer = status(table);
    assert.equal(announcer.parentElement, document.body, "live region lives in the light DOM");
    assert.equal(announcer.getAttribute("aria-live"), "polite");
    assert.equal(document.querySelectorAll("[data-jw-datatable-announcer]").length, 1, "one shared region");

    const search = $(table, "input[type=search]");
    search.value = "clara";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await announced(table, "5 rows");

    search.value = "nobody";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await announced(table, "No rows match the current filters.");

    table.clearFilters();
    await announced(table, "30 rows");

    $(table, '[data-fk="sort:name"]').click();
    await announced(table, "Sorted by Name ascending");

    $(table, '[data-fk="page:chevron-right"]').click();
    await announced(table, "11–20 of 30");

    $(table, '[data-fk="cell:0:name:copy"]').click();
    await announced(table, `Copied to clipboard: ${columnTexts(table, 1)[0]}`);
});

test("German announcements", async () => {
    const table = mount({ locale: "de-DE", features: { sorting: true } });
    $(table, '[data-fk="sort:fee"]').click();
    $(table, '[data-fk="sort:fee"]').click();
    await announced(table, "Sortiert nach Fee absteigend");
});

test("table is named by the title; multi-sort priority is announced, not the bare digit", () => {
    const table = mount({ title: "Members", features: { sorting: true } });
    const labelId = $(table, "table").getAttribute("aria-labelledby");
    assert.equal(root(table).getElementById(labelId)?.textContent, "Members");
    table.setState({ sort: [{ key: "name", direction: "asc" }, { key: "fee", direction: "desc" }] });
    assert.equal(accessibleName($(table, '[data-fk="sort:fee"]')), "Fee, sort priority 2");
});

test("copy buttons name their column", () => {
    const table = mount();
    assert.equal($(table, '[data-fk="cell:0:name:copy"]').getAttribute("aria-label"), "Copy value: Name");
});

test("Shift+Enter on a sort header adds a secondary sort key", async () => {
    const table = mount({ features: { sorting: true } });
    $(table, '[data-fk="sort:name"]').focus();
    await input.press("Enter");
    $(table, '[data-fk="sort:fee"]').focus();
    await input.press("Enter", ["Shift"]);
    assert.deepEqual(table.getState().sort.map((s) => s.key), ["name", "fee"]);
}, { cdp: true });

test("mouse click on a copy button keeps focus and only announces the copy", async () => {
    const table = mount({ features: { globalSearch: true } });
    const search = $(table, "input[type=search]");
    search.focus();
    const button = $(table, '[data-fk="cell:1:name:copy"]');
    await input.click(button);
    assert.equal(deepActiveElement(), search, "focus did not move into the table");
    await announced(table, "Copied to clipboard: Ben");
    assert.ok(hasIcon(button, "check"), "check icon after copying");
    await waitFor(() => hasIcon(button, "copy"), { timeout: 2500, message: "icon reverts after a moment" });
}, { cdp: true });

test("copying works without the Clipboard API (fallback) and keeps focus", async () => {
    const table = mount({ features: { globalSearch: true } });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const execCommand = document.execCommand;
    /** @type {string[]} */
    const copied = [];
    document.execCommand = (command) => {
        copied.push(`${command}:${/** @type {HTMLTextAreaElement} */ (document.activeElement).value}`);
        return true;
    };
    try {
        const search = $(table, "input[type=search]");
        search.focus();
        $(table, '[data-fk="cell:1:name:copy"]').click();
        await announced(table, "Copied to clipboard: Ben");
        assert.deepEqual(copied, ["copy:Ben"]);
        assert.equal(deepActiveElement(), search, "focus back where it was");
        assert.equal(document.querySelector("body > textarea"), null, "helper removed");
    } finally {
        document.execCommand = execCommand;
        delete /** @type {any} */ (navigator).clipboard;
    }
});

test("keyboard copy confirms on the focused button (no live region), every time", async () => {
    const table = mount();
    const button = $(table, '[data-fk="cell:0:name:copy"]');
    button.focus();
    await input.press("Enter");
    await waitFor(() => button.getAttribute("aria-label") === "Copied to clipboard: Anna", {
        message: `button name: ${button.getAttribute("aria-label")}`
    });
    assert.equal(deepActiveElement(), button, "focus stays on the copy button");
    assert.ok(hasIcon(button, "check") && button.classList.contains("is-copied"), "check icon while focused");
    await sleep(150);
    assert.equal(statusText(table), "", "no duplicate live-region announcement");

    await input.press("Enter");
    await waitFor(() => button.getAttribute("aria-label") === "Copied to clipboard: Anna.", {
        message: "second copy must change the name again"
    });

    await sleep(1400);
    assert.ok(hasIcon(button, "check"), "check icon stays while the button has focus");
    await input.press("Tab");
    assert.equal(button.getAttribute("aria-label"), "Copy value: Name", "original name restored on blur");
    assert.ok(hasIcon(button, "copy") && !button.classList.contains("is-copied"), "copy icon restored on blur");
}, { cdp: true });

test("German copy announcement", async () => {
    const table = mount({ locale: "de-DE" });
    $(table, '[data-fk="cell:2:name:copy"]').click();
    await announced(table, "In die Zwischenablage kopiert: Clara");
});

test("announcements while a panel is open go to the panel's live region", async () => {
    const table = mount({ features: { savedViews: true }, storage: { adapter: {
        list: () => [], get: () => null, save: () => {}, rename: () => {}, delete: () => {}
    } } });
    $(table, '[data-fk="tb:saved-views"]').click();
    const nameInput = await waitFor(() => $(table, ".jw-dt-overlay .jw-dt-views-save input"));
    nameInput.value = "Mine";
    nameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitFor(() => $(table, ".jw-dt-overlay [data-live]")?.textContent.startsWith("View “Mine” saved"), {
        message: "expected the announcement inside the open dialog"
    });
});

// WCAG 2.4.11: a cell focused under the sticky header scrolls out from under it.
test("maxHeight: arrow keys never leave the focused cell under the sticky header", async () => {
    const table = mount({ maxHeight: "240px", pagination: { pageSize: 30 } });
    $(table, "tbody td").focus();
    await input.press("End", ["Control"]);
    const headerBottom = $(table, "thead").getBoundingClientRect().bottom;
    /** @type {string[]} */
    const covered = [];
    for (let i = 0; i < 29; i++) {
        await input.press("ArrowUp");
        const cell = deepActiveElement();
        if (cell && cell.getBoundingClientRect().top < headerBottom - 1) covered.push(cell.dataset.fk ?? "");
    }
    assert.equal(deepActiveElement()?.dataset.fk, "cell:0:joined");
    assert.deepEqual(covered, [], "cells focused under the header");
}, { cdp: true });
