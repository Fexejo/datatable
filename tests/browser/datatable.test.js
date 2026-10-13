// Component tests for <jw-datatable>, run in a real browser.
// `?dist` in the page URL runs them against the built bundle instead of the sources.

import { test, assert, nextFrame, sleep, waitFor, deepActiveElement, accessibleName, input } from "./harness.js";
import { createIcon } from "../../src/ui/icons.js";

const ENTRY = new URLSearchParams(location.search).has("dist")
    ? "../../dist/jw-datatable.min.js"
    : "../../datatable.js";
const api = await import(ENTRY);
const { createDataTable } = api;

const NAMES = ["Anna", "Ben", "Clara", "David", "Emma", "Felix"];
const DATA = Array.from({ length: 30 }, (_, i) => ({
    id: i + 1,
    name: NAMES[i % NAMES.length],
    fee: Math.round(((i * 37) % 200) * 100) / 100,
    active: i % 3 !== 0,
    joined: `202${i % 5}-0${(i % 9) + 1}-15`
}));
const COLUMNS = [
    { key: "id", label: "ID", type: "integer" },
    { key: "name", label: "Name", type: "string", copyable: true },
    { key: "fee", label: "Fee", type: "currency", format: { currency: "EUR" } },
    { key: "active", label: "Active", type: "boolean" },
    { key: "joined", label: "Joined", type: "date" }
];
const ALL_FEATURES = {
    sorting: true, filtering: true, globalSearch: true, grid: true,
    columnVisibility: true, columnReorder: true, savedViews: true, export: true
};

function mount(config = {}) {
    // The shared announcer outlives tests; start each test with a clean slate.
    const announcer = document.querySelector("[data-jw-datatable-announcer]");
    if (announcer) announcer.textContent = "";
    return createDataTable("#fixture", {
        id: "test",
        columns: COLUMNS,
        data: DATA,
        pagination: { pageSize: 10 },
        responsive: { enabled: false },
        ...config
    });
}
const $ = (table, sel) => table.shadowRoot.querySelector(sel);
const $$ = (table, sel) => Array.from(table.shadowRoot.querySelectorAll(sel));
const columnTexts = (table, index) =>
    $$(table, "tbody tr").map((tr) => tr.children[index].querySelector(".k-dt-cell").textContent.trim());

function rightClick(node) {
    const r = node.getBoundingClientRect();
    node.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, composed: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5
    }));
}

// ---- Public API -----------------------------------------------------------

test(`public API is exported (${ENTRY})`, () => {
    assert.deepEqual(Object.keys(api).sort(), [
        "JwDataTable", "LocalStorageAdapter", "ViewStore",
        "createDataTable", "default", "inferColumns", "inferType"
    ]);
    assert.equal(api.default, createDataTable);
    assert.equal(customElements.get("jw-datatable"), api.JwDataTable, "custom element registered");
});

test("tables share one parsed stylesheet; config.styles adds a per-table sheet", () => {
    const a = mount();
    const b = mount({ styles: ".k-dt-title { color: rgb(1, 2, 3); }", title: "B" });
    a.after(b);
    const [shared] = a.shadowRoot.adoptedStyleSheets;
    assert.equal(a.shadowRoot.adoptedStyleSheets.length, 1);
    assert.equal(b.shadowRoot.adoptedStyleSheets[0], shared, "same sheet object");
    assert.equal(getComputedStyle($(b, ".k-dt-title")).color, "rgb(1, 2, 3)");
    assert.equal(a.shadowRoot.querySelector("style"), null, "no <style> element per render");
    b.remove();
});

// ---- Rendering ------------------------------------------------------------

test("renders a semantic table with column headers and one page of rows", () => {
    const table = mount();
    const headers = $$(table, "thead th");
    assert.deepEqual(headers.map((th) => th.textContent.trim()), COLUMNS.map((c) => c.label));
    assert.ok(headers.every((th) => th.getAttribute("scope") === "col"), "th scope=col");
    assert.equal($$(table, "tbody tr").length, 10);
});

test("formats values by type and locale", () => {
    const table = mount({ locale: "de-DE", data: [{ id: 1234, name: "A", fee: 9.9, active: true, joined: "2021-03-02T12:00:00" }] });
    const cells = $$(table, "tbody td").map((td) => td.textContent.trim().replace(/[\u00a0\u202f]/g, " "));
    assert.deepEqual(cells, ["1.234", "A", "9,90 €", "Ja", "02.03.2021"]);
});

test("setData replaces rows and fires jw-datatable:datachange", () => {
    const table = mount();
    let detail = null;
    table.addEventListener("jw-datatable:datachange", (e) => { detail = e.detail; });
    table.setData(DATA.slice(0, 3));
    assert.equal($$(table, "tbody tr").length, 3);
    assert.equal(detail?.data?.length, 3);
});

// ---- Sorting --------------------------------------------------------------

test("clicking a sortable header cycles aria-sort and orders rows", () => {
    const table = mount({ features: { sorting: true } });
    const th = () => $$(table, "thead th")[1];
    assert.equal(th().getAttribute("aria-sort"), "none");

    th().querySelector("button.k-dt-th-label").click();
    assert.equal(th().getAttribute("aria-sort"), "ascending");
    assert.equal(columnTexts(table, 1)[0], "Anna");

    th().querySelector("button.k-dt-th-label").click();
    assert.equal(th().getAttribute("aria-sort"), "descending");
    assert.equal(columnTexts(table, 1)[0], "Felix");
});

test("headers are not buttons when sorting is disabled", () => {
    const table = mount();
    assert.equal($$(table, "thead button.k-dt-th-label").length, 0);
});

// ---- Pagination -----------------------------------------------------------

test("pagination moves pages and marks the current page", () => {
    const table = mount();
    const nav = () => $(table, '[role="navigation"]');
    const buttons = () => Array.from(nav().querySelectorAll("button"));
    assert.ok(buttons()[0].disabled && buttons()[1].disabled, "first/prev disabled on page 1");
    assert.equal(nav().querySelector('[aria-current="page"]').textContent, "1");

    let changed = null;
    table.addEventListener("jw-datatable:change", (e) => { changed = e.detail.state; });
    buttons().at(-2).click(); // next
    assert.equal(nav().querySelector('[aria-current="page"]').textContent, "2");
    assert.equal(columnTexts(table, 0)[0], "11");
    assert.equal(table.getState().page, 2);
    assert.equal(changed?.page, 2, "change event carries the page");
});

// 12 columns: a page of 500 rows would be 6000 cells.
const WIDE = Array.from({ length: 12 }, (_, i) => ({ key: `c${i}`, label: `C${i}`, type: "integer" }));
const wideRows = (count) => Array.from({ length: count }, (_, r) =>
    Object.fromEntries(WIDE.map((c, i) => [c.key, r * 100 + i])));
const pageSizes = (table) => $$(table, '[data-fk="pagesize"] option').map((o) => Number(o.value));

test("page sizes are offered while a page stays within 5000 rendered cells", () => {
    const table = mount({ columns: WIDE, data: wideRows(30), features: { grid: true } });
    assert.deepEqual(pageSizes(table), [10, 25, 50, 100, 250], "12 columns");
    table.setState({ hiddenColumns: ["c0", "c1"] });
    assert.deepEqual(pageSizes(table), [10, 25, 50, 100, 250, 500], "hidden columns don't count");
    table.setState({ layout: "grid" });
    assert.ok($(table, ".k-dt-card"), "cards");
    assert.deepEqual(pageSizes(table), [10, 25, 50, 100, 250, 500], "cards: one field per visible column");
});

test("showing more columns keeps the page size in use; only the choice goes", () => {
    const table = mount({
        columns: WIDE,
        data: wideRows(600),
        features: { columnVisibility: true },
        pagination: { pageSize: 500 },
        initial: { hiddenColumns: ["c0", "c1"] }
    });
    $(table, '[data-fk="tb:columns"]').click();
    $$(table, '.k-dt-overlay input[type="checkbox"]')[0].click();
    assert.equal($$(table, "tbody tr").length, 500, "not reduced");
    assert.deepEqual(pageSizes(table), [10, 25, 50, 100, 250, 500]);
    assert.equal($(table, '[data-fk="pagesize"]').value, "500");

    const select = $(table, '[data-fk="pagesize"]');
    select.value = "100";
    select.dispatchEvent(new Event("change"));
    assert.deepEqual(pageSizes(table), [10, 25, 50, 100, 250], "500 is no longer offered");
});

test("pagination turned off comes back on above 5000 cells, with a console warning", () => {
    const warn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
        const table = mount({ columns: WIDE, data: wideRows(500), features: { pagination: false } });
        assert.ok($(table, ".k-dt-footer"), "pager shown");
        assert.equal($$(table, "tbody tr").length, 10);
        assert.equal(warnings.length, 1);
        assert.ok(warnings[0].includes("500 rows × 12 columns"), warnings[0]);

        table.setState({ hiddenColumns: ["c0", "c1"] });   // 500 × 10 = 5000 cells
        assert.ok(!$(table, ".k-dt-footer"), "off again");
        assert.equal($$(table, "tbody tr").length, 500);

        table.setState({ hiddenColumns: [] });
        assert.equal($$(table, "tbody tr").length, 10);
        assert.equal(warnings.length, 2, "warns each time it turns on");
    } finally {
        console.warn = warn;
    }
});

test("a filter panel opened from the context menu sits at the right-clicked header or cell", () => {
    const table = mount({ features: { filtering: true } });
    for (const target of [$(table, 'th[data-key="fee"]'), $$(table, "tbody tr")[3].children[2]]) {
        rightClick(target);
        Array.from($$(table, '[role="menuitem"]')).find((i) => i.textContent.includes("Open filter…")).click();
        const panel = $(table, '[role="dialog"]').getBoundingClientRect();
        const anchor = target.getBoundingClientRect();
        assert.ok(Math.abs(panel.left - anchor.left) < 2, `left ${panel.left} at ${anchor.left}`);
        assert.ok(Math.abs(panel.top - (anchor.bottom + 4)) < 2, `top ${panel.top} below ${anchor.bottom}`);
        table.shadowRoot.querySelector(".k-dt-backdrop").click();
    }
});

test("state referring to unknown columns is dropped", () => {
    const table = mount({
        features: { sorting: true, filtering: true },
        initial: { hiddenColumns: ["gone", "fee"] }
    });
    assert.deepEqual(table.getState().hiddenColumns, ["fee"], "initial");
    table.setState({
        sort: [{ key: "gone", direction: "asc" }, { key: "name", direction: "desc" }],
        filters: { gone: { kind: "value", values: ["x"] } },
        pinnedColumns: ["gone"]
    });
    const state = table.getState();
    assert.deepEqual(state.sort, [{ key: "name", direction: "desc" }]);
    assert.deepEqual(state.filters, {});
    assert.deepEqual(state.pinnedColumns, []);
});

// ---- Search ---------------------------------------------------------------

test("global search filters rows (debounced)", async () => {
    const table = mount({ features: { globalSearch: true } });
    const search = $(table, "input[type=search]");
    search.value = "clara";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await waitFor(() => $$(table, "tbody tr").length === 5, { message: "expected 5 Clara rows" });
    assert.ok(columnTexts(table, 1).every((n) => n === "Clara"));
});

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

// ---- Layout switch --------------------------------------------------------

test("layout switch is a named group of toggle buttons, one per available layout", () => {
    let table = mount();
    assert.equal($(table, ".k-dt-layout-switch"), null, "no switch with only the table");

    table = mount({ features: { grid: true, compact: true } });
    const group = $(table, ".k-dt-layout-switch");
    assert.equal(group.getAttribute("role"), "group");
    assert.equal(accessibleName(group), "Layout");
    const buttons = () => $$(table, ".k-dt-layout-switch button");
    assert.deepEqual(buttons().map(accessibleName), ["Table", "Cards", "Compact"]);
    assert.deepEqual(buttons().map((b) => b.getAttribute("aria-pressed")), ["true", "false", "false"]);

    buttons()[1].focus();
    buttons()[1].click();
    assert.ok($(table, ".k-dt-grid"), "grid rendered");
    assert.equal($$(table, ".k-dt-card").length, 10);
    assert.deepEqual(buttons().map((b) => b.getAttribute("aria-pressed")), ["false", "true", "false"]);
    assert.equal(deepActiveElement()?.dataset.fk, "tb:layout:grid", "focus stays on the pressed button");
    assert.equal(table.getState().layout, "grid");
});

// ---- Context menu ---------------------------------------------------------

test("right-click opens a localized context menu, focuses it, Escape closes", async () => {
    const table = mount({ locale: "de-DE", features: { filtering: true, sorting: true } });
    rightClick($$(table, "tbody td")[1]);
    const menu = $(table, '[role="menu"]');
    assert.ok(menu, "menu opened");
    const labels = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((i) => i.textContent.trim());
    assert.ok(labels.includes("Nach „Anna“ filtern"), `labels: ${labels.join(" | ")}`);
    assert.ok(labels.includes("„Anna“ ausschließen"), `labels: ${labels.join(" | ")}`);

    await nextFrame();
    assert.equal(deepActiveElement()?.getAttribute("role"), "menuitem", "first item focused");

    await sleep(10); // key listener is registered on the next tick
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal($(table, '[role="menu"]'), null, "menu closed");
});

test("context menu quick filter narrows rows", () => {
    const table = mount({ features: { filtering: true } });
    rightClick($$(table, "tbody td")[1]);
    const item = Array.from($$(table, '[role="menuitem"]')).find((i) => i.textContent.includes("Filter by"));
    item.click();
    assert.ok(columnTexts(table, 1).every((n) => n === "Anna"));
    assert.equal($$(table, "tbody tr").length, 5);
});

test("context menu exclude works on formatted number columns", () => {
    const table = mount({ locale: "de-DE", features: { filtering: true }, pagination: { pageSize: 100 } });
    const fee = DATA[0].fee;
    const count = DATA.filter((r) => r.fee === fee).length;
    rightClick($$(table, "tbody td")[2]);
    const item = Array.from($$(table, '[role="menuitem"]')).find((i) => i.textContent.includes("ausschließen"));
    item.click();
    assert.equal($$(table, "tbody tr").length, DATA.length - count);
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

// ---- Responsive -----------------------------------------------------------

test("switches to card layout below the breakpoint", async () => {
    await input.viewport(390, 800);
    const table = mount({ features: { grid: true }, responsive: { enabled: true } });
    await waitFor(() => $(table, ".k-dt-grid"), { message: "expected cards on mobile" });
    await input.viewport(1280, 900);
    await waitFor(() => $(table, "table"), { message: "expected the table on desktop" });
}, { cdp: true });

// ---- Focus management -----------------------------------------------------

// Active live region: the open panel's own region, else the shared one in <body>.
const status = (table) => $(table, ".k-dt-overlay [data-live]")
    || document.querySelector("body > [data-jw-datatable-announcer]");
// Announcements may carry an invisible alternating suffix (see _announce).
const statusText = (table) => (status(table)?.textContent ?? "").replace(/\u00a0$/, "");
const announced = (table, text) => waitFor(() => statusText(table) === text, {
    message: `expected announcement "${text}", got "${statusText(table)}"`
});

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

// ---- Context menu: keyboard ----------------------------------------------

test("Shift+F10 on a cell opens the menu; arrows, Home/End navigate; Escape returns focus", async () => {
    const table = mount({ features: { sorting: true, filtering: true } });
    $(table, '[data-fk="cell:1:name"]').focus();
    await input.press("F10", ["Shift"]);
    const menu = $(table, '[role="menu"]');
    assert.ok(menu, "menu opened");
    assert.equal(menu.getAttribute("aria-label"), "Actions: Name");
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
    assert.equal(deepActiveElement(), items[0], "first item focused");
    await input.press("ArrowDown");
    assert.equal(deepActiveElement(), items[1]);
    await input.press("End");
    assert.equal(deepActiveElement(), items.at(-1));
    await input.press("ArrowDown");
    assert.equal(deepActiveElement(), items[0], "wraps around");
    await input.press("Escape");
    assert.equal($(table, '[role="menu"]'), null, "closed");
    assert.equal(deepActiveElement()?.dataset.fk, "cell:1:name", "focus back on the cell");
}, { cdp: true });

test("context-menu key on a header opens the column menu; activating keeps focus", async () => {
    const table = mount({ features: { sorting: true } });
    $(table, '[data-fk="sort:fee"]').focus();
    await input.press("ContextMenu");
    const items = $$(table, '[role="menuitem"]');
    assert.ok(items.length > 0, "menu opened");
    await input.press("ArrowDown");                     // "Sort descending"
    await input.press("Enter");
    assert.equal($(table, '[role="menu"]'), null);
    assert.equal($$(table, "thead th")[2].getAttribute("aria-sort"), "descending");
    assert.equal(deepActiveElement()?.dataset.fk, "sort:fee", "focus back on the header");
}, { cdp: true });

test("Tab closes the context menu and returns focus", async () => {
    const table = mount();
    $(table, '[data-fk="cell:0:id"]').focus();
    await input.press("F10", ["Shift"]);
    assert.ok($(table, '[role="menu"]'));
    await input.press("Tab");
    assert.equal($(table, '[role="menu"]'), null);
    assert.equal(deepActiveElement()?.dataset.fk, "cell:0:id");
}, { cdp: true });

// ---- Panels as dialogs -----------------------------------------------------

test("filter panel is a labelled modal dialog with focus inside and focus return", async () => {
    const table = mount({ features: { filtering: true } });
    const button = () => $(table, '[data-fk="filter:name"]');
    assert.equal(button().getAttribute("aria-label"), "Filter: Name");
    assert.equal(button().getAttribute("aria-haspopup"), "dialog");
    button().focus();
    await input.press("Enter");

    const dialog = $(table, '[role="dialog"]');
    assert.ok(dialog, "dialog opened");
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.equal(table.shadowRoot.getElementById(dialog.getAttribute("aria-labelledby"))?.textContent, "Filter: Name");
    assert.equal(button().getAttribute("aria-expanded"), "true");
    assert.equal(deepActiveElement()?.getAttribute("type"), "search", "focus in the value search");

    await input.press("Escape");
    assert.equal($(table, '[role="dialog"]'), null, "closed");
    assert.equal(deepActiveElement(), button(), "focus back on the filter button");
    assert.equal(button().getAttribute("aria-expanded"), "false");
}, { cdp: true });

async function openNameFilter(table) {
    const button = $(table, '[data-fk="filter:name"]');
    button.focus();
    await input.press("Enter");
}
async function type(text) {
    for (const ch of text) await input.press(ch);
}
const valueBox = (table, value) => $(table, `.k-dt-overlay .k-dt-check[data-value="${value}"] input`);
const visibleValues = (table) => $$(table, ".k-dt-overlay .k-dt-check[data-value]")
    .filter((l) => l.style.display !== "none").map((l) => l.dataset.value);

test("Enter in the value filter search applies only the matches", async () => {
    const table = mount({ features: { filtering: true } });
    await openNameFilter(table);
    await type("ann");
    assert.deepEqual(visibleValues(table), ["Anna"]);
    await input.press("Enter");

    assert.equal($(table, '[role="dialog"]'), null, "dialog closed");
    assert.deepEqual(table.getState().filters.name?.values, ["Anna"], "hidden values are not part of the filter");
    assert.equal($$(table, "tbody tr").length, 5);
    assert.equal(deepActiveElement(), $(table, '[data-fk="filter:name"]'), "focus back on the filter button");
}, { cdp: true });

test("Enter in a pattern operand applies the condition", async () => {
    const table = mount({ features: { filtering: true } });
    await openNameFilter(table);
    $(table, '[role="tab"]:last-child').click();
    $(table, ".k-dt-overlay .k-dt-operands input").focus();
    await type("ann");
    await input.press("Enter");

    assert.equal($(table, '[role="dialog"]'), null, "dialog closed");
    assert.equal(table.getState().filters.name?.kind, "pattern");
    assert.equal(table.getState().filters.name?.operand, "ann");
    assert.equal(deepActiveElement(), $(table, '[data-fk="filter:name"]'), "focus back on the filter button");
}, { cdp: true });

test("value search checks the matches and restores the selection when cleared", async () => {
    const table = mount({ features: { filtering: true } });
    table.setState({ filters: { name: { kind: "value", values: ["Ben"] } } });
    await openNameFilter(table);
    const mode = $(table, ".k-dt-search-mode");
    const toggleAll = $(table, ".k-dt-check-all");
    assert.ok(mode.hidden, "result options hidden without a search");
    assert.equal(accessibleName(toggleAll), "Select all");

    await type("a");
    assert.deepEqual(visibleValues(table), ["Anna", "Clara", "David", "Emma"]);
    assert.ok(visibleValues(table).every((v) => valueBox(table, v).checked), "matches start checked");
    assert.equal(accessibleName(toggleAll), "Select all search results");
    assert.ok(toggleAll.querySelector("input").checked);
    assert.ok(!mode.hidden, "result options shown while searching");
    assert.equal(mode.querySelector("legend").textContent, "Search results");
    assert.deepEqual(Array.from(mode.querySelectorAll('input[type="radio"]')).map((r) => [accessibleName(r.closest("label")), r.checked]),
        [["Only these values", true], ["Add to filter", false]]);

    valueBox(table, "Emma").click();
    assert.ok(!toggleAll.querySelector("input").checked, "select all follows the boxes");

    const field = $(table, '.k-dt-overlay input[type="search"]');
    field.value = "";
    field.dispatchEvent(new Event("input"));
    assert.ok(mode.hidden);
    assert.deepEqual(["Anna", "Ben", "Emma"].map((v) => valueBox(table, v).checked), [false, true, false], "selection from before the search");
}, { cdp: true });

test("value search can add the matches to the existing filter", async () => {
    const table = mount({ features: { filtering: true } });
    table.setState({ filters: { name: { kind: "value", values: ["Ben", "Emma"] } } });
    await openNameFilter(table);
    await type("la");
    assert.deepEqual(visibleValues(table), ["Clara"]);

    // Keyboard: Tab from the search field to the radio group, arrow to "add".
    const radios = $$(table, '.k-dt-search-mode input[type="radio"]');
    radios[0].focus();
    await input.press("ArrowDown");
    assert.ok(radios[1].checked, "arrow keys select the option");
    await input.press("Enter");
    assert.equal($(table, '[role="dialog"]'), null, "Enter on the option applies");
    assert.deepEqual(table.getState().filters.name?.values, ["Ben", "Clara", "Emma"]);
}, { cdp: true });

test("value search add keeps earlier values even if unchecked in the results", async () => {
    const table = mount({ features: { filtering: true } });
    table.setState({ filters: { name: { kind: "value", values: ["Anna", "Ben"] } } });
    await openNameFilter(table);
    await type("a");
    valueBox(table, "Anna").click();     // unchecked in the results, but part of the earlier filter
    valueBox(table, "David").click();    // unchecked, not part of it
    $(table, '.k-dt-search-mode input[value="add"]').click();
    $(table, ".k-dt-panel-actions .k-dt-btn-primary").click();
    assert.deepEqual(table.getState().filters.name?.values, ["Anna", "Ben", "Clara", "Emma"]);
}, { cdp: true });

test("filter tabs follow the tabs pattern", async () => {
    const table = mount({ features: { filtering: true } });
    $(table, '[data-fk="filter:name"]').click();
    const tabs = $$(table, '[role="tab"]');
    assert.equal($(table, '[role="tablist"]').getAttribute("aria-label"), "Filter type");
    assert.deepEqual(tabs.map((t) => t.getAttribute("aria-selected")), ["true", "false"]);
    assert.deepEqual(tabs.map((t) => t.tabIndex), [0, -1]);
    tabs[0].focus();
    await input.press("ArrowRight");
    assert.deepEqual(tabs.map((t) => t.getAttribute("aria-selected")), ["false", "true"]);
    assert.equal(deepActiveElement(), tabs[1]);
    const panels = $$(table, '[role="tabpanel"]');
    assert.deepEqual(panels.map((p) => p.hidden), [true, false]);
    assert.equal(panels[1].getAttribute("aria-labelledby"), tabs[1].id);
    assert.ok($(table, ".k-dt-overlay select").labels.length === 1, "operator select has a label");
}, { cdp: true });

test("Tab is trapped inside an open panel", async () => {
    const table = mount({ features: { columnVisibility: true } });
    $(table, '[data-fk="tb:columns"]').focus();
    await input.press("Enter");
    const boxes = $$(table, '.k-dt-overlay input[type="checkbox"]');
    assert.equal(deepActiveElement(), boxes[0]);
    boxes.at(-1).focus();
    await input.press("Tab");
    assert.equal(deepActiveElement(), boxes[0], "wraps to first");
    await input.press("Tab", ["Shift"]);
    assert.equal(deepActiveElement(), boxes.at(-1), "wraps to last");
}, { cdp: true });

test("column chooser: one switch per column, named by the column", () => {
    const table = mount({ features: { columnVisibility: true }, initial: { hiddenColumns: ["fee"] } });
    $(table, '[data-fk="tb:columns"]').click();
    const switches = $$(table, '.k-dt-overlay input[type="checkbox"]');
    assert.ok(switches.every((s) => s.getAttribute("role") === "switch"), "role=switch");
    assert.deepEqual(switches.map((s) => s.labels[0].textContent), COLUMNS.map((c) => c.label));
    assert.deepEqual(switches.map((s) => s.checked), [true, true, false, true, true], "on = visible");
});

test("value search mode is a segmented radio group", async () => {
    const table = mount({ features: { filtering: true } });
    await openNameFilter(table);
    const mode = $(table, ".k-dt-search-mode");
    assert.equal(mode.tagName, "FIELDSET");
    assert.equal(mode.querySelector("legend").textContent, "Search results");
    assert.ok(mode.querySelector(".k-dt-segmented"), "drawn as segments");
    assert.equal($$(table, '.k-dt-search-mode input[type="radio"]').length, 2);
});

test("column chooser stays open while toggling columns", () => {
    const table = mount({ features: { columnVisibility: true } });
    $(table, '[data-fk="tb:columns"]').click();
    const box = $$(table, '.k-dt-overlay input[type="checkbox"]')[1];
    box.focus();
    box.click();
    assert.ok($(table, '[role="dialog"]'), "still open");
    assert.equal($$(table, "thead th").length, COLUMNS.length - 1);
    assert.equal(deepActiveElement(), box, "focus stays on the checkbox");
    assert.equal($(table, '[data-fk="tb:columns"]').getAttribute("aria-expanded"), "true");
});

test("applying a filter closes the panel and returns focus to the filter button", async () => {
    const table = mount({ features: { filtering: true } });
    $(table, '[data-fk="filter:fee"]').focus();
    $(table, '[data-fk="filter:fee"]').click();
    const [operand] = $$(table, ".k-dt-overlay .k-dt-operands input");
    $(table, ".k-dt-overlay select").value = "gt";
    $(table, ".k-dt-overlay select").dispatchEvent(new Event("change"));
    operand.value = "150";
    $$(table, ".k-dt-overlay .k-dt-panel-actions button").at(-1).click();   // Apply
    assert.equal($(table, '[role="dialog"]'), null);
    assert.equal(deepActiveElement()?.dataset.fk, "filter:fee");
    await announced(table, `${$$(table, "tbody tr").length} rows`);
});

// ---- Filter summary ---------------------------------------------------------

function mountFiltered() {
    const table = mount({ features: { filtering: true, globalSearch: true } });
    table.setState({
        globalSearch: "e",
        filters: {
            name: { kind: "value", values: ["Ben", "Emma"] },
            fee: { kind: "pattern", operator: "gt", arity: 1, operand: "50" }
        }
    });
    return table;
}
const summaryEntries = (table) => $$(table, ".k-dt-overlay .k-dt-fsum-edit").map((b) => b.getAttribute("aria-label"));

test("filter summary: \"Filter (n)\" opens the active filters with their values", async () => {
    const table = mountFiltered();
    const open = $(table, '[data-fk="tb:filters"]');
    assert.equal(open.textContent, "Filter (3)");
    assert.equal(open.getAttribute("aria-haspopup"), "dialog");
    assert.equal(accessibleName($(table, '[data-fk="tb:clear"]')), "Clear all filters");
    assert.ok(hasIcon($(table, '[data-fk="tb:clear"]'), "x"));
    open.focus();
    await input.press("Enter");

    const dialog = $(table, '[role="dialog"]');
    assert.equal(table.shadowRoot.getElementById(dialog.getAttribute("aria-labelledby"))?.textContent, "Active filters");
    assert.equal($(table, '[data-fk="tb:filters"]').getAttribute("aria-expanded"), "true");
    assert.deepEqual(summaryEntries(table), [
        "Edit filter Search: “e”",
        "Edit filter Name: Ben, Emma",
        "Edit filter Fee: > €50.00"
    ]);
    assert.equal(deepActiveElement()?.dataset.fk, "fsum:edit:search", "focus on the first entry");
    assert.deepEqual($$(table, '.k-dt-overlay [data-fk^="fsum:remove:"]').map(accessibleName),
        ["Remove filter: Search", "Remove filter: Name", "Remove filter: Fee"]);
    assert.ok($$(table, ".k-dt-overlay .k-dt-fsum-item").every((li) => li.getBoundingClientRect().height >= 44), "touch targets");

    await input.press("Escape");
    assert.equal($(table, '[role="dialog"]'), null);
    assert.equal(deepActiveElement()?.dataset.fk, "tb:filters", "focus back on the opener");

    await input.press("Enter");
    assert.deepEqual($$(table, ".k-dt-overlay .k-dt-panel-actions button").map(accessibleName), ["Clear all filters", "Close"]);
    $(table, '[data-fk="fsum:close"]').focus();
    await input.press("Enter");
    assert.equal($(table, '[role="dialog"]'), null, "Close closes the panel");
    assert.equal(deepActiveElement()?.dataset.fk, "tb:filters", "focus back on the opener");
    assert.equal(table.getState().filters.name?.values.length, 2, "filters unchanged");
}, { cdp: true });

test("typing in the search field updates \"Filter (n)\" and keeps focus in the field", async () => {
    const table = mount({ features: { filtering: true, globalSearch: true } });
    const field = $(table, ".k-dt-search-input");
    field.focus();
    await type("an");
    await waitFor(() => $(table, '[data-fk="tb:filters"]'), { message: "filter buttons shown" });
    assert.equal($(table, '[data-fk="tb:filters"]').textContent, "Filter (1)");
    assert.equal(deepActiveElement(), field, "the same search field keeps focus");

    await input.press("Backspace");
    await input.press("Backspace");
    await waitFor(() => !$(table, '[data-fk="tb:filters"]'), { message: "filter buttons gone" });
    assert.equal(deepActiveElement(), field);
}, { cdp: true });

test("filter summary: removing one filter keeps the panel open, the last one closes it", async () => {
    const table = mountFiltered();
    $(table, '[data-fk="tb:filters"]').click();
    $(table, '[data-fk="fsum:remove:column:name"]').focus();
    $(table, '[data-fk="fsum:remove:column:name"]').click();
    assert.equal(table.getState().filters.name, undefined);
    assert.deepEqual(summaryEntries(table), ["Edit filter Search: “e”", "Edit filter Fee: > €50.00"]);
    assert.equal(deepActiveElement()?.dataset.fk, "fsum:remove:column:fee", "focus on the next remove button");
    assert.equal($(table, '[data-fk="tb:filters"]').textContent, "Filter (2)");
    await waitFor(() => /^\d+ rows$/.test(statusText(table)), { message: "result count announced in the panel" });

    $(table, '[data-fk="fsum:remove:column:fee"]').click();
    assert.equal(deepActiveElement()?.dataset.fk, "fsum:remove:search", "the last one left");
    $(table, '[data-fk="fsum:remove:search"]').click();
    assert.equal(table.getState().globalSearch, "");
    assert.equal($(table, ".k-dt-search-input").value, "");
    assert.equal($(table, '[role="dialog"]'), null, "closed with the last filter");
    assert.equal($(table, '[data-fk="tb:filters"]'), null);
    assert.ok(table.shadowRoot.contains(deepActiveElement()), "focus stays in the table");
});

test("filter summary: \"Clear all filters\" and the toolbar x reset everything", () => {
    let table = mountFiltered();
    $(table, '[data-fk="tb:filters"]').click();
    $(table, '[data-fk="fsum:clear"]').click();
    assert.equal($(table, '[role="dialog"]'), null);
    assert.deepEqual([table.getState().filters, table.getState().globalSearch], [{}, ""]);

    table = mountFiltered();
    $(table, '[data-fk="tb:clear"]').click();
    assert.equal($(table, '[role="dialog"]'), null, "no panel");
    assert.deepEqual([table.getState().filters, table.getState().globalSearch], [{}, ""]);
});

test("filter summary: an entry opens its column filter, which comes back to the summary", async () => {
    const table = mountFiltered();
    $(table, '[data-fk="tb:filters"]').click();
    $(table, '[data-fk="fsum:edit:column:fee"]').focus();
    await input.press("Enter");
    const dialog = () => $(table, '[role="dialog"]');
    assert.equal(table.shadowRoot.getElementById(dialog().getAttribute("aria-labelledby"))?.textContent, "Filter: Fee");
    assert.equal($(table, '[data-fk="tb:filters"]').getAttribute("aria-expanded"), "true");

    await input.press("Escape");
    assert.ok(dialog().classList.contains("k-dt-fsum-panel"), "Escape steps back to the summary");
    assert.equal(deepActiveElement()?.dataset.fk, "fsum:edit:column:fee");

    await input.press("Enter");
    const operand = $(table, ".k-dt-overlay .k-dt-operands input");
    operand.focus();
    operand.select();
    await type("100");
    await input.press("Enter");
    assert.equal(table.getState().filters.fee.operand, "100");
    assert.ok(dialog().classList.contains("k-dt-fsum-panel"), "Apply comes back to the summary");
    assert.equal(summaryEntries(table)[2], "Edit filter Fee: > €100.00");
    assert.equal(deepActiveElement()?.dataset.fk, "fsum:edit:column:fee");

    // Resetting the only column filter left with no search: nothing to come back to.
    table.setState({ globalSearch: "", filters: { fee: table.getState().filters.fee } });
    $(table, '[data-fk="tb:filters"]').click();
    $(table, '[data-fk="fsum:edit:column:fee"]').click();
    $$(table, ".k-dt-overlay .k-dt-panel-actions button")[0].click();   // Reset
    assert.equal(dialog(), null);
    assert.deepEqual(table.getState().filters, {});
}, { cdp: true });

test("filter summary: the search entry goes to the search field; German texts", async () => {
    const table = mount({ locale: "de-DE", features: { filtering: true, globalSearch: true } });
    table.setState({ globalSearch: "e", filters: { joined: { kind: "pattern", operator: "between", arity: 2, operand: "2021-01-01", operand2: "2022-12-31" } } });
    $(table, '[data-fk="tb:filters"]').click();
    assert.deepEqual(summaryEntries(table), ["Filter bearbeiten Suche: „e“", "Filter bearbeiten Joined: zwischen 01.01.2021 und 31.12.2022"]);
    assert.equal(accessibleName($(table, '[data-fk="fsum:clear"]')), "Alle Filter zurücksetzen");
    $(table, '[data-fk="fsum:edit:search"]').click();
    assert.equal($(table, '[role="dialog"]'), null);
    assert.equal(deepActiveElement()?.dataset.fk, "search");
});

// Identifies the Lucide icon inside `node` (same serialized markup as a fresh one).
const hasIcon = (node, name) => node.querySelector("svg")?.innerHTML === createIcon(name).innerHTML;

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

// ---- Saved views ----------------------------------------------------------

// In-memory adapter; `fail` makes the named methods reject.
function memoryAdapter(views = {}, { fail = [] } = {}) {
    const saved = new Map(Object.entries(views));
    const calls = [];
    const step = (method, fn) => (...args) => {
        calls.push([method, ...args]);
        return fail.includes(method) ? Promise.reject(new Error(`${method} failed`)) : fn(...args);
    };
    return {
        saved,
        calls,
        list: step("list", () => [...saved.keys()]),
        get: step("get", (n) => saved.get(n) ?? null),
        save: step("save", (n, d) => { saved.set(n, d); }),
        rename: step("rename", (from, to) => { saved.set(to, saved.get(from)); saved.delete(from); }),
        delete: step("delete", (n) => { saved.delete(n); })
    };
}
const SORT_DESC = [{ key: "name", direction: "desc" }];
const mountViews = (adapter, config = {}) => mount({ features: { savedViews: true, sorting: true }, storage: { adapter }, ...config });
const openViews = async (table) => {
    $(table, '[data-fk="tb:saved-views"]').click();
    await waitFor(() => !$(table, ".k-dt-overlay").hasAttribute("aria-busy"), { message: "views panel did not load" });
    return $(table, ".k-dt-overlay");
};
const viewNames = (table) => $$(table, ".k-dt-overlay .k-dt-views-name").map((n) => n.textContent);
const vk = (table, key) => $(table, `.k-dt-overlay [data-vk="${CSS.escape(key)}"]`);

test("saved views store the state without the page and fire events", async () => {
    const adapter = memoryAdapter();
    const table = mountViews(adapter);
    const events = [];
    for (const name of ["viewsave", "viewload", "viewrename", "viewdelete"]) {
        table.addEventListener(`jw-datatable:${name}`, (e) => events.push([name, e.detail]));
    }
    table.setState({ page: 3, sort: SORT_DESC });
    await table.saveView(" Desc ");
    assert.deepEqual(adapter.saved.get("Desc").sort, SORT_DESC, "name trimmed, sort stored");
    assert.ok(!("page" in adapter.saved.get("Desc")), "page not stored");
    assert.deepEqual(events[0], ["viewsave", { name: "Desc", state: adapter.saved.get("Desc") }]);

    table.setState({ sort: [] });
    assert.equal(await table.loadView("Desc"), true);
    assert.equal(columnTexts(table, 1)[0], "Felix");
    assert.equal(table.getState().page, 1, "a loaded view starts on page 1");
    assert.equal(events[1][0], "viewload");
    assert.equal(await table.loadView("Missing"), false, "unknown view");

    await table.renameView("Desc", "Z to A");
    assert.deepEqual(await table.listViews(), ["Z to A"]);
    assert.deepEqual(events[2], ["viewrename", { oldName: "Desc", name: "Z to A" }]);
    assert.deepEqual(table.getActiveView(), { name: "Z to A", modified: false }, "active view follows the rename");

    await table.deleteView("Z to A");
    assert.deepEqual(events[3], ["viewdelete", { name: "Z to A" }]);
    assert.equal(table.getActiveView(), null, "deleting the active view clears it");
});

test("the active view knows when the state differs from it", async () => {
    const table = mountViews(memoryAdapter(), { features: { savedViews: true, sorting: true, columnVisibility: true } });
    assert.equal(table.getActiveView(), null);
    table.setState({ hiddenColumns: ["fee", "active"] });
    await table.saveView("Lean");
    assert.deepEqual(table.getActiveView(), { name: "Lean", modified: false });
    table.setState({ sort: SORT_DESC });
    assert.equal(table.getActiveView().modified, true, "sort changed");
    table.setState({ sort: [], hiddenColumns: ["active", "fee"] });
    assert.equal(table.getActiveView().modified, false, "same columns in another order");
});

test("views drop columns that no longer exist", async () => {
    const adapter = memoryAdapter({ Old: {
        sort: [{ key: "gone", direction: "asc" }, ...SORT_DESC],
        filters: { gone: { kind: "value", values: ["x"] } },
        hiddenColumns: ["gone", "fee"],
        pinnedColumns: ["gone"]
    } });
    const table = mountViews(adapter, { features: { savedViews: true, sorting: true, filtering: true } });
    await table.loadView("Old");
    const state = table.getState();
    assert.deepEqual(state.sort, SORT_DESC);
    assert.deepEqual(state.filters, {});
    assert.deepEqual(state.hiddenColumns, ["fee"]);
    assert.deepEqual(state.pinnedColumns, []);
});

test("an adapter needs all five methods; the API rejects without the feature", async () => {
    const { rename, ...incomplete } = memoryAdapter();
    let error = null;
    try { mountViews(incomplete); } catch (e) { error = e; }
    assert.match(error?.message, /missing: rename/);

    const table = mount();
    assert.equal($(table, '[data-fk="tb:saved-views"]'), null, "no toolbar button");
    let rejected = false;
    await table.saveView("X").catch(() => { rejected = true; });
    assert.ok(rejected, "saveView rejects when saved views are off");
});

test("saved views panel: an empty name is an error tied to the field", async () => {
    const table = mountViews(memoryAdapter());
    const panel = await openViews(table);
    assert.equal(accessibleName(panel), "Saved views");
    assert.equal(vk(table, "name"), deepActiveElement(), "focus starts in the name field");
    vk(table, "save").click();
    const name = vk(table, "name");
    assert.equal(name.getAttribute("aria-invalid"), "true");
    assert.equal(table.shadowRoot.getElementById(name.getAttribute("aria-describedby"))?.textContent, "Please enter a name.");
    await announced(table, "Please enter a name.");
});

test("saved views panel: saving an existing name asks before overwriting", async () => {
    const adapter = memoryAdapter({ Mine: { sort: [] } });
    const table = mountViews(adapter);
    await openViews(table);
    vk(table, "name").value = "Mine";
    await input.press("Enter");
    const cancel = vk(table, "step-cancel");
    assert.equal(deepActiveElement(), cancel, "focus on Cancel");
    const group = cancel.closest('[role="group"]');
    assert.equal(accessibleName(group), "A view named “Mine” already exists. Overwrite it?");
    assert.ok(!adapter.calls.some(([m]) => m === "save"), "nothing saved yet");

    await input.press("Escape");
    assert.ok($(table, ".k-dt-overlay"), "Escape steps back, the panel stays open");
    assert.equal(vk(table, "step-cancel"), null, "question gone");
    assert.equal(deepActiveElement(), vk(table, "name"), "focus back in the name field");

    await input.press("Enter");
    vk(table, "step-cancel").previousElementSibling.click(); // Overwrite
    await announced(table, "View “Mine” saved");
    assert.ok(adapter.calls.some(([m, n]) => m === "save" && n === "Mine"), "saved after confirming");
    assert.equal(vk(table, "name").value, "", "name field cleared");
}, { cdp: true });

test("saved views panel: delete asks, then focus moves to the next view", async () => {
    const adapter = memoryAdapter({ A: {}, B: {}, C: {} });
    const table = mountViews(adapter);
    await openViews(table);
    const del = vk(table, "delete:B");
    assert.equal(accessibleName(del), "Delete: B");
    del.click();
    assert.equal(deepActiveElement(), vk(table, "step-cancel"), "focus on Cancel");
    assert.equal(accessibleName(vk(table, "step-cancel").closest('[role="group"]')), "Delete the view “B”?");
    vk(table, "step-cancel").previousElementSibling.click(); // Delete
    await announced(table, "View “B” deleted");
    assert.deepEqual(viewNames(table), ["A", "C"]);
    assert.equal(deepActiveElement(), vk(table, "load:C"), "focus on the next view");

    vk(table, "delete:C").click();
    vk(table, "step-cancel").click();
    assert.equal(deepActiveElement(), vk(table, "delete:C"), "Cancel returns to the delete button");
});

test("saved views panel: rename in place, existing names are refused", async () => {
    const adapter = memoryAdapter({ A: {}, B: {} });
    const table = mountViews(adapter);
    await openViews(table);
    vk(table, "rename:A").click();
    const field = vk(table, "rename-input");
    assert.equal(deepActiveElement(), field, "focus in the rename field");
    assert.equal(field.value, "A");
    assert.equal(accessibleName(field), "New name for “A”");

    field.value = "B";
    field.dispatchEvent(new Event("input"));
    await input.press("Enter");
    assert.equal(vk(table, "rename-input").getAttribute("aria-invalid"), "true");
    await announced(table, "A view named “B” already exists.");
    assert.ok(!adapter.calls.some(([m]) => m === "rename"), "not renamed");

    vk(table, "rename-input").value = "Alpha";
    vk(table, "rename-input").dispatchEvent(new Event("input"));
    await input.press("Enter");
    await announced(table, "View “A” renamed to “Alpha”");
    assert.deepEqual(viewNames(table), ["B", "Alpha"]);
    assert.equal(deepActiveElement(), vk(table, "load:Alpha"));

    vk(table, "rename:B").click();
    await input.press("Escape");
    assert.ok($(table, ".k-dt-overlay"), "Escape leaves the rename, not the panel");
    assert.equal(deepActiveElement(), vk(table, "rename:B"));
}, { cdp: true });

test("saved views panel: current view, modified state and update", async () => {
    const adapter = memoryAdapter({ Desc: { sort: SORT_DESC } });
    const table = mountViews(adapter);
    await table.loadView("Desc");
    table.setState({ sort: [] });
    await openViews(table);
    const active = $(table, ".k-dt-overlay .k-dt-views-active p");
    assert.equal(active.textContent, "Current view: Desc (modified)");
    assert.equal(vk(table, "load:Desc").getAttribute("aria-current"), "true");
    const update = vk(table, "update");
    assert.equal(table.shadowRoot.getElementById(update.getAttribute("aria-describedby")), active);
    update.click();
    await announced(table, "View “Desc” updated");
    assert.deepEqual(adapter.saved.get("Desc").sort, []);
    assert.equal(vk(table, "update"), null, "nothing left to update");
    assert.equal(deepActiveElement(), vk(table, "load:Desc"));
});

test("saved views panel: loading closes it and returns focus to the toolbar", async () => {
    const table = mountViews(memoryAdapter({ Desc: { sort: SORT_DESC } }));
    $(table, '[data-fk="tb:saved-views"]').focus();
    await openViews(table);
    vk(table, "load:Desc").click();
    await announced(table, "View “Desc” loaded");
    assert.equal($(table, ".k-dt-overlay"), null, "panel closed");
    assert.equal(deepActiveElement(), $(table, '[data-fk="tb:saved-views"]'));
    assert.equal(columnTexts(table, 1)[0], "Felix");
});

test("saved views panel: adapter failures are shown and can be retried", async () => {
    const adapter = memoryAdapter({ A: {} }, { fail: ["list"] });
    const table = mountViews(adapter);
    $(table, '[data-fk="tb:saved-views"]').click();
    await announced(table, "The saved views could not be loaded.");
    assert.ok($(table, ".k-dt-overlay"), "panel open despite the error");
    assert.equal(deepActiveElement(), vk(table, "retry"), "focus on Try again");
    adapter.list = () => [...adapter.saved.keys()];
    adapter.save = () => Promise.reject(new Error("offline"));
    vk(table, "retry").click();
    await waitFor(() => viewNames(table).length === 1, { message: "list after retry" });

    vk(table, "name").value = "New";
    vk(table, "save").click();
    await announced(table, "That did not work. Please try again.");
    assert.equal(vk(table, "name").getAttribute("aria-invalid"), "true");
    assert.equal(vk(table, "name").value, "New", "typed name kept");
});

test("German saved views panel", async () => {
    const table = mountViews(memoryAdapter({ A: {} }), { locale: "de-DE" });
    const panel = await openViews(table);
    assert.equal(accessibleName(panel), "Gespeicherte Ansichten");
    assert.equal(accessibleName(vk(table, "rename:A")), "Umbenennen: A");
});

test("sorting keeps the focused header button and the table element", async () => {
    const table = mount({ features: { sorting: true }, title: "Members" });
    const button = $(table, '[data-fk="sort:name"]');
    const tableEl = $(table, "table");
    button.focus();
    await input.press("Enter");
    assert.equal($(table, '[data-fk="sort:name"]'), button, "same button element");
    assert.equal($(table, "table"), tableEl, "same table element");
    assert.equal(deepActiveElement(), button);
    assert.equal($$(table, "thead th")[1].getAttribute("aria-sort"), "ascending");
    assert.equal(columnTexts(table, 1)[0], "Anna");
    await announced(table, "Sorted by Name ascending");
    await input.press("Enter");
    assert.equal($$(table, "thead th")[1].getAttribute("aria-sort"), "descending");
    assert.ok(hasIcon($$(table, "thead th")[1], "arrow-down"), "indicator updated in place");
}, { cdp: true });

test("search announces the result count once, after typing pauses", async () => {
    const table = mount({ features: { globalSearch: true } });
    const announcer = document.querySelector("body > [data-jw-datatable-announcer]");
    const texts = [];
    const observer = new MutationObserver(() => {
        const text = announcer.textContent.trim();
        if (text) texts.push(text);
    });
    observer.observe(announcer, { childList: true, characterData: true, subtree: true });
    const search = $(table, "input[type=search]");
    for (const value of ["c", "cl", "cla"]) {
        search.value = value;
        search.dispatchEvent(new Event("input", { bubbles: true }));
        await sleep(300);   // slower than the 200ms view debounce
    }
    await sleep(1500);
    observer.disconnect();
    assert.deepEqual(texts, ["5 rows"]);
});

// ---- Column pinning & scroll shadows ----------------------------------------

const headerKeys = (table) => $$(table, "thead th").map((th) => th.dataset.key);
const cellLeft = (table, key, row = 0) => {
    const cell = $(table, `[data-fk="cell:${row}:${key}"]`);
    return cell.getBoundingClientRect().left - $(table, ".k-dt-body").getBoundingClientRect().left;
};

test("pinned columns move to the front, stick with summed offsets and are part of the state", async () => {
    // A wide extra column makes the table overflow while the pins stay below the width limit.
    const columns = [...COLUMNS.map((c) => c.key === "fee" ? { ...c, pinned: true } : c),
        { key: "note", label: "A deliberately long column label that forces horizontal scrolling" }];
    const table = mount({ columns, features: { columnPinning: true } });
    table.style.width = "480px";
    assert.deepEqual(headerKeys(table), ["fee", "id", "name", "active", "joined", "note"]);
    assert.deepEqual(table.getState().pinnedColumns, ["fee"]);

    table.setState({ pinnedColumns: ["fee", "name"] });
    assert.deepEqual(headerKeys(table), ["fee", "name", "id", "active", "joined", "note"]);
    const pinned = $$(table, "thead th.k-dt-pinned");
    assert.equal(pinned.length, 2);
    assert.ok(pinned[1].classList.contains("k-dt-pinned-last"), "edge on the last pinned column");
    assert.equal(getComputedStyle(pinned[0]).position, "sticky");

    // Scrolled horizontally, pinned cells keep their place; others move.
    const body = $(table, ".k-dt-body");
    await waitFor(() => body.scrollWidth > body.clientWidth + 40, { message: "table should overflow" });
    const feeWidth = $$(table, "thead th")[0].getBoundingClientRect().width;
    const idLeft = cellLeft(table, "id");
    body.scrollLeft = 40;
    await nextFrame();
    assert.ok(Math.abs(cellLeft(table, "fee")) < 1.5, `fee at ${cellLeft(table, "fee")}`);
    assert.ok(Math.abs(cellLeft(table, "name") - feeWidth) < 1.5, `name at ${cellLeft(table, "name")}, expected ${feeWidth}`);
    assert.ok(Math.abs(cellLeft(table, "id") - (idLeft - 40)) < 1.5, "unpinned column scrolls underneath");
});

test("context menu pins and unpins a column with an announcement", async () => {
    const table = mount({ features: { columnPinning: true } });
    rightClick($$(table, "thead th")[2]);   // Fee
    const pinItem = $$(table, '[role="menuitem"]').find((i) => i.textContent.trim() === "Pin column");
    assert.ok(pinItem, "pin item present");
    pinItem.click();
    assert.deepEqual(headerKeys(table).slice(0, 1), ["fee"]);
    await announced(table, "Column “Fee” pinned");

    rightClick($$(table, "thead th")[0]);
    $$(table, '[role="menuitem"]').find((i) => i.textContent.trim() === "Unpin column").click();
    assert.deepEqual(headerKeys(table), COLUMNS.map((c) => c.key));
    await announced(table, "Column “Fee” unpinned");
});

test("column chooser offers pin toggle buttons with aria-pressed", () => {
    const table = mount({ features: { columnVisibility: true, columnPinning: true } });
    $(table, '[data-fk="tb:columns"]').click();
    const toggles = $$(table, ".k-dt-overlay .k-dt-pin-toggle");
    assert.equal(toggles.length, COLUMNS.length);
    assert.equal(accessibleName(toggles[1]), "Pin column: Name");
    assert.equal(toggles[1].getAttribute("aria-pressed"), "false");
    toggles[1].click();
    assert.equal(toggles[1].getAttribute("aria-pressed"), "true");
    assert.ok($(table, '[role="dialog"]'), "chooser stays open");
    assert.equal(headerKeys(table)[0], "name");
});

test("header unpin button keeps focus on the moved column header", async () => {
    const table = mount({ features: { columnPinning: true, sorting: true }, initial: { pinnedColumns: ["joined"] } });
    const button = $(table, '[data-fk="pin:joined"]');
    assert.equal(accessibleName(button), "Unpin column: Joined");
    button.focus();
    await input.press("Enter");
    assert.equal(headerKeys(table).at(-1), "joined");
    assert.equal(deepActiveElement()?.dataset.fk, "sort:joined");
    assert.equal($(table, '[data-fk="pin:joined"]'), null);
}, { cdp: true });

test("without room for all pins, the most recent ones stick and older ones scroll along", async () => {
    const columns = [...COLUMNS, { key: "note", label: "A deliberately long column label that forces horizontal scrolling" }];
    const table = mount({ columns, features: { columnPinning: true }, initial: { pinnedColumns: ["joined"] } });
    table.style.width = "300px";
    const body = $(table, ".k-dt-body");
    await waitFor(() => body.scrollWidth > body.clientWidth + 100, { message: "table should overflow" });

    // Pinning "name" leaves no room for both: "name" sticks at the left edge, "joined" pauses.
    rightClick($(table, '[data-fk="cell:0:name"]'));
    menuItem(table, "Pin column").click();
    assert.deepEqual(headerKeys(table).slice(0, 2), ["joined", "name"]);
    await announced(table, "Column “Name” pinned. Not enough room for all pinned columns; scrolling with the table for now: Joined.");
    assert.ok($(table, ".k-dt-viewport").classList.contains("has-pins"));
    $(table, ".k-dt-body").scrollLeft = 150;   // the body was re-rendered
    await nextFrame();
    assert.ok(Math.abs(cellLeft(table, "name")) < 1.5, `name sticks at the edge (${cellLeft(table, "name")})`);
    assert.ok(cellLeft(table, "joined") < -50, "joined scrolls away");

    table.style.width = "1600px";
    await waitFor(() => Math.abs(cellLeft(table, "name") - $$(table, "thead th")[0].getBoundingClientRect().width) < 1.5,
        { message: "with room again, both stick side by side" });
});

test("scroll shadows mark the edges with more content", async () => {
    const table = mount();
    table.style.width = "300px";
    const viewport = $(table, ".k-dt-viewport");
    const body = $(table, ".k-dt-body");
    await waitFor(() => viewport.classList.contains("is-overflow-right"), { message: "right shadow" });
    assert.ok(!viewport.classList.contains("is-overflow-left"));
    body.scrollLeft = body.scrollWidth;
    await waitFor(() => viewport.classList.contains("is-overflow-left") && !viewport.classList.contains("is-overflow-right"),
        { message: "left shadow only at the end" });
    table.style.width = "";
    await waitFor(() => !viewport.classList.contains("is-overflow-left") && !viewport.classList.contains("is-overflow-right"),
        { message: "no shadows without overflow" });
});

test("as a grid item the table stays inside its track and scrolls", async () => {
    const fixture = document.getElementById("fixture");
    fixture.style.cssText = "display:grid;grid-template-columns:1fr;width:300px";
    try {
        const table = mount();
        const body = $(table, ".k-dt-body");
        await waitFor(() => body.scrollWidth > body.clientWidth, { message: "body overflows" });
        assert.ok(table.getBoundingClientRect().width <= 300.5, "host keeps the track width");
    } finally {
        fixture.style.cssText = "";
    }
});

// ---- Cell overflow -----------------------------------------------------------

const LONG = "A remarkably long value that cannot possibly fit into a narrow column";

test("cellOverflow ellipsis: single line, tooltip only when cut off, full text on focus", async () => {
    const data = [{ ...DATA[0], name: LONG }, { ...DATA[1] }];
    const columns = COLUMNS.map((c) => c.key === "name" ? { ...c, maxWidth: "80px" } : c);
    const table = mount({ data, columns, cellOverflow: "ellipsis" });
    const value = (row) => $(table, `[data-fk="cell:${row}:name"] .k-dt-cell > :first-child`);
    const style = getComputedStyle(value(0));
    assert.equal(style.whiteSpace, "nowrap");
    assert.equal(style.textOverflow, "ellipsis");
    assert.ok($(table, '[data-fk="cell:0:name"] .k-dt-cell').getBoundingClientRect().width <= 80.5, "maxWidth caps the content");

    $(table, '[data-fk="cell:0:name"]').dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    assert.equal(value(0).title, LONG, "tooltip with the full text");
    $(table, '[data-fk="cell:1:name"]').dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    assert.ok(!value(1).hasAttribute("title"), "no tooltip when the text fits");

    $(table, '[data-fk="cell:0:name"]').focus();
    assert.equal(getComputedStyle(value(0)).whiteSpace, "normal", "focused cell shows everything");
});

test("cell overflow defaults to wrapping; columns can override the table setting", () => {
    const data = [{ ...DATA[0], name: LONG }];
    let table = mount({ data });
    assert.equal($$(table, ".k-dt-truncate").length, 0);
    const columns = COLUMNS.map((c) => c.key === "name" ? { ...c, overflow: "wrap" } : c);
    table = mount({ data, columns, cellOverflow: "ellipsis" });
    assert.ok(!$(table, '[data-fk="cell:0:name"]').classList.contains("k-dt-truncate"));
    assert.ok($(table, '[data-fk="cell:0:fee"]').classList.contains("k-dt-truncate"));
});

// ---- Column widths ------------------------------------------------------------

// 40 text columns in a narrow table: without a floor the browser squeezes each
// one down to its longest word.
const WIDE_KEYS = Array.from({ length: 40 }, (_, i) => `c${i}`);
const WIDE_DATA = [{ id: 1, ...Object.fromEntries(WIDE_KEYS.map((k) => [k, "some words that wrap a lot"])) }];
const wideColumns = (extra = {}) => [
    { key: "id", label: "ID", type: "integer" },
    ...WIDE_KEYS.map((key) => ({ key, label: key.toUpperCase(), ...(extra[key] || {}) }))
];
const thWidth = (table, key) => $(table, `thead th[data-key="${key}"]`).getBoundingClientRect().width;

test("columnMinWidth keeps text columns readable; numbers keep their natural width", async () => {
    const table = mount({ data: WIDE_DATA, columns: wideColumns(), columnMinWidth: "10rem" });
    table.style.width = "600px";
    await nextFrame();
    for (const key of WIDE_KEYS) assert.ok(thWidth(table, key) >= 159.5, `${key} is at least 10rem`);
    assert.ok(thWidth(table, "id") < 100, "the number column gets no floor");
    const body = $(table, ".k-dt-body");
    assert.ok(body.scrollWidth > body.clientWidth, "the table scrolls instead");
});

test("column minWidth and width are floors that win over columnMinWidth", async () => {
    const table = mount({
        data: WIDE_DATA,
        columns: wideColumns({ c0: { minWidth: "300px" }, c1: { width: "250px" } }),
        columnMinWidth: "10rem"
    });
    table.style.width = "600px";
    await nextFrame();
    assert.ok(thWidth(table, "c0") >= 299.5, "minWidth");
    assert.ok(Math.abs(thWidth(table, "c1") - 250) < 1, `width is not squeezed (${thWidth(table, "c1")})`);
});

test("numbers, dates and booleans never wrap; text does", () => {
    const table = mount();
    const whiteSpace = (key) => getComputedStyle($(table, `[data-fk="cell:0:${key}"] .k-dt-value`)).whiteSpace;
    for (const key of ["id", "fee", "active", "joined"]) assert.equal(whiteSpace(key), "nowrap", key);
    assert.equal(whiteSpace("name"), "normal");
});

// ---- Cards --------------------------------------------------------------------

test("cards list their fields as label/value pairs (dl/dt/dd)", () => {
    const table = mount({ features: { grid: true }, defaultLayout: "grid", grid: { titleColumn: "name" } });
    const card = $(table, '[data-fk="card:0"]');
    assert.equal(card.querySelector(".k-dt-card-title").textContent.trim(), "Anna");
    const labels = Array.from(card.querySelectorAll("dl > div > dt")).map((dt) => dt.textContent);
    assert.deepEqual(labels, ["ID", "Fee", "Active", "Joined"], "title column is not repeated");
    assert.equal(card.querySelector("dl > div > dd").textContent.trim(), "1");
});

// ---- Record details -----------------------------------------------------------

const menuItem = (table, text) => $$(table, '[role="menuitem"]').find((i) => i.textContent.trim() === text);
const dialogLabels = (table) => $$(table, ".k-dt-details dt").map((dt) => dt.textContent);

test("details dialog: opened from the context menu, labelled, lists hidden columns too", async () => {
    const table = mount({ features: { rowDetails: true }, initial: { hiddenColumns: ["joined"] } });
    $(table, '[data-fk="cell:1:fee"]').focus();
    rightClick($(table, '[data-fk="cell:1:fee"]'));
    menuItem(table, "Show details").click();

    const dialog = $(table, '[role="dialog"]');
    assert.ok(dialog?.classList.contains("k-dt-details"), "details dialog open");
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.equal(accessibleName(dialog), "Details: 2");
    assert.deepEqual(dialogLabels(table), ["ID", "Name", "Fee", "Active", "Joined"]);
    assert.equal($(table, ".k-dt-details-pos").textContent, "Record 2 of 30");
    assert.equal(deepActiveElement(), dialog.querySelector("h2"), "focus on the dialog heading");

    await sleep(10);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal($(table, '[role="dialog"]'), null);
    assert.equal(deepActiveElement()?.dataset.fk, "cell:1:fee", "focus back on the cell");
});

test("details dialog: previous/next walk across pages and focus returns to that row", async () => {
    const table = mount({ features: { rowDetails: true }, grid: { titleColumn: "name" } });
    $(table, '[data-fk="cell:9:id"]').focus();
    await input.press("F10", ["Shift"]);
    await input.press("Enter");   // "Show details" is the first item
    let [, next] = $$(table, ".k-dt-details-actions button");
    assert.equal(accessibleName(next), "Next record");
    assert.equal(accessibleName($(table, '[role="dialog"]')), "Details: David");

    next.focus();
    await input.press("Enter");
    assert.equal($(table, ".k-dt-details-pos").textContent, "Record 11 of 30");
    assert.equal(table.getState().page, 2, "table follows to page 2");
    assert.equal(deepActiveElement(), next, "focus stays on Next");
    await announced(table, "Record 11 of 30: Emma");

    await input.press("Escape");
    assert.equal(deepActiveElement()?.dataset.fk, "cell:0:id", "focus on the shown record's row");

    await input.press("F10", ["Shift"]);
    await input.press("Enter");
    const [prev, next2] = $$(table, ".k-dt-details-actions button");
    next = next2;

    // At the first record "Previous" is disabled and focus moves to "Next".
    prev.focus();
    for (let i = 0; i < 10; i++) prev.click();
    assert.equal($(table, ".k-dt-details-pos").textContent, "Record 1 of 30");
    assert.ok(prev.disabled, "Previous disabled on the first record");
    assert.equal(deepActiveElement(), next);
}, { cdp: true });

test("details dialog: Open runs onRowClick for the shown record", () => {
    let opened = null;
    const table = mount({ features: { rowDetails: true }, onRowClick: (row, index) => { opened = [row.id, index]; } });
    rightClick($(table, '[data-fk="cell:3:name"]'));
    menuItem(table, "Show details").click();
    $(table, ".k-dt-details-open").click();
    assert.deepEqual(opened, [4, 3]);
    assert.equal($(table, '[role="dialog"]'), null, "dialog closed");
});

test("no details entry without the feature", () => {
    const table = mount();
    rightClick($(table, '[data-fk="cell:0:name"]'));
    assert.equal(menuItem(table, "Show details"), undefined);
});

// ---- Compact layout ---------------------------------------------------------------

const COMPACT = { features: { compact: true }, defaultLayout: "compact" };

test("compact layout: marked (or first two) columns plus a details button per row", () => {
    let table = mount(COMPACT);
    assert.deepEqual(headerKeys(table), ["id", "name", undefined], "first two columns + details column");
    const detailsTh = $$(table, "thead th").at(-1);
    assert.equal(detailsTh.textContent, "Details", "details column has a (visually hidden) header");

    const columns = COLUMNS.map((c) => ["name", "fee"].includes(c.key) ? { ...c, compact: true } : c);
    table = mount({ ...COMPACT, columns, grid: { titleColumn: "name" } });
    assert.deepEqual(headerKeys(table).slice(0, 2), ["name", "fee"]);
    const button = $(table, '[data-fk="details:0"]');
    assert.equal(accessibleName(button), "Show details: Anna");
    assert.equal(button.getAttribute("aria-haspopup"), "dialog");
    assert.ok(/Enter opens the details/.test(table.shadowRoot.getElementById($(table, "table").getAttribute("aria-describedby")).textContent));

    button.click();
    assert.equal(button.getAttribute("aria-expanded"), "true");
    assert.deepEqual(dialogLabels(table), ["ID", "Name", "Fee", "Active", "Joined"], "dialog shows all columns in table order");
});

test("compact layout: tapping a row opens its details; links keep their action; onRowClick moves to Open", () => {
    let linked = null;
    let rowClicked = null;
    const columns = COLUMNS.map((c) => c.key === "name" ? { ...c, link: { handler: (row) => { linked = row.id; } } } : c);
    const table = mount({ ...COMPACT, columns, onRowClick: (row) => { rowClicked = row.id; } });
    $(table, '[data-fk="cell:2:id"]').click();
    assert.equal($(table, ".k-dt-details-pos")?.textContent, "Record 3 of 30");
    assert.equal(rowClicked, null, "row tap does not run onRowClick");
    $(table, ".k-dt-details-open").click();
    assert.equal(rowClicked, 3);

    $(table, '[data-fk="cell:4:name:link"]').click();
    assert.equal(linked, 5);
    assert.equal($(table, '[role="dialog"]'), null, "link click does not open the details");
});

test("compact layout: Enter on a cell or the details button opens the dialog; focus returns", async () => {
    const table = mount(COMPACT);
    $(table, '[data-fk="cell:1:id"]').focus();
    await input.press("Enter");
    assert.equal($(table, ".k-dt-details-pos")?.textContent, "Record 2 of 30");
    await input.press("Escape");
    assert.equal(deepActiveElement()?.dataset.fk, "cell:1:id");

    await input.press("End");
    assert.equal(deepActiveElement()?.dataset.fk, "cell:1:#details", "details cell is part of the grid navigation");
    await input.press("Enter");
    assert.ok($(table, '[role="dialog"]'), "Enter on the details cell opens the dialog");
    await input.press("Escape");
    assert.equal(deepActiveElement()?.dataset.fk, "cell:1:#details");

    const button = $(table, '[data-fk="details:1"]');
    button.focus();
    await input.press("Enter");
    assert.equal(button.getAttribute("aria-expanded"), "true");
    await input.press("Escape");
    assert.equal(deepActiveElement(), button, "focus back on the details button");
    assert.equal(button.getAttribute("aria-expanded"), "false");
}, { cdp: true });

test("a click beside an overlay only closes it; the page behind gets no hover and no click", async () => {
    const table = mount({ ...COMPACT, features: { compact: true, columnVisibility: true } });
    await input.click($(table, '[data-fk="cell:1:id"]'));
    assert.equal($(table, ".k-dt-details-pos")?.textContent, "Record 2 of 30");

    // A point on another row, beside the dialog.
    const dialog = $(table, '[role="dialog"]').getBoundingClientRect();
    const cell = $(table, '[data-fk="cell:4:id"]').getBoundingClientRect();
    const [x, y] = [cell.left + 4, cell.top + cell.height / 2];
    assert.ok(x < dialog.left || y < dialog.top || y > dialog.bottom, "the point lies beside the dialog");
    assert.ok(table.shadowRoot.elementFromPoint(x, y).classList.contains("k-dt-backdrop--dim"),
        "a dimmed backdrop takes the pointer");
    await input.clickAt(x, y);
    assert.equal($(table, '[role="dialog"]'), null, "closed, no other record opened");
    assert.equal($(table, ".k-dt-backdrop"), null);
    assert.equal(deepActiveElement()?.dataset.fk, "cell:1:id", "focus back on the row");

    // A panel: the same, without dimming.
    const opener = $(table, '[data-fk="tb:columns"]');
    await input.click(opener);
    assert.ok($(table, '[role="dialog"]'));
    const backdrop = table.shadowRoot.elementFromPoint(x, y);
    assert.ok(backdrop.classList.contains("k-dt-backdrop") && !backdrop.classList.contains("k-dt-backdrop--dim"));
    await input.clickAt(x, y);
    assert.equal($(table, '[role="dialog"]'), null);
    assert.equal(deepActiveElement(), opener, "focus back on the opener");
}, { cdp: true });

test("compact layout is part of the state and falls back to the table without the feature", () => {
    let table = mount({ features: { compact: true } });
    table.setState({ layout: "compact" });
    assert.ok($(table, ".k-dt-table--compact"));
    assert.equal(table.getState().layout, "compact");

    table = mount({ initial: { layout: "compact" } });
    assert.ok($(table, "table") && !$(table, ".k-dt-table--compact"), "plain table without features.compact");
});

test("the former view names (compactView, viewMode, defaultView) no longer apply", () => {
    let table = mount({ features: { grid: true, compactView: true }, defaultView: "grid" });
    assert.ok($(table, "table") && !$(table, ".k-dt-table--compact"), "table, no compact layout");
    table = mount({ features: { grid: true }, initial: { viewMode: "grid" } });
    assert.ok($(table, "table"), "initial.viewMode ignored");
    assert.ok(!("viewMode" in table.getState()), "state has no viewMode");
});

test("responsive.mobileLayout picks the compact layout below the breakpoint", async () => {
    await input.viewport(390, 800);
    const table = mount({ features: { grid: true, compact: true }, responsive: { enabled: true, mobileLayout: "compact" } });
    await waitFor(() => $(table, ".k-dt-table--compact"), { message: "expected compact layout on mobile" });
    await input.viewport(1280, 900);
    await waitFor(() => $(table, "table:not(.k-dt-table--compact)"), { message: "expected full table on desktop" });
}, { cdp: true });

// ---- In-place column updates & row layout ---------------------------------------

test("pinning keeps the table and the focused header button (no re-announced table)", async () => {
    const table = mount({ features: { columnPinning: true, sorting: true }, initial: { pinnedColumns: ["joined"] } });
    const tableEl = $(table, "table");
    const sortButton = $(table, '[data-fk="sort:joined"]');
    $(table, '[data-fk="pin:joined"]').focus();
    await input.press("Enter");
    assert.equal($(table, "table"), tableEl, "same table element");
    assert.equal(deepActiveElement(), sortButton, "focus on the same sort button");
    assert.equal(headerKeys(table).at(-1), "joined", "column moved back");

    rightClick($(table, '[data-fk="cell:0:fee"]'));
    menuItem(table, "Pin column").click();
    assert.equal($(table, "table"), tableEl, "context menu: same table element");
    assert.equal(headerKeys(table)[0], "fee");
    assert.ok($(table, '[data-fk="pin:fee"]'), "unpin button added in place");
}, { cdp: true });

test("hiding and showing a column keeps the table element", () => {
    const table = mount({ features: { columnVisibility: true } });
    const tableEl = $(table, "table");
    $(table, '[data-fk="tb:columns"]').click();
    const box = $$(table, '.k-dt-overlay input[type="checkbox"]')[2];
    box.click();
    assert.deepEqual(headerKeys(table), ["id", "name", "active", "joined"]);
    box.click();
    assert.deepEqual(headerKeys(table), COLUMNS.map((c) => c.key));
    assert.equal($(table, "table"), tableEl);
});

test("text in cells with a copy button lines up with plain cells; compact rows are as high as table rows", () => {
    const table = mount({ features: { compact: true } });
    const rowTop = $(table, "tbody tr").getBoundingClientRect().top;
    const top = (sel) => $(table, sel).getBoundingClientRect().top - rowTop;
    assert.ok(Math.abs(top('[data-fk="cell:0:name"] .k-dt-value') - top('[data-fk="cell:0:fee"] .k-dt-value')) < 1,
        "copy button does not push the text down");
    const tableRow = $(table, "tbody tr").getBoundingClientRect().height;
    table.setState({ layout: "compact" });
    const compactRow = $(table, "tbody tr").getBoundingClientRect().height;
    assert.ok(Math.abs(compactRow - tableRow) < 1, `compact ${compactRow}px vs table ${tableRow}px`);
});

// ---- Column order ---------------------------------------------------------------

const REORDER = { features: { columnReorder: true, sorting: true } };
const menuLabels = (table) => $$(table, '[role="menuitem"]').map((i) => i.textContent.trim());
const dragTo = (table, fromKey, toKey, after = false) => {
    const th = (key) => $(table, `thead th[data-key="${key}"]`);
    const dataTransfer = new DataTransfer();
    const target = th(toKey).getBoundingClientRect();
    const at = { clientX: after ? target.right - 2 : target.left + 2, clientY: target.top + 5 };
    const fire = (node, type, extra = {}) => node.dispatchEvent(new DragEvent(type, { bubbles: true, composed: true, cancelable: true, dataTransfer, ...extra }));
    const source = th(fromKey);
    fire(source, "dragstart");
    fire(th(toKey), "dragover", at);
    const marked = th(toKey).classList.contains(after ? "is-drop-after" : "is-drop-before");
    fire(th(toKey), "drop", at);
    fire(source, "dragend");
    return marked;
};

test("context menu moves columns; edges hide impossible moves; order is state and resettable", async () => {
    const table = mount(REORDER);
    const tableEl = $(table, "table");
    rightClick($$(table, "thead th")[0]);
    assert.ok(!menuLabels(table).includes("Move left") && !menuLabels(table).includes("Move to start"), "first column cannot move left");
    menuItem(table, "Move right").click();
    assert.deepEqual(headerKeys(table), ["name", "id", "fee", "active", "joined"]);
    await announced(table, "Column “ID” moved to position 2 of 5");
    assert.equal($(table, "table"), tableEl, "table updated in place");

    rightClick($(table, '[data-fk="cell:0:joined"]'));
    menuItem(table, "Move to start").click();
    assert.deepEqual(headerKeys(table), ["joined", "name", "id", "fee", "active"]);
    assert.deepEqual(table.getState().columnOrder, ["joined", "name", "id", "fee", "active"]);
    assert.deepEqual(columnTexts(table, 1).slice(0, 2), ["Anna", "Ben"], "body follows the header");

    rightClick($$(table, "thead th")[4]);
    assert.ok(!menuLabels(table).includes("Move to end"), "last column cannot move right");
    menuItem(table, "Reset column order").click();
    assert.deepEqual(headerKeys(table), COLUMNS.map((c) => c.key));
    await announced(table, "Column order reset");
    rightClick($$(table, "thead th")[1]);
    assert.ok(!menuLabels(table).includes("Reset column order"), "no reset in the default order");
});

test("moving across the pinned block pins or unpins; the boundary keeps the state", async () => {
    const table = mount({ features: { columnReorder: true, columnPinning: true }, initial: { pinnedColumns: ["id"] } });
    rightClick($(table, '[data-fk="cell:0:name"]'));
    menuItem(table, "Move left").click();
    assert.deepEqual(table.getState().pinnedColumns, ["name", "id"]);
    assert.deepEqual(headerKeys(table).slice(0, 2), ["name", "id"]);
    await announced(table, "Column “Name” pinned, position 1 of 5");

    rightClick($(table, '[data-fk="cell:0:id"]'));
    menuItem(table, "Move right").click();
    assert.deepEqual(table.getState().pinnedColumns, ["name"]);
    assert.deepEqual(headerKeys(table).slice(0, 3), ["name", "fee", "id"]);
    await announced(table, "Column “ID” unpinned, now position 3 of 5");

    // Dropped right after the pinned block: stays unpinned.
    dragTo(table, "joined", "name", true);
    assert.deepEqual(headerKeys(table), ["name", "joined", "fee", "id", "active"]);
    assert.deepEqual(table.getState().pinnedColumns, ["name"]);
});

test("drag and drop on the header reorders columns with a drop marker", () => {
    const table = mount(REORDER);
    assert.equal($(table, 'thead th[data-key="id"]').draggable, true);
    assert.ok(dragTo(table, "joined", "id"), "drop marker before the target");
    assert.deepEqual(headerKeys(table), ["joined", "id", "name", "fee", "active"]);
    assert.ok(dragTo(table, "joined", "fee", true), "drop marker after the target");
    assert.deepEqual(headerKeys(table), ["id", "name", "fee", "joined", "active"]);
    assert.equal($$(table, ".is-drop-before, .is-drop-after, .is-dragging").length, 0, "markers cleaned up");
});

test("Ctrl+Shift+Arrow on a header button moves the column and keeps focus", async () => {
    const table = mount(REORDER);
    const tableEl = $(table, "table");
    const button = $(table, '[data-fk="sort:fee"]');
    button.focus();
    await input.press("ArrowLeft", ["Alt", "Shift"]);
    assert.deepEqual(headerKeys(table), COLUMNS.map((c) => c.key), "Alt+Shift does nothing");
    await input.press("ArrowLeft", ["Control", "Shift"]);
    assert.deepEqual(headerKeys(table), ["id", "fee", "name", "active", "joined"]);
    assert.equal(deepActiveElement(), button, "same focused button");
    assert.equal($(table, "table"), tableEl);
    await input.press("ArrowRight", ["Control", "Shift"]);
    await input.press("ArrowRight", ["Control", "Shift"]);
    assert.deepEqual(headerKeys(table), ["id", "name", "active", "fee", "joined"]);
    await announced(table, "Column “Fee” moved to position 4 of 5");
}, { cdp: true });

test("column chooser: up/down buttons reorder, keep focus and follow the pinned block", async () => {
    const table = mount({ features: { columnVisibility: true, columnReorder: true, columnPinning: true }, initial: { pinnedColumns: ["joined"] } });
    $(table, '[data-fk="tb:columns"]').click();
    const rowKeys = () => $$(table, ".k-dt-overlay .k-dt-col-row").map((r) => r.dataset.key);
    assert.deepEqual(rowKeys(), ["joined", "id", "name", "fee", "active"], "listed in display order");
    const up = (key) => $(table, `[data-fk="colmove:up:${key}"]`);
    const down = (key) => $(table, `[data-fk="colmove:down:${key}"]`);
    assert.equal(accessibleName(up("name")), "Move up: Name");
    assert.ok(up("joined").disabled && down("active").disabled, "ends are disabled");

    const button = up("id");
    button.focus();
    button.click();   // first unpinned → into the pinned block
    assert.deepEqual(rowKeys(), ["id", "joined", "name", "fee", "active"]);
    assert.equal(deepActiveElement(), down("id"), "Up got disabled: focus moves to Down");
    assert.equal($(table, '.k-dt-col-row[data-key="id"] .k-dt-pin-toggle').getAttribute("aria-pressed"), "true");
    assert.deepEqual(headerKeys(table), ["id", "joined", "name", "fee", "active"]);
    await announced(table, "Column “ID” pinned, position 1 of 5");
    assert.ok($(table, '[role="dialog"]'), "chooser stays open");
});

test("columnOrder in setState is normalized", () => {
    const table = mount(REORDER);
    table.setState({ columnOrder: ["fee", "nope", "fee", "id"] });
    assert.deepEqual(table.getState().columnOrder, ["fee", "id", "name", "active", "joined"]);
    assert.deepEqual(headerKeys(table), ["fee", "id", "name", "active", "joined"]);
});

// ---- Export -----------------------------------------------------------------

// Captures export events; `cancel` keeps the browser from downloading.
function captureExports(table, { cancel = true } = {}) {
    const events = [];
    table.addEventListener("jw-datatable:export", (e) => {
        events.push(e.detail);
        if (cancel) e.preventDefault();
    });
    return events;
}
const exportDialog = (table) => $(table, ".k-dt-export[role='dialog']");
// Input of the option/switch labelled `text` (exact match first, then prefix).
const exportControl = (table, text) => {
    const labels = $$(table, ".k-dt-export label");
    return (labels.find((l) => l.textContent.trim() === text)
        ?? labels.find((l) => l.textContent.trim().startsWith(text)))?.querySelector("input");
};
const submitExport = (table) => $(table, ".k-dt-export button[type='submit']").click();

test("export: toolbar button opens a labelled dialog with format and file name", async () => {
    const table = mount({ title: "Members", features: { export: true } });
    const button = $(table, '[data-fk="tb:export"]');
    assert.equal(accessibleName(button), "Export");
    assert.equal(button.getAttribute("aria-haspopup"), "dialog");
    button.focus();
    button.click();

    const dialog = exportDialog(table);
    assert.ok(dialog, "dialog open");
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.equal(accessibleName(dialog), "Export");
    assert.equal(button.getAttribute("aria-expanded"), "true");
    assert.equal(deepActiveElement(), exportControl(table, "CSV"), "focus on the selected format");
    assert.ok(exportControl(table, "CSV").checked, "CSV is the default format");
    assert.equal(accessibleName(dialog.querySelector("fieldset legend")), "Format");
    const filename = dialog.querySelector('input[type="text"]');
    assert.equal(dialog.querySelector(`label[for="${filename.id}"]`)?.textContent, "File name");
    assert.match(filename.value, /^Members_\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d\.csv$/);

    // Everything else waits behind "More options".
    const toggle = $(table, ".k-dt-disclosure");
    const more = $(table, ".k-dt-export-more");
    assert.equal(accessibleName(toggle), "More options");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(toggle.getAttribute("aria-controls"), more.id);
    assert.ok(more.hidden, "options collapsed");
    toggle.click();
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    assert.ok(!more.hidden, "options expanded");

    // Defaults
    assert.ok(exportControl(table, "Current filter").checked, "scope: current filter");
    assert.equal(exportControl(table, "Include hidden columns"), undefined, "no hidden columns, no option");
    assert.ok(!exportControl(table, "Values as displayed").checked, "raw values");
    assert.ok(exportControl(table, "Header row").checked, "header row");
    assert.ok(exportControl(table, "Label").checked, "labels as column names");
    assert.equal(more.querySelector("select").value, ";", "delimiter");
    assert.equal(dialog.querySelector(`label[for="${more.querySelector("select").id}"]`)?.textContent, "Delimiter");

    $$(table, ".k-dt-export button").find((b) => b.textContent === "Cancel").click();
    assert.equal(exportDialog(table), null, "closed");
    assert.equal(deepActiveElement(), button, "focus back on the button");
    assert.equal(button.getAttribute("aria-expanded"), "false");
});

test("export: default CSV has raw values of the filtered rows, then an announcement", async () => {
    const table = mount({ features: { export: true, globalSearch: true }, initial: { globalSearch: "Anna" } });
    const events = captureExports(table, { cancel: false });
    $(table, '[data-fk="tb:export"]').click();
    submitExport(table);
    assert.equal(exportDialog(table), null, "dialog closed");
    assert.equal(events.length, 1);
    const [detail] = events;
    assert.equal(detail.format, "csv");
    assert.equal(detail.rowCount, 5);
    assert.match(detail.filename, /^export_.*\.csv$/);
    const lines = detail.content.split("\r\n");
    assert.equal(lines[0], "ID;Name;Fee;Active;Joined");
    assert.equal(lines[1], "1;Anna;0;false;2020-01-15");
    assert.equal(lines.length, 6);
    await announced(table, `5 rows exported to “${detail.filename}”`);
});

test("export: options for scope, columns, formatting, header and delimiter", () => {
    const table = mount({ locale: "de-DE", features: { export: true }, initial: { hiddenColumns: ["fee"] } });
    const events = captureExports(table);
    const run = (setup) => {
        $(table, '[data-fk="tb:export"]').click();
        $(table, ".k-dt-disclosure").click();
        setup();
        submitExport(table);
        return events.at(-1);
    };
    let detail = run(() => exportControl(table, "Aktuelle Seite").click());
    assert.equal(detail.rowCount, 10, "current page");
    assert.deepEqual(detail.columns, ["id", "name", "active", "joined"], "visible columns only");

    detail = run(() => {
        exportControl(table, "Gesamte Tabelle").click();
        exportControl(table, "Ausgeblendete Spalten einbeziehen").click();
        exportControl(table, "Werte wie angezeigt").click();
        exportControl(table, "Kopfzeile").click();
        const select = $(table, ".k-dt-export select");
        select.value = ",";
    });
    assert.equal(detail.rowCount, 30, "entire table");
    assert.deepEqual(detail.columns, ["id", "name", "fee", "active", "joined"], "hidden columns included in display order");
    assert.equal(detail.content.split("\r\n")[0].replace(/\u00a0/g, " "), '1,Anna,"0,00 €",Nein,15.01.2020', "formatted, no header, comma");
});

test("export: JSON swaps the extension, uses keys and offers column info", () => {
    const table = mount({ features: { export: true } });
    const events = captureExports(table);
    $(table, '[data-fk="tb:export"]').click();
    $(table, ".k-dt-disclosure").click();
    const filename = $(table, '.k-dt-export input[type="text"]');
    const json = exportControl(table, "JSON");
    json.click();
    assert.match(filename.value, /\.json$/, "extension follows the format");
    assert.ok(exportControl(table, "Header row").closest("label").hidden, "no header option");
    assert.ok($(table, ".k-dt-export select").closest(".k-dt-field").hidden, "no delimiter");
    assert.ok(exportControl(table, "Key").checked, "keys are the default names for JSON");
    const metadata = exportControl(table, "Include column info");
    assert.ok(!metadata.closest("label").hidden && !metadata.checked, "column info offered, off");
    filename.value = "members";
    submitExport(table);
    let detail = events.at(-1);
    assert.equal(detail.filename, "members.json");
    assert.deepEqual(JSON.parse(detail.content)[0], { id: 1, name: "Anna", fee: 0, active: false, joined: "2020-01-15" });

    $(table, '[data-fk="tb:export"]').click();
    $(table, ".k-dt-disclosure").click();
    exportControl(table, "JSON").click();
    exportControl(table, "Include column info").click();
    submitExport(table);
    detail = JSON.parse(events.at(-1).content);
    assert.deepEqual(detail.columns[2], { key: "fee", label: "Fee", type: "currency" });
    assert.equal(detail.data.length, 30);

    // Back to CSV: labels again; a choice the user made sticks.
    $(table, '[data-fk="tb:export"]').click();
    exportControl(table, "JSON").click();
    exportControl(table, "CSV").click();
    assert.ok(exportControl(table, "Label").checked, "labels for CSV");
    exportControl(table, "Key").click();
    exportControl(table, "Excel").click();
    assert.ok(exportControl(table, "Key").checked, "user choice kept");
});

test("export: XLSX downloads a workbook with typed cells", async () => {
    const table = mount({ title: "Members", features: { export: true } });
    const events = captureExports(table, { cancel: false });
    $(table, '[data-fk="tb:export"]').click();
    exportControl(table, "Excel").click();
    assert.match($(table, '.k-dt-export input[type="text"]').value, /^Members_.*\.xlsx$/);
    assert.ok(!exportControl(table, "Header row").closest("label").hidden, "header row option");
    submitExport(table);
    const detail = events.at(-1);
    assert.equal(detail.format, "xlsx");
    assert.ok(detail.content instanceof Uint8Array, "binary content");
    assert.deepEqual(Array.from(detail.content.slice(0, 4)), [0x50, 0x4B, 0x03, 0x04], "ZIP signature");
    const text = new TextDecoder().decode(detail.content);
    assert.match(text, /<sheet name="Members"/);
    assert.match(text, /<c r="C2" s="5"><v>0<\/v><\/c>/, "currency as number");
    await announced(table, `30 rows exported to “${detail.filename}”`);
});

// Replaces the async Clipboard API for one test; returns the written texts.
function stubClipboard() {
    const written = [];
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (text) => { written.push(text); } }
    });
    written.restore = () => { delete navigator.clipboard; };
    return written;
}

test("export: clipboard destination copies text with tabs, hides XLSX and the file name", async () => {
    const written = stubClipboard();
    try {
        const table = mount({ features: { export: true } });
        const events = captureExports(table, { cancel: false });
        $(table, '[data-fk="tb:export"]').click();
        $(table, ".k-dt-disclosure").click();
        exportControl(table, "Excel").click();
        exportControl(table, "Clipboard").click();
        assert.ok(exportControl(table, "CSV").checked, "XLSX falls back to CSV");
        assert.ok(exportControl(table, "Excel").closest("label").hidden, "XLSX not offered");
        assert.ok($(table, '.k-dt-export input[type="text"]').closest(".k-dt-field").hidden, "no file name");
        assert.equal($(table, ".k-dt-export select").value, "\t", "tab for pasting into spreadsheets");
        const submit = $(table, ".k-dt-export button[type='submit']");
        assert.equal(submit.textContent, "Copy");
        submit.click();
        assert.equal(events.at(-1).destination, "clipboard");
        await announced(table, "30 rows copied to clipboard");
        assert.equal(written[0].split("\r\n")[1], "1\tAnna\t0\tfalse\t2020-01-15");

        // Back to download: the delimiter returns to its default.
        $(table, '[data-fk="tb:export"]').click();
        exportControl(table, "Clipboard").click();
        exportControl(table, "File").click();
        assert.equal($(table, ".k-dt-export select").value, ";");
        assert.equal($(table, ".k-dt-export button[type='submit']").textContent, "Export");
    } finally {
        written.restore();
    }
});

test("copying cells, rows and columns neutralizes formulas", async () => {
    const written = stubClipboard();
    try {
        const table = mount({ data: [{ id: 1, name: "=cmd|' /C calc'!A0", fee: -5, active: true, joined: "2020-01-01" }] });
        rightClick($$(table, "tbody td")[1]);
        menuItem(table, "Copy cell").click();
        await announced(table, "Copied to clipboard: =cmd|' /C calc'!A0");
        rightClick($$(table, "tbody td")[1]);
        menuItem(table, "Copy row").click();
        rightClick($$(table, "tbody td")[1]);
        menuItem(table, "Copy column").click();
        await waitFor(() => written.length === 3);
        assert.equal(written[0], "'=cmd|' /C calc'!A0", "cell");
        assert.equal(written[1].split("\t")[1], "'=cmd|' /C calc'!A0", "row");
        assert.match(written[1].split("\t")[2], /^-/, "negative number unchanged");
        assert.equal(written[2], "'=cmd|' /C calc'!A0", "column");
    } finally {
        written.restore();
    }
});

test("export: header row off hides the column-name option for CSV", () => {
    const table = mount({ features: { export: true } });
    $(table, '[data-fk="tb:export"]').click();
    const names = exportControl(table, "Label").closest("fieldset");
    assert.ok(!names.hidden);
    exportControl(table, "Header row").click();
    assert.ok(names.hidden);
});

test("export: context menu opens the dialog, Escape returns focus to the cell", async () => {
    const table = mount({ features: { export: true } });
    const cell = $(table, '[data-fk="cell:1:name"]');
    cell.focus();
    rightClick(cell);
    menuItem(table, "Export…").click();
    assert.ok(exportDialog(table), "dialog open");
    await sleep(10);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(exportDialog(table), null);
    assert.equal(deepActiveElement()?.dataset.fk, "cell:1:name", "focus back on the cell");
});

test("export: keyboard — Enter opens, Enter on the format submits, focus returns", async () => {
    const table = mount({ features: { export: true } });
    const events = captureExports(table);
    $(table, '[data-fk="tb:export"]').focus();
    await input.press("Enter");
    assert.ok(exportDialog(table), "dialog open");
    await input.press("ArrowDown");   // XLSX
    await input.press("ArrowDown");   // JSON
    assert.ok(exportControl(table, "JSON").checked);
    await input.press("Enter");
    assert.equal(exportDialog(table), null, "submitted");
    assert.equal(events.at(-1)?.format, "json");
    assert.equal(deepActiveElement()?.dataset.fk, "tb:export", "focus back on the button");

    await input.press("Enter");
    await input.press("Tab");         // destination
    await input.press("Tab");         // file name
    assert.equal(deepActiveElement()?.type, "text");
    await input.press("Enter");
    assert.equal(events.at(-1)?.format, "csv");
}, { cdp: true });

test("export: exportData() API, cancelable event, defaults", () => {
    const table = mount({ title: "T", exportFilename: "list", features: { export: true }, exportDefaults: { names: "key" } });
    const events = captureExports(table);
    const result = table.exportData({ scope: "page", headers: true });
    assert.equal(result, null, "cancelled by the listener");
    assert.equal(events[0].rowCount, 10);
    assert.match(events[0].filename, /^list_.*\.csv$/, "exportFilename is the base name");
    assert.equal(events[0].content.split("\r\n")[0], "id;name;fee;active;joined", "exportDefaults apply");
    table.exportData({ format: "json", filename: "x" });
    assert.equal(events[1].filename, "x.json");
    table.exportData({ format: "xlsx", destination: "clipboard" });
    assert.equal(events[2].destination, "download", "XLSX can only be downloaded");
    assert.equal(table.exportCSV, undefined, "exportCSV() removed");
});

test("export: the former csvExport flag no longer enables export", () => {
    const table = mount({ features: { csvExport: true } });
    assert.equal($(table, '[data-fk="tb:export"]'), null);
});

test("copy column does not need the export feature", () => {
    const table = mount();
    rightClick($$(table, "tbody td")[1]);
    assert.ok(menuItem(table, "Copy column"), "Copy column offered");
    assert.equal(menuItem(table, "Export…"), undefined, "no export without the feature");
});

test("export: segmented options and switches — roles, names, keyboard, touch targets", async () => {
    await input.viewport(390, 844);
    const table = mount({ features: { export: true } });
    $(table, '[data-fk="tb:export"]').focus();
    await input.press("Enter");
    $(table, ".k-dt-disclosure").click();

    // Segments are native radios: one tab stop per group, arrows select.
    const csv = exportControl(table, "CSV");
    assert.equal(deepActiveElement(), csv);
    assert.equal(csv.type, "radio");
    assert.equal(csv.closest("fieldset").querySelector("legend").textContent, "Format");
    await input.press("ArrowRight");
    assert.ok(exportControl(table, "Excel").checked, "arrow selects the next option");
    assert.equal(deepActiveElement(), exportControl(table, "Excel"));
    await input.press("Tab");
    assert.equal(deepActiveElement(), exportControl(table, "File"), "Tab moves to the next group");
    const page = exportControl(table, "Current page");
    assert.equal(page.labels[0].textContent, "Current page 10 rows", "name includes the row count");

    // Switches: checkbox with role="switch", named by their row, Space toggles.
    const localized = exportControl(table, "Values as displayed");
    assert.equal(localized.type, "checkbox");
    assert.equal(localized.getAttribute("role"), "switch");
    assert.equal(localized.labels[0].textContent, "Values as displayed (formatted)");
    localized.focus();
    await input.press(" ");
    assert.ok(localized.checked, "Space switches on");
    assert.ok(getComputedStyle(localized).outlineStyle !== "none", "visible focus");

    // Touch targets ≥ 44px on mobile.
    for (const node of [...$$(table, ".k-dt-segment"), ...$$(table, ".k-dt-switch")].filter((n) => !n.hidden)) {
        assert.ok(node.getBoundingClientRect().height >= 44, `${node.textContent.trim()}: ${node.getBoundingClientRect().height}px`);
    }
}, { cdp: true });
