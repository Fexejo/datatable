// Rendering: public API, table, sorting, pagination, search, layouts, responsive, widths, cards.

import { test, assert, nextFrame, waitFor, deepActiveElement, accessibleName, input } from "./harness.js";
import { ENTRY, api, createDataTable, DATA, COLUMNS, mount, $, $$, columnTexts, rightClick, headerKeys, menuItem, root, announced, mountSticky, scrollPagePast, headerBox } from "./helpers.js";

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
    const b = mount({ styles: ".jw-dt-title { color: rgb(1, 2, 3); }", title: "B" });
    a.after(b);
    const [shared] = root(a).adoptedStyleSheets;
    assert.equal(root(a).adoptedStyleSheets.length, 1);
    assert.equal(root(b).adoptedStyleSheets[0], shared, "same sheet object");
    assert.equal(getComputedStyle($(b, ".jw-dt-title")).color, "rgb(1, 2, 3)");
    assert.equal(root(a).querySelector("style"), null, "no <style> element per render");
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
    /** @type {any} */
    let detail = null;
    table.addEventListener("jw-datatable:datachange", (/** @type {any} */ e) => { detail = e.detail; });
    table.setData(DATA.slice(0, 3));
    assert.equal($$(table, "tbody tr").length, 3);
    assert.equal(detail?.data?.length, 3);
});

test("the data property replaces rows; refresh() re-renders changed rows", () => {
    const table = mount();
    const rows = DATA.slice(0, 2).map((/** @type {any} */ row) => ({ ...row }));
    table.data = rows;
    assert.equal($$(table, "tbody tr").length, 2);
    assert.deepEqual(table.data, rows, "getter returns the rows");
    table.data[0].name = "Zoe";
    assert.equal(columnTexts(table, 1)[0], "Anna", "no re-render before refresh()");
    table.refresh();
    assert.equal(columnTexts(table, 1)[0], "Zoe");
});

test("rowClass and cellClass add classes per row and cell", () => {
    const columns = COLUMNS.map((c) => c.key === "fee" ? { ...c, cellClass: (/** @type {number} */ value) => (value > 100 ? "is-high fee" : "") } : c);
    const table = mount({ columns, rowClass: (row, index) => (row.active ? `active row-${index}` : null) });
    const rows = $$(table, "tbody tr");
    assert.ok(rows[1].classList.contains("active") && rows[1].classList.contains("row-1"), "row classes split on spaces");
    assert.ok(!rows[0].classList.contains("active"), "falsy result adds nothing");
    const fees = $$(table, '[data-fk$=":fee"]');
    const high = fees.filter((td) => td.classList.contains("is-high"));
    assert.ok(high.length > 0 && high.every((td) => td.classList.contains("fee")), "cell classes");
    assert.ok(high.length < fees.length, "only matching cells");
});

// ---- Sorting --------------------------------------------------------------

test("clicking a sortable header cycles aria-sort and orders rows", () => {
    const table = mount({ features: { sorting: true } });
    const th = () => $$(table, "thead th")[1];
    assert.equal(th().getAttribute("aria-sort"), "none");

    th().querySelector("button.jw-dt-th-label").click();
    assert.equal(th().getAttribute("aria-sort"), "ascending");
    assert.equal(columnTexts(table, 1)[0], "Anna");

    th().querySelector("button.jw-dt-th-label").click();
    assert.equal(th().getAttribute("aria-sort"), "descending");
    assert.equal(columnTexts(table, 1)[0], "Felix");
});

test("headers are not buttons when sorting is disabled", () => {
    const table = mount();
    assert.equal($$(table, "thead button.jw-dt-th-label").length, 0);
});

// ---- Pagination -----------------------------------------------------------

test("pagination moves pages and marks the current page", () => {
    const table = mount();
    const nav = () => $(table, '[role="navigation"]');
    const buttons = () => Array.from(nav().querySelectorAll("button"));
    assert.ok(buttons()[0].disabled && buttons()[1].disabled, "first/prev disabled on page 1");
    assert.equal(nav().querySelector('[aria-current="page"]').textContent, "1");

    /** @type {any} */
    let changed = null;
    table.addEventListener("jw-datatable:change", (/** @type {any} */ e) => { changed = e.detail.state; });
    buttons().at(-2).click(); // next
    assert.equal(nav().querySelector('[aria-current="page"]').textContent, "2");
    assert.equal(columnTexts(table, 0)[0], "11");
    assert.equal(table.getState().page, 2);
    assert.equal(changed?.page, 2, "change event carries the page");
});

// 12 columns: a page of 500 rows would be 6000 cells.
const WIDE = Array.from({ length: 12 }, (_, i) => ({ key: `c${i}`, label: `C${i}`, type: "integer" }));
const wideRows = (/** @type {number} */ count) => Array.from({ length: count }, (_, r) =>
    Object.fromEntries(WIDE.map((c, i) => [c.key, r * 100 + i])));
const pageSizes = (/** @type {HTMLElement} */ table) => $$(table, '[data-fk="pagesize"] option').map((o) => Number(o.value));

test("footer and row counts have thousands separators", async () => {
    const data = Array.from({ length: 12000 }, (_, i) => ({ id: i }));
    const table = mount({ columns: [{ key: "id", label: "ID", type: "integer" }], data, locale: "de-DE",
        pagination: { pageSize: 10, pageSizeOptions: [10, 1000] } });
    assert.equal($(table, ".jw-dt-info > span").textContent, "1–10 von 12.000");
    assert.deepEqual($$(table, '[data-fk="pagesize"] option').map((o) => [o.value, o.textContent]),
        [["10", "10"], ["1000", "1.000"]]);
    const last = $(table, '[data-fk="page:n:1200"]');
    assert.equal(last.textContent, "1.200");
    assert.equal(last.getAttribute("aria-label"), "Seite 1.200");
    table.clearFilters();
    await announced(table, "12.000 Zeilen");

    $(table, '[data-fk="page:chevron-right"]').click();
    await announced(table, "11–20 von 12.000");
});

test("page sizes are offered while a page stays within 5000 rendered cells", () => {
    const table = mount({ columns: WIDE, data: wideRows(30), features: { grid: true } });
    assert.deepEqual(pageSizes(table), [10, 25, 50, 100, 250], "12 columns");
    table.setState({ hiddenColumns: ["c0", "c1"] });
    assert.deepEqual(pageSizes(table), [10, 25, 50, 100, 250, 500], "hidden columns don't count");
    table.setState({ layout: "grid" });
    assert.ok($(table, ".jw-dt-card"), "cards");
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
    $$(table, '.jw-dt-overlay input[type="checkbox"]')[0].click();
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
    /** @type {any[]} */
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
        const table = mount({ columns: WIDE, data: wideRows(500), features: { pagination: false } });
        assert.ok($(table, ".jw-dt-footer"), "pager shown");
        assert.equal($$(table, "tbody tr").length, 10);
        assert.equal(warnings.length, 1);
        assert.ok(warnings[0].includes("500 rows × 12 columns"), warnings[0]);

        table.setState({ hiddenColumns: ["c0", "c1"] });   // 500 × 10 = 5000 cells
        assert.ok(!$(table, ".jw-dt-footer"), "off again");
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
        $(table, ".jw-dt-backdrop").click();
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

// ---- Layout switch --------------------------------------------------------

test("layout switch is a named group of toggle buttons, one per available layout", () => {
    let table = mount();
    assert.equal($(table, ".jw-dt-layout-switch"), null, "no switch with only the table");

    table = mount({ features: { grid: true, compact: true } });
    const group = $(table, ".jw-dt-layout-switch");
    assert.equal(group.getAttribute("role"), "group");
    assert.equal(accessibleName(group), "Layout");
    const buttons = () => $$(table, ".jw-dt-layout-switch button");
    assert.deepEqual(buttons().map(accessibleName), ["Table", "Cards", "Compact"]);
    assert.deepEqual(buttons().map((b) => b.getAttribute("aria-pressed")), ["true", "false", "false"]);

    buttons()[1].focus();
    buttons()[1].click();
    assert.ok($(table, ".jw-dt-grid"), "grid rendered");
    assert.equal($$(table, ".jw-dt-card").length, 10);
    assert.deepEqual(buttons().map((b) => b.getAttribute("aria-pressed")), ["false", "true", "false"]);
    assert.equal(deepActiveElement()?.dataset.fk, "tb:layout:grid", "focus stays on the pressed button");
    assert.equal(table.getState().layout, "grid");
});

// ---- Responsive -----------------------------------------------------------

test("switches to card layout below the breakpoint", async () => {
    await input.viewport(390, 800);
    const table = mount({ features: { grid: true }, responsive: { enabled: true } });
    await waitFor(() => $(table, ".jw-dt-grid"), { message: "expected cards on mobile" });
    await input.viewport(1280, 900);
    await waitFor(() => $(table, "table"), { message: "expected the table on desktop" });
}, { cdp: true });

// ---- Cell overflow -----------------------------------------------------------

const LONG = "A remarkably long value that cannot possibly fit into a narrow column";

test("cellOverflow ellipsis: single line, tooltip only when cut off, full text on focus", async () => {
    const data = [{ ...DATA[0], name: LONG }, { ...DATA[1] }];
    const columns = COLUMNS.map((c) => c.key === "name" ? { ...c, maxWidth: "80px" } : c);
    const table = mount({ data, columns, cellOverflow: "ellipsis" });
    const value = (/** @type {any} */ row) => $(table, `[data-fk="cell:${row}:name"] .jw-dt-cell > :first-child`);
    const style = getComputedStyle(value(0));
    assert.equal(style.whiteSpace, "nowrap");
    assert.equal(style.textOverflow, "ellipsis");
    assert.ok($(table, '[data-fk="cell:0:name"] .jw-dt-cell').getBoundingClientRect().width <= 80.5, "maxWidth caps the content");

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
    assert.equal($$(table, ".jw-dt-truncate").length, 0);
    const columns = COLUMNS.map((c) => c.key === "name" ? { ...c, overflow: /** @type {const} */ ("wrap") } : c);
    table = mount({ data, columns, cellOverflow: "ellipsis" });
    assert.ok(!$(table, '[data-fk="cell:0:name"]').classList.contains("jw-dt-truncate"));
    assert.ok($(table, '[data-fk="cell:0:fee"]').classList.contains("jw-dt-truncate"));
});

// ---- Column widths ------------------------------------------------------------

// 40 text columns in a narrow table: without a floor the browser squeezes each
// one down to its longest word.
const WIDE_KEYS = Array.from({ length: 40 }, (_, i) => `c${i}`);
const WIDE_DATA = [{ id: 1, ...Object.fromEntries(WIDE_KEYS.map((k) => [k, "some words that wrap a lot"])) }];
const wideColumns = (/** @type {Record<string, object>} */ extra = {}) => [
    { key: "id", label: "ID", type: "integer" },
    ...WIDE_KEYS.map((key) => ({ key, label: key.toUpperCase(), ...(extra[key] || {}) }))
];
const thWidth = (/** @type {HTMLElement} */ table, /** @type {string} */ key) => $(table, `thead th[data-key="${key}"]`).getBoundingClientRect().width;

test("columnMinWidth keeps text columns readable; numbers keep their natural width", async () => {
    const table = mount({ data: WIDE_DATA, columns: wideColumns(), columnMinWidth: "10rem" });
    table.style.width = "600px";
    await nextFrame();
    for (const key of WIDE_KEYS) assert.ok(thWidth(table, key) >= 159.5, `${key} is at least 10rem`);
    assert.ok(thWidth(table, "id") < 100, "the number column gets no floor");
    const body = $(table, ".jw-dt-body");
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
    const whiteSpace = (/** @type {string} */ key) => getComputedStyle($(table, `[data-fk="cell:0:${key}"] .jw-dt-value`)).whiteSpace;
    for (const key of ["id", "fee", "active", "joined"]) assert.equal(whiteSpace(key), "nowrap", key);
    assert.equal(whiteSpace("name"), "normal");
});

// ---- Sticky header ----------------------------------------------------------

test("stickyHeader: the header follows the page below --jw-dt-sticky-top and stops at the table's end", async () => {
    const table = mountSticky();
    table.style.setProperty("--jw-dt-sticky-top", "3rem");
    const tableBox = () => $(table, "table").getBoundingClientRect();
    scrollPagePast(table, 300);
    await waitFor(() => Math.abs(headerBox(table).top - 48) < 1, { message: "header 3rem below the window's top" });
    const th = $(table, 'thead th[data-key="name"]');
    const { left, bottom } = th.getBoundingClientRect();
    assert.equal(root(table).elementFromPoint(left + 5, bottom - 5)?.closest("th"), th, "header drawn over the rows");
    assert.equal($(table, "table").tHead.rows[0], th.parentElement, "same table: headers keep labelling their columns");

    scrollPagePast(table, tableBox().height);
    await waitFor(() => Math.abs(headerBox(table).bottom - tableBox().bottom) < 1, { message: "header stops at the table's end" });
    scrollTo(0, 0);
    await waitFor(() => !$(table, "thead").style.getPropertyValue("--dt-head-shift"), { message: "header back in place" });
});

test("stickyHeader: follows a scrolling container, also after moving the table into one", async () => {
    const table = mountSticky();
    const box = document.createElement("div");
    box.style.cssText = "height: 400px; overflow: auto";
    table.after(box);
    box.append(table);
    box.scrollTop = 300;
    await waitFor(() => Math.abs(headerBox(table).top - box.getBoundingClientRect().top) < 1, { message: "header at the container's top" });
    // While the header would cover more than 30% of the container, it scrolls away with the rows.
    box.style.height = "100px";
    box.scrollTop = 310;
    await waitFor(() => !$(table, "thead").style.getPropertyValue("--dt-head-shift"), { message: "no shift in a low container" });
    assert.ok(headerBox(table).bottom < box.getBoundingClientRect().top, "header scrolled out of sight");
});

test("stickyHeader: only for tables without maxHeight; cards have no header to follow", async () => {
    const table = mountSticky({ maxHeight: "300px", features: { grid: true } });
    assert.ok(!$(table, ".jw-dt-viewport").classList.contains("is-sticky-head"), "maxHeight: sticks in the body");
    table.configure({ columns: COLUMNS, data: DATA, stickyHeader: true, features: { grid: true }, defaultLayout: "grid" });
    assert.ok(!$(table, ".jw-dt-viewport").classList.contains("is-sticky-head"), "cards");
    $(table, '[data-fk="tb:layout:table"]').click();
    assert.ok($(table, ".jw-dt-viewport").classList.contains("is-sticky-head"), "table layout");
    table.remove();
    assert.ok(!$(table, ".jw-dt-viewport").classList.contains("is-sticky-head"), "removed: stops following");
});

// ---- Cards --------------------------------------------------------------------

test("cards list their fields as label/value pairs (dl/dt/dd)", () => {
    const table = mount({ features: { grid: true }, defaultLayout: "grid", grid: { titleColumn: "name" } });
    const card = $(table, '[data-fk="card:0"]');
    assert.equal(card.querySelector(".jw-dt-card-title").textContent.trim(), "Anna");
    const labels = Array.from(card.querySelectorAll("dl > div > dt")).map((dt) => dt.textContent);
    assert.deepEqual(labels, ["ID", "Fee", "Active", "Joined"], "title column is not repeated");
    assert.equal(card.querySelector("dl > div > dd").textContent.trim(), "1");
});

test("theme variables set on an ancestor reach the table; unset ones fall back", () => {
    const fixture = /** @type {HTMLElement} */ (document.getElementById("fixture"));
    fixture.style.setProperty("--jw-dt-color-accent", "rgb(1, 2, 3)");
    fixture.style.setProperty("--jw-dt-color-border", "rgb(4, 5, 6)");
    try {
        const table = mount({ features: { sorting: true, grid: true } });
        const pressed = $(table, '.jw-dt-layout-switch [aria-pressed="true"]');
        assert.equal(getComputedStyle(pressed).backgroundColor, "rgb(1, 2, 3)", "accent");
        assert.equal(getComputedStyle($(table, ".jw-dt")).borderTopColor, "rgb(4, 5, 6)", "border");
        assert.equal(getComputedStyle($(table, ".jw-dt")).backgroundColor, "rgb(255, 255, 255)", "page default");
    } finally {
        fixture.style.removeProperty("--jw-dt-color-accent");
        fixture.style.removeProperty("--jw-dt-color-border");
    }
});

test("cards without data show the empty text", () => {
    const table = mount({ data: [], features: { grid: true }, defaultLayout: "grid" });
    assert.equal($(table, ".jw-dt-grid .jw-dt-empty").textContent, "No data.");
    assert.equal($(table, ".jw-dt-card"), null);
});

test("showing a column can force the pager in without a full re-render", () => {
    const warn = console.warn;
    /** @type {string[]} */
    const warnings = [];
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
        // 500 rows × 10 columns = 5000 cells: still without pagination.
        const table = mount({ columns: WIDE, data: wideRows(500), features: { pagination: false, columnVisibility: true },
            initial: { hiddenColumns: ["c0", "c1"] } });
        assert.ok(!$(table, ".jw-dt-footer"));
        const tableElement = $(table, "table");
        $(table, '[data-fk="tb:columns"]').click();
        $(table, ".jw-dt-overlay .jw-dt-switch input").click();   // show c0
        assert.ok($(table, ".jw-dt-footer"), "pager added");
        assert.equal($(table, "table"), tableElement, "table updated in place");
        assert.equal(warnings.length, 1);
    } finally {
        console.warn = warn;
    }
});

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
    const box = $$(table, '.jw-dt-overlay input[type="checkbox"]')[2];
    box.click();
    assert.deepEqual(headerKeys(table), ["id", "name", "active", "joined"]);
    box.click();
    assert.deepEqual(headerKeys(table), COLUMNS.map((c) => c.key));
    assert.equal($(table, "table"), tableEl);
});

test("text in cells with a copy button lines up with plain cells; compact rows are as high as table rows", () => {
    const table = mount({ features: { compact: true } });
    const rowTop = $(table, "tbody tr").getBoundingClientRect().top;
    const top = (/** @type {string} */ sel) => $(table, sel).getBoundingClientRect().top - rowTop;
    assert.ok(Math.abs(top('[data-fk="cell:0:name"] .jw-dt-value') - top('[data-fk="cell:0:fee"] .jw-dt-value')) < 1,
        "copy button does not push the text down");
    const tableRow = $(table, "tbody tr").getBoundingClientRect().height;
    table.setState({ layout: "compact" });
    const compactRow = $(table, "tbody tr").getBoundingClientRect().height;
    assert.ok(Math.abs(compactRow - tableRow) < 1, `compact ${compactRow}px vs table ${tableRow}px`);
});
