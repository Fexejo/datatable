// Columns: pinning, scroll shadows, order (keyboard, drag and drop, menu).

import { test, assert, nextFrame, waitFor, deepActiveElement, accessibleName, input } from "./harness.js";
import { COLUMNS, mount, $, $$, columnTexts, rightClick, announced, headerKeys, menuItem, root } from "./helpers.js";

// ---- Column pinning & scroll shadows ----------------------------------------

const cellLeft = (/** @type {HTMLElement} */ table, /** @type {string} */ key, /** @type {any} */ row = 0) => {
    const cell = $(table, `[data-fk="cell:${row}:${key}"]`);
    return cell.getBoundingClientRect().left - $(table, ".jw-dt-body").getBoundingClientRect().left;
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
    const pinned = $$(table, "thead th.jw-dt-pinned");
    assert.equal(pinned.length, 2);
    assert.ok(pinned[1].classList.contains("jw-dt-pinned-last"), "edge on the last pinned column");
    assert.equal(getComputedStyle(pinned[0]).position, "sticky");

    // Scrolled horizontally, pinned cells keep their place; others move.
    const body = $(table, ".jw-dt-body");
    await waitFor(() => body.scrollWidth > body.clientWidth + 40, { message: "table should overflow" });
    const feeWidth = $$(table, "thead th")[0].getBoundingClientRect().width;
    const idLeft = cellLeft(table, "id");
    body.scrollLeft = 40;
    await nextFrame();
    assert.ok(Math.abs(cellLeft(table, "fee")) < 1.5, `fee at ${cellLeft(table, "fee")}`);
    assert.ok(Math.abs(cellLeft(table, "name") - feeWidth) < 1.5, `name at ${cellLeft(table, "name")}, expected ${feeWidth}`);
    assert.ok(Math.abs(cellLeft(table, "id") - (idLeft - 40)) < 1.5, "unpinned column scrolls underneath");
    const nameCell = $(table, '[data-fk="cell:0:name"]');
    const edge = nameCell.getBoundingClientRect();
    assert.equal(getComputedStyle(nameCell).borderRightWidth, "2px");
    assert.equal(root(table).elementFromPoint(edge.right - 1, edge.top + edge.height / 2), nameCell, "edge drawn over the cells behind it");
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
    const toggles = $$(table, ".jw-dt-overlay .jw-dt-pin-toggle");
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
    const body = $(table, ".jw-dt-body");
    await waitFor(() => body.scrollWidth > body.clientWidth + 100, { message: "table should overflow" });

    // Pinning "name" leaves no room for both: "name" sticks at the left edge, "joined" pauses.
    rightClick($(table, '[data-fk="cell:0:name"]'));
    menuItem(table, "Pin column").click();
    assert.deepEqual(headerKeys(table).slice(0, 2), ["joined", "name"]);
    await announced(table, "Column “Name” pinned. Not enough room for all pinned columns; scrolling with the table for now: Joined.");
    assert.ok($(table, ".jw-dt-viewport").classList.contains("has-pins"));
    $(table, ".jw-dt-body").scrollLeft = 150;   // the body was re-rendered
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
    const viewport = $(table, ".jw-dt-viewport");
    const body = $(table, ".jw-dt-body");
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
    const fixture = /** @type {HTMLElement} */ (document.getElementById("fixture"));
    fixture.style.cssText = "display:grid;grid-template-columns:1fr;width:300px";
    try {
        const table = mount();
        const body = $(table, ".jw-dt-body");
        await waitFor(() => body.scrollWidth > body.clientWidth, { message: "body overflows" });
        assert.ok(table.getBoundingClientRect().width <= 300.5, "host keeps the track width");
    } finally {
        fixture.style.cssText = "";
    }
});

// ---- Column order ---------------------------------------------------------------

const REORDER = { features: { columnReorder: true, sorting: true } };
const menuLabels = (/** @type {HTMLElement} */ table) => $$(table, '[role="menuitem"]').map((i) => i.textContent.trim());
const dragTo = (/** @type {HTMLElement} */ table, /** @type {string} */ fromKey, /** @type {string} */ toKey, after = false) => {
    const th = (/** @type {string} */ key) => $(table, `thead th[data-key="${key}"]`);
    const dataTransfer = new DataTransfer();
    const target = th(toKey).getBoundingClientRect();
    const at = { clientX: after ? target.right - 2 : target.left + 2, clientY: target.top + 5 };
    const fire = (/** @type {Element} */ node, /** @type {string} */ type, extra = {}) => node.dispatchEvent(new DragEvent(type, { bubbles: true, composed: true, cancelable: true, dataTransfer, ...extra }));
    const source = th(fromKey);
    fire(source, "dragstart");
    fire(th(toKey), "dragover", at);
    // Leaving to another element clears the mark; dragging over again sets it.
    fire(th(toKey), "dragleave", { relatedTarget: document.body });
    const cleared = !th(toKey).matches(".is-drop-before, .is-drop-after");
    fire(th(toKey), "dragover", at);
    const marked = cleared && th(toKey).classList.contains(after ? "is-drop-after" : "is-drop-before");
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
    const rowKeys = () => $$(table, ".jw-dt-overlay .jw-dt-col-row").map((r) => r.dataset.key);
    assert.deepEqual(rowKeys(), ["joined", "id", "name", "fee", "active"], "listed in display order");
    const up = (/** @type {string} */ key) => $(table, `[data-fk="colmove:up:${key}"]`);
    const down = (/** @type {string} */ key) => $(table, `[data-fk="colmove:down:${key}"]`);
    assert.equal(accessibleName(up("name")), "Move up: Name");
    assert.ok(up("joined").disabled && down("active").disabled, "ends are disabled");

    const button = up("id");
    button.focus();
    button.click();   // first unpinned → into the pinned block
    assert.deepEqual(rowKeys(), ["id", "joined", "name", "fee", "active"]);
    assert.equal(deepActiveElement(), down("id"), "Up got disabled: focus moves to Down");
    assert.equal($(table, '.jw-dt-col-row[data-key="id"] .jw-dt-pin-toggle').getAttribute("aria-pressed"), "true");
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
