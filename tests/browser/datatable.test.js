// Component tests for <jw-datatable>, run in a real browser.

import { test, assert, nextFrame, sleep, waitFor, deepActiveElement, accessibleName, input } from "./harness.js";
import { createDataTable } from "../../datatable.js";

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
    // Re-render replaces the button; focus it again.
    th().querySelector("button").focus();
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
