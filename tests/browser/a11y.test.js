// Accessibility: roles and names, keyboard, focus management, roving focus, announcements.

import { test, assert, sleep, waitFor, deepActiveElement, accessibleName, input } from "./harness.js";
import { COLUMNS, ALL_FEATURES, mount, $, $$, columnTexts, rightClick, statusText, announced, hasIcon, status } from "./helpers.js";

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

test("form controls have accessible names", () => {
    const table = mount({ features: ALL_FEATURES });
    const unnamed = $$(table, "input, select").filter((c) => !c.getAttribute("aria-label") && !c.labels?.length);
    assert.deepEqual(unnamed.map((c) => c.outerHTML), []);
});

test("form controls inside panels have accessible names", async () => {
    const table = mount({ features: ALL_FEATURES });
    const check = (what) => {
        const unnamed = $$(table, ".k-dt-overlay input, .k-dt-overlay select")
            .filter((c) => !c.getAttribute("aria-label") && !c.labels?.length);
        assert.deepEqual(unnamed.map((c) => c.outerHTML), [], what);
    };
    $(table, '[data-fk="filter:fee"]').click();          // number column → pattern tab
    check("filter panel (pattern)");
    $(table, '.k-dt-overlay [role="tab"]').click();     // values tab
    check("filter panel (values)");
    $(table, '[data-fk="tb:columns"]').click();
    check("column chooser");
    $(table, '[data-fk="tb:saved-views"]').click();
    await waitFor(() => $(table, ".k-dt-overlay .k-dt-views-save"));
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
    assert.ok(active.closest(".k-dt-toolbar"), "focus stays in toolbar");
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
    assert.equal($(table, ".k-dt-empty").colSpan, COLUMNS.length);
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
    assert.equal($$(table, "tbody td").filter((td) => td.tabIndex === 0).length, 1);
    assert.ok($(table, "table").getAttribute("aria-describedby"), "keyboard hint");
}, { cdp: true });

test("Enter on a cell activates its link or the row handler", async () => {
    let linked = null;
    let rowClicked = null;
    const columns = COLUMNS.map((c) => c.key === "name" ? { ...c, link: { handler: (row) => { linked = row.id; } } } : c);
    const table = mount({ columns, onRowClick: (row) => { rowClicked = row.id; } });
    $(table, '[data-fk="cell:2:name"]').focus();
    await input.press("Enter");
    assert.equal(linked, 3);
    $(table, '[data-fk="cell:4:fee"]').focus();
    await input.press("Enter");
    assert.equal(rowClicked, 5);
}, { cdp: true });

test("clicks: action stops at its button, links reach cell and row, SPA links emit navigate", () => {
    const calls = [];
    const columns = COLUMNS.map((c) =>
        c.key === "name" ? { ...c, link: { url: (row) => `/m/${row.id}`, spa: true } } :
        c.key === "fee" ? { ...c, action: (row) => calls.push(`action:${row.id}`) } : c);
    const table = mount({
        columns,
        onCellClick: (value, row, column) => calls.push(`cell:${row.id}:${column.key}`),
        onRowClick: (row, index) => calls.push(`row:${row.id}:${index}`)
    });
    table.addEventListener("jw-datatable:navigate", (e) => calls.push(`navigate:${e.detail.href}`));
    $(table, '[data-fk="cell:1:fee:action"]').click();
    assert.deepEqual(calls.splice(0), ["action:2"]);
    $(table, '[data-fk="cell:1:name:link"]').click();
    assert.deepEqual(calls.splice(0), ["navigate:/m/2", "cell:2:name", "row:2:1"]);
    $(table, '[data-fk="cell:3:active"]').click();
    assert.deepEqual(calls.splice(0), ["cell:4:active", "row:4:3"]);
});

test("record details: copy buttons and links in the dialog act on the shown record", async () => {
    const linked = [];
    const columns = COLUMNS.map((c) => c.key === "name" ? { ...c, link: { handler: (row) => linked.push(row.id) } } : c);
    const table = mount({ columns, features: { rowDetails: true } });
    rightClick($$(table, "tbody td")[0]);
    Array.from($$(table, '[role="menuitem"]')).find((i) => i.textContent.includes("details")).click();
    const dialog = $(table, '[role="dialog"]');
    dialog.querySelector(".k-dt-link").click();
    assert.deepEqual(linked, [1]);
    dialog.querySelector(".k-dt-copy").click();
    await waitFor(() => dialog.querySelector(".k-dt-copy.is-copied"), "copy feedback");
});

test("empty values get no link or action button", () => {
    const columns = COLUMNS.map((c) =>
        c.key === "name" ? { ...c, link: (row) => `/m/${row.id}` } :
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
            { key: "name", label: "Name", link: { spa: true, url: (row) => row.site } },
            { key: "site", label: "Site", link: (row) => row.site }
        ]
    });
    assert.equal($(table, '[data-fk="cell:0:site:link"]').getAttribute("href"), "https://example.org");
    assert.equal($(table, '[data-fk="cell:1:site:link"]'), null, "unsafe URL: no link");
    assert.equal($(table, '[data-fk="cell:1:site"] .k-dt-value').textContent, evil, "value still shown");
    const spa = $(table, '[data-fk="cell:1:name:link"]');
    assert.equal(spa.getAttribute("href"), "#", "SPA link keeps working without the unsafe href");
    let detail = null;
    table.addEventListener("jw-datatable:navigate", (e) => { detail = e.detail; });
    spa.click();
    assert.equal(detail.href, null, "navigate carries no unsafe href");
});

test("cards: single tab stop, arrow navigation, Enter triggers onRowClick", async () => {
    let clicked = null;
    const table = mount({ features: { grid: true }, defaultLayout: "grid", onRowClick: (row) => { clicked = row.id; } });
    assert.equal($(table, ".k-dt-grid").getAttribute("role"), "list");
    assert.equal($$(table, ".k-dt-card").filter((c) => c.tabIndex === 0).length, 1);
    $(table, '[data-fk="card:0"]').focus();
    await input.press("ArrowDown");
    await input.press("ArrowRight");
    assert.equal(deepActiveElement()?.dataset.fk, "card:2");
    await input.press("Enter");
    assert.equal(clicked, 3);
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
    assert.equal(table.shadowRoot.getElementById(labelId)?.textContent, "Members");
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
    const nameInput = await waitFor(() => $(table, ".k-dt-overlay .k-dt-views-save input"));
    nameInput.value = "Mine";
    nameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitFor(() => $(table, ".k-dt-overlay [data-live]")?.textContent.startsWith("View “Mine” saved"), {
        message: "expected the announcement inside the open dialog"
    });
});
