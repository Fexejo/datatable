// Context menu: pointer, keyboard and touch.

import { test, assert, nextFrame, sleep, deepActiveElement, input } from "./harness.js";
import { DATA, mount, $, $$, columnTexts, rightClick } from "./helpers.js";

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
    await input.press("ArrowUp");
    assert.equal(deepActiveElement(), items.at(-1), "wraps around upwards");
    await input.press("Home");
    assert.equal(deepActiveElement(), items[0]);
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

test("touch: a long-press opens the context menu without clicking the row; a tap does not", async () => {
    let clicked = 0;
    const table = mount({ onRowClick: () => { clicked += 1; } });
    const cell = $(table, '[data-fk="cell:1:name"]');
    await input.longPress(cell, 100);
    assert.equal($(table, '[role="menu"]'), null, "short tap: no menu");
    assert.equal(clicked, 1, "short tap clicks the row");
    await input.longPress(cell, 600);
    assert.ok($(table, '[role="menu"]'), "long-press opens the menu");
    assert.equal(clicked, 1, "the release after a long-press does not click the row");
}, { cdp: true });
