// Component tests for <jw-datatable>, run in a real browser.
// `?dist` in the page URL runs them against the built bundle instead of the sources.

import { test, assert, nextFrame, sleep, waitFor, deepActiveElement, accessibleName, input } from "./harness.js";
import { createIcon } from "../../icons.js";

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
    columnVisibility: true, templates: true, csvExport: true
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
        "JwDataTable", "LocalStorageAdapter", "TemplateStore",
        "createDataTable", "default", "inferColumns", "inferType"
    ]);
    assert.equal(api.default, createDataTable);
    assert.equal(customElements.get("jw-datatable"), api.JwDataTable, "custom element registered");
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
    const cells = $$(table, "tbody td").map((td) => td.textContent.trim().replace(/[  ]/g, " "));
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

test("templates save the view without the current page", async () => {
    const saved = new Map();
    const adapter = {
        list: () => [...saved.keys()],
        get: (n) => saved.get(n) ?? null,
        save: (n, d) => { saved.set(n, d); },
        remove: (n) => { saved.delete(n); }
    };
    const table = mount({ features: { templates: true, sorting: true }, storage: { adapter } });
    table.setState({ page: 3, sort: [{ key: "name", direction: "desc" }] });
    await table.saveTemplate("Desc");
    assert.deepEqual(saved.get("Desc").sort, [{ key: "name", direction: "desc" }]);
    assert.ok(!("page" in saved.get("Desc")), "page not stored in template");

    table.setState({ sort: [] });
    await table.loadTemplate("Desc");
    assert.equal(columnTexts(table, 1)[0], "Felix");
    assert.deepEqual(await table.listTemplates(), ["Desc"]);
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
    $(table, '[data-fk="tb:templates"]').click();
    await waitFor(() => $(table, ".k-dt-overlay .k-dt-tpl-save"));
    check("templates panel");
});

// ---- View toggle ----------------------------------------------------------

test("view toggle names the target view and has no aria-pressed", () => {
    const table = mount({ features: { grid: true } });
    const toggle = () => $$(table, ".k-dt-toolbar button").find((b) => /view/i.test(accessibleName(b)));
    assert.equal(accessibleName(toggle()), "Grid view");
    assert.ok(!toggle().hasAttribute("aria-pressed"));

    toggle().click();
    assert.ok($(table, ".k-dt-grid"), "grid rendered");
    assert.equal($$(table, ".k-dt-card").length, 10);
    assert.equal(accessibleName(toggle()), "Table view");
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

test("switches to card view below the breakpoint", async () => {
    await input.viewport(390, 800);
    const table = mount({ features: { grid: true }, responsive: { enabled: true } });
    await waitFor(() => $(table, ".k-dt-grid"), { message: "expected grid view on mobile" });
    await input.viewport(1280, 900);
    await waitFor(() => $(table, "table"), { message: "expected table view on desktop" });
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

test("cards: single tab stop, arrow navigation, Enter triggers onRowClick", async () => {
    let clicked = null;
    const table = mount({ features: { grid: true }, defaultView: "grid", onRowClick: (row) => { clicked = row.id; } });
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
        [["Show only these values", true], ["Add these values to the filter", false]]);

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
    const table = mount({ features: { templates: true }, storage: { adapter: {
        list: () => [], get: () => null, save: () => {}, remove: () => {}
    } } });
    $(table, '[data-fk="tb:templates"]').click();
    const nameInput = await waitFor(() => $(table, ".k-dt-overlay .k-dt-tpl-save input"));
    nameInput.value = "Mine";
    nameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitFor(() => $(table, ".k-dt-overlay [data-live]")?.textContent.startsWith("Template “Mine” saved"), {
        message: "expected the announcement inside the open dialog"
    });
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

test("pins are suspended when they would cover most of the width", async () => {
    const table = mount({ features: { columnPinning: true } });
    table.style.width = "300px";
    table.setState({ pinnedColumns: ["joined", "fee", "name", "id"] });
    await waitFor(() => $(table, ".k-dt-pins-suspended"), { message: "expected suspended pins" });
    assert.ok(!$(table, ".k-dt-viewport").classList.contains("has-pins"));
    table.setState({ pinnedColumns: ["id"] });
    await waitFor(() => !$(table, ".k-dt-pins-suspended"), { message: "pins resume when there is room" });
    assert.ok($(table, ".k-dt-viewport").classList.contains("has-pins"));
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

    $(table, '[data-fk="cell:0:name"]').dispatchEvent(new PointerEvent("pointerenter"));
    assert.equal(value(0).title, LONG, "tooltip with the full text");
    $(table, '[data-fk="cell:1:name"]').dispatchEvent(new PointerEvent("pointerenter"));
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

// ---- Cards --------------------------------------------------------------------

test("cards list their fields as label/value pairs (dl/dt/dd)", () => {
    const table = mount({ features: { grid: true }, defaultView: "grid", grid: { titleColumn: "name" } });
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
