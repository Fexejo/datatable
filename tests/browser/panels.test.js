// Panels as dialogs: filter panel, column chooser, filter summary.

import { test, assert, waitFor, deepActiveElement, accessibleName, input } from "./harness.js";
import { COLUMNS, mount, $, $$, statusText, announced, hasIcon, root } from "./helpers.js";
import { MAX_REGEX_LENGTH } from "../../src/core/filtering.js";

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
    assert.equal(root(table).getElementById(dialog.getAttribute("aria-labelledby"))?.textContent, "Filter: Name");
    assert.equal(button().getAttribute("aria-expanded"), "true");
    assert.equal(deepActiveElement()?.getAttribute("type"), "search", "focus in the value search");

    await input.press("Escape");
    assert.equal($(table, '[role="dialog"]'), null, "closed");
    assert.equal(deepActiveElement(), button(), "focus back on the filter button");
    assert.equal(button().getAttribute("aria-expanded"), "false");
}, { cdp: true });

async function openNameFilter(/** @type {HTMLElement} */ table) {
    const button = $(table, '[data-fk="filter:name"]');
    button.focus();
    await input.press("Enter");
}
async function type(/** @type {string} */ text) {
    for (const ch of text) await input.press(ch);
}
const valueBox = (/** @type {HTMLElement} */ table, /** @type {any} */ value) => $(table, `.jw-dt-overlay .jw-dt-check[data-value="${value}"] input`);
const visibleValues = (/** @type {HTMLElement} */ table) => $$(table, ".jw-dt-overlay .jw-dt-check[data-value]")
    .filter((l) => l.style.display !== "none").map((l) => l.dataset.value);

test("Enter in the value filter search applies only the matches", async () => {
    const table = mount({ features: { filtering: true } });
    await openNameFilter(table);
    await type("ann");
    assert.deepEqual(visibleValues(table), ["Anna"]);
    await input.press("Enter");

    assert.equal($(table, '[role="dialog"]'), null, "dialog closed");
    assert.deepEqual(/** @type {any} */ (table.getState().filters.name)?.values, ["Anna"], "hidden values are not part of the filter");
    assert.equal($$(table, "tbody tr").length, 5);
    assert.equal(deepActiveElement(), $(table, '[data-fk="filter:name"]'), "focus back on the filter button");
}, { cdp: true });

test("Enter in a pattern operand applies the condition", async () => {
    const table = mount({ features: { filtering: true } });
    await openNameFilter(table);
    $(table, '[role="tab"]:last-child').click();
    $(table, ".jw-dt-overlay .jw-dt-operands input").focus();
    await type("ann");
    await input.press("Enter");

    assert.equal($(table, '[role="dialog"]'), null, "dialog closed");
    assert.equal(table.getState().filters.name?.kind, "pattern");
    assert.equal(/** @type {any} */ (table.getState().filters.name)?.operand, "ann");
    assert.equal(deepActiveElement(), $(table, '[data-fk="filter:name"]'), "focus back on the filter button");
}, { cdp: true });

test("the RegEx operand is limited to the length that applies", async () => {
    const table = mount({ features: { filtering: true } });
    await openNameFilter(table);
    $(table, '[role="tab"]:last-child').click();
    const select = /** @type {HTMLSelectElement} */ ($(table, ".jw-dt-overlay select"));
    const operand = /** @type {HTMLInputElement} */ ($(table, ".jw-dt-overlay .jw-dt-operands input"));
    assert.equal(operand.maxLength, -1, "no limit for contains");
    select.value = "regex";
    select.dispatchEvent(new Event("change"));
    assert.equal(operand.maxLength, MAX_REGEX_LENGTH);
    select.value = "equals";
    select.dispatchEvent(new Event("change"));
    assert.equal(operand.maxLength, -1, "limit gone with another operator");
});

test("value search checks the matches and restores the selection when cleared", async () => {
    const table = mount({ features: { filtering: true } });
    table.setState({ filters: { name: { kind: "value", values: ["Ben"] } } });
    await openNameFilter(table);
    const mode = $(table, ".jw-dt-search-mode");
    const toggleAll = $(table, ".jw-dt-check-all");
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
    toggleAll.querySelector("input").click();
    assert.ok(visibleValues(table).every((v) => valueBox(table, v).checked), "select all checks the results again");
    toggleAll.querySelector("input").click();
    assert.ok(!visibleValues(table).some((v) => valueBox(table, v).checked), "and clears them");
    assert.ok(valueBox(table, "Ben").checked, "values hidden by the search keep their state");
    toggleAll.querySelector("input").click();

    const field = $(table, '.jw-dt-overlay input[type="search"]');
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
    const radios = $$(table, '.jw-dt-search-mode input[type="radio"]');
    radios[0].focus();
    await input.press("ArrowDown");
    assert.ok(radios[1].checked, "arrow keys select the option");
    await input.press("Enter");
    assert.equal($(table, '[role="dialog"]'), null, "Enter on the option applies");
    assert.deepEqual(/** @type {any} */ (table.getState().filters.name)?.values, ["Ben", "Clara", "Emma"]);
}, { cdp: true });

test("value search add keeps earlier values even if unchecked in the results", async () => {
    const table = mount({ features: { filtering: true } });
    table.setState({ filters: { name: { kind: "value", values: ["Anna", "Ben"] } } });
    await openNameFilter(table);
    await type("a");
    valueBox(table, "Anna").click();     // unchecked in the results, but part of the earlier filter
    valueBox(table, "David").click();    // unchecked, not part of it
    $(table, '.jw-dt-search-mode input[value="add"]').click();
    $(table, ".jw-dt-panel-actions .jw-dt-btn-primary").click();
    assert.deepEqual(/** @type {any} */ (table.getState().filters.name)?.values, ["Anna", "Ben", "Clara", "Emma"]);
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
    assert.ok($(table, ".jw-dt-overlay select").labels.length === 1, "operator select has a label");
}, { cdp: true });

test("Tab is trapped inside an open panel", async () => {
    const table = mount({ features: { columnVisibility: true } });
    $(table, '[data-fk="tb:columns"]').focus();
    await input.press("Enter");
    const boxes = $$(table, '.jw-dt-overlay input[type="checkbox"]');
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
    const switches = $$(table, '.jw-dt-overlay input[type="checkbox"]');
    assert.ok(switches.every((s) => s.getAttribute("role") === "switch"), "role=switch");
    assert.deepEqual(switches.map((s) => s.labels[0].textContent), COLUMNS.map((c) => c.label));
    assert.deepEqual(switches.map((s) => s.checked), [true, true, false, true, true], "on = visible");
});

test("value search mode is a segmented radio group", async () => {
    const table = mount({ features: { filtering: true } });
    await openNameFilter(table);
    const mode = $(table, ".jw-dt-search-mode");
    assert.equal(mode.tagName, "FIELDSET");
    assert.equal(mode.querySelector("legend").textContent, "Search results");
    assert.ok(mode.querySelector(".jw-dt-segmented"), "drawn as segments");
    assert.equal($$(table, '.jw-dt-search-mode input[type="radio"]').length, 2);
});

test("column chooser stays open while toggling columns", () => {
    const table = mount({ features: { columnVisibility: true } });
    $(table, '[data-fk="tb:columns"]').click();
    const box = $$(table, '.jw-dt-overlay input[type="checkbox"]')[1];
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
    const [operand] = $$(table, ".jw-dt-overlay .jw-dt-operands input");
    $(table, ".jw-dt-overlay select").value = "gt";
    $(table, ".jw-dt-overlay select").dispatchEvent(new Event("change"));
    operand.value = "150";
    $$(table, ".jw-dt-overlay .jw-dt-panel-actions button").at(-1).click();   // Apply
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
const summaryEntries = (/** @type {HTMLElement} */ table) => $$(table, ".jw-dt-overlay .jw-dt-fsum-edit").map((b) => b.getAttribute("aria-label"));

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
    assert.equal(root(table).getElementById(dialog.getAttribute("aria-labelledby"))?.textContent, "Active filters");
    assert.equal($(table, '[data-fk="tb:filters"]').getAttribute("aria-expanded"), "true");
    assert.deepEqual(summaryEntries(table), [
        "Edit filter Search: “e”",
        "Edit filter Name: Ben, Emma",
        "Edit filter Fee: > €50.00"
    ]);
    // The visible words are part of the name (WCAG 2.5.3, label in name).
    assert.deepEqual($$(table, ".jw-dt-overlay .jw-dt-fsum-edit").map((b) => b.textContent),
        ["Search “e”", "Name Ben, Emma", "Fee > €50.00"]);
    assert.equal(deepActiveElement()?.dataset.fk, "fsum:edit:search", "focus on the first entry");
    assert.deepEqual($$(table, '.jw-dt-overlay [data-fk^="fsum:remove:"]').map(accessibleName),
        ["Remove filter: Search", "Remove filter: Name", "Remove filter: Fee"]);
    assert.ok($$(table, ".jw-dt-overlay .jw-dt-fsum-item").every((li) => li.getBoundingClientRect().height >= 44), "touch targets");

    await input.press("Escape");
    assert.equal($(table, '[role="dialog"]'), null);
    assert.equal(deepActiveElement()?.dataset.fk, "tb:filters", "focus back on the opener");

    await input.press("Enter");
    assert.deepEqual($$(table, ".jw-dt-overlay .jw-dt-panel-actions button").map(accessibleName), ["Clear all filters", "Close"]);
    $(table, '[data-fk="fsum:close"]').focus();
    await input.press("Enter");
    assert.equal($(table, '[role="dialog"]'), null, "Close closes the panel");
    assert.equal(deepActiveElement()?.dataset.fk, "tb:filters", "focus back on the opener");
    assert.equal(/** @type {any} */ (table.getState().filters.name)?.values.length, 2, "filters unchanged");
}, { cdp: true });

test("typing in the search field updates \"Filter (n)\" and keeps focus in the field", async () => {
    const table = mount({ features: { filtering: true, globalSearch: true } });
    const field = $(table, ".jw-dt-search-input");
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
    assert.equal($(table, ".jw-dt-search-input").value, "");
    assert.equal($(table, '[role="dialog"]'), null, "closed with the last filter");
    assert.equal($(table, '[data-fk="tb:filters"]'), null);
    assert.ok(root(table).contains(deepActiveElement()), "focus stays in the table");
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
    assert.equal(root(table).getElementById(dialog().getAttribute("aria-labelledby"))?.textContent, "Filter: Fee");
    assert.equal($(table, '[data-fk="tb:filters"]').getAttribute("aria-expanded"), "true");

    await input.press("Escape");
    assert.ok(dialog().classList.contains("jw-dt-fsum-panel"), "Escape steps back to the summary");
    assert.equal(deepActiveElement()?.dataset.fk, "fsum:edit:column:fee");

    await input.press("Enter");
    const operand = $(table, ".jw-dt-overlay .jw-dt-operands input");
    operand.focus();
    operand.select();
    await type("100");
    await input.press("Enter");
    assert.equal(/** @type {any} */ (table.getState().filters.fee).operand, "100");
    assert.ok(dialog().classList.contains("jw-dt-fsum-panel"), "Apply comes back to the summary");
    assert.equal(summaryEntries(table)[2], "Edit filter Fee: > €100.00");
    assert.equal(deepActiveElement()?.dataset.fk, "fsum:edit:column:fee");

    // Resetting the only column filter left with no search: nothing to come back to.
    table.setState({ globalSearch: "", filters: { fee: table.getState().filters.fee } });
    $(table, '[data-fk="tb:filters"]').click();
    $(table, '[data-fk="fsum:edit:column:fee"]').click();
    $$(table, ".jw-dt-overlay .jw-dt-panel-actions button")[0].click();   // Reset
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
