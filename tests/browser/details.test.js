// Record details dialog and the compact layout.

import { test, assert, sleep, waitFor, deepActiveElement, accessibleName, input } from "./harness.js";
import { COLUMNS, mount, $, $$, rightClick, announced, headerKeys, menuItem, COMPACT } from "./helpers.js";

// ---- Record details -----------------------------------------------------------

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
