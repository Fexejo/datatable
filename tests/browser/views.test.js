// Saved views: API, events, panel, adapter errors.

import { test, assert, sleep, waitFor, deepActiveElement, accessibleName, input } from "./harness.js";
import { mount, $, $$, columnTexts, announced, hasIcon, memoryAdapter, SORT_DESC, mountViews, root } from "./helpers.js";

// ---- Saved views ----------------------------------------------------------

const openViews = async (/** @type {HTMLElement} */ table) => {
    $(table, '[data-fk="tb:saved-views"]').click();
    await waitFor(() => !$(table, ".jw-dt-overlay").hasAttribute("aria-busy"), { message: "views panel did not load" });
    return $(table, ".jw-dt-overlay");
};
const viewNames = (/** @type {HTMLElement} */ table) => $$(table, ".jw-dt-overlay .jw-dt-views-name").map((n) => n.textContent);
const vk = (/** @type {HTMLElement} */ table, /** @type {string} */ key) => $(table, `.jw-dt-overlay [data-vk="${CSS.escape(key)}"]`);

test("saved views store the state without the page and fire events", async () => {
    const adapter = memoryAdapter();
    const table = mountViews(adapter);
    /** @type {any[]} */
    const events = [];
    for (const name of ["viewsave", "viewload", "viewrename", "viewdelete"]) {
        table.addEventListener(`jw-datatable:${name}`, (/** @type {any} */ e) => events.push([name, e.detail]));
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

test("adapter calls carry the table key (storage.key, else id)", async () => {
    const adapter = memoryAdapter();
    const table = mountViews(adapter, { id: "people" });
    await table.listViews();
    assert.deepEqual(adapter.calls.at(-1), ["list", { key: "people" }]);
    const keyed = mountViews(adapter, { id: "people", storage: { adapter, key: "members" } });
    await keyed.saveView("A");
    assert.deepEqual(adapter.calls.at(-1), ["save", "A", adapter.saved.get("A"), { key: "members" }]);
});

test("the active view knows when the state differs from it", async () => {
    const table = mountViews(memoryAdapter(), { features: { savedViews: true, sorting: true, columnVisibility: true } });
    assert.equal(table.getActiveView(), null);
    table.setState({ hiddenColumns: ["fee", "active"] });
    await table.saveView("Lean");
    assert.deepEqual(table.getActiveView(), { name: "Lean", modified: false });
    table.setState({ sort: SORT_DESC });
    assert.equal(table.getActiveView()?.modified, true, "sort changed");
    table.setState({ sort: [], hiddenColumns: ["active", "fee"] });
    assert.equal(table.getActiveView()?.modified, false, "same columns in another order");
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

test("a damaged view loads its valid parts; setState ignores invalid ones", async () => {
    const adapter = memoryAdapter({
        Damaged: { sort: "name", filters: { name: null }, pageSize: -5, layout: "weird", hiddenColumns: ["fee"], pinnedColumns: {} },
        Text: "not a state"
    });
    const table = mountViews(adapter, { features: { savedViews: true, sorting: true, filtering: true } });
    const before = table.getState();
    assert.equal(await table.loadView("Damaged"), true);
    assert.deepEqual(table.getState(), { ...before, hiddenColumns: ["fee"] }, "only the valid part applied");
    assert.equal(await table.loadView("Text"), false, "a view that is no object counts as missing");
    table.setState(/** @type {any} */ (null));
    table.setState(/** @type {any} */ ({ layout: "weird", page: "2" }));
    assert.deepEqual(table.getState(), { ...before, hiddenColumns: ["fee"] });
    assert.ok($(table, "table"), "still renders the table");
});

test("an adapter needs all five methods; the API rejects without the feature", async () => {
    const { rename, ...incomplete } = memoryAdapter();
    /** @type {any} */
    let error = null;
    try { mountViews(/** @type {any} */ (incomplete)); } catch (e) { error = e; }
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
    assert.equal(root(table).getElementById(name.getAttribute("aria-describedby"))?.textContent, "Please enter a name.");
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
    assert.ok($(table, ".jw-dt-overlay"), "Escape steps back, the panel stays open");
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
    assert.ok($(table, ".jw-dt-overlay"), "Escape leaves the rename, not the panel");
    assert.equal(deepActiveElement(), vk(table, "rename:B"));
}, { cdp: true });

test("saved views panel: current view, modified state and update", async () => {
    const adapter = memoryAdapter({ Desc: { sort: SORT_DESC } });
    const table = mountViews(adapter);
    await table.loadView("Desc");
    table.setState({ sort: [] });
    await openViews(table);
    const active = $(table, ".jw-dt-overlay .jw-dt-views-active p");
    assert.equal(active.textContent, "Current view: Desc (modified)");
    assert.equal(vk(table, "load:Desc").getAttribute("aria-current"), "true");
    const update = vk(table, "update");
    assert.equal(root(table).getElementById(update.getAttribute("aria-describedby")), active);
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
    assert.equal($(table, ".jw-dt-overlay"), null, "panel closed");
    assert.equal(deepActiveElement(), $(table, '[data-fk="tb:saved-views"]'));
    assert.equal(columnTexts(table, 1)[0], "Felix");
});

test("saved views panel: adapter failures are shown and can be retried", async () => {
    const adapter = memoryAdapter({ A: {} }, { fail: ["list"] });
    const table = mountViews(adapter);
    $(table, '[data-fk="tb:saved-views"]').click();
    await announced(table, "The saved views could not be loaded.");
    assert.ok($(table, ".jw-dt-overlay"), "panel open despite the error");
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

test("saved views panel: a view deleted elsewhere or failing to load stays in the panel", async () => {
    const adapter = memoryAdapter({ A: { sort: SORT_DESC }, B: {} });
    const table = mountViews(adapter);
    await openViews(table);
    adapter.saved.delete("A");   // e.g. deleted in another tab
    vk(table, "load:A").click();
    await announced(table, "The view “A” no longer exists.");
    assert.deepEqual(viewNames(table), ["B"], "list refreshed");
    assert.ok($(table, ".jw-dt-overlay"), "panel stays open");

    adapter.get = () => Promise.reject(new Error("offline"));
    vk(table, "load:B").click();
    await announced(table, "That did not work. Please try again.");
    assert.equal(deepActiveElement(), vk(table, "load:B"), "focus stays on the view");
});

test("saved views panel: the filter narrows the list as you type", async () => {
    const table = mountViews(memoryAdapter({ Active: {}, Archive: {}, Blocked: {} }));
    await openViews(table);
    const toggle = vk(table, "group:own");
    assert.equal(toggle.textContent, "My views (3)");
    const filter = vk(table, "filter");
    assert.equal(accessibleName(filter), "Filter views");
    filter.focus();
    filter.value = "a";
    filter.dispatchEvent(new Event("input"));
    assert.deepEqual(viewNames(table), ["Active", "Archive"], "case-insensitive, anywhere in the name");
    assert.equal(vk(table, "group:own").textContent, "My views (2)", "the count follows the filter");
    assert.equal(deepActiveElement(), filter, "typing keeps the focus");
    await announced(table, "2 views");

    filter.value = "zzz";
    filter.dispatchEvent(new Event("input"));
    assert.deepEqual(viewNames(table), []);
    assert.equal($(table, ".jw-dt-overlay .jw-dt-views-empty").textContent, "No view matches the filter.");

    await input.press("Escape");
    assert.equal(filter.value, "", "Escape clears a filled filter field");
    assert.deepEqual(viewNames(table), ["Active", "Archive", "Blocked"]);
    assert.ok($(table, ".jw-dt-overlay"), "the panel stays open");
    await input.press("Escape");
    assert.equal($(table, ".jw-dt-overlay"), null, "Escape in the empty field closes the panel");
}, { cdp: true });

test("saved views panel: deleting with a filter moves focus to the next match", async () => {
    const table = mountViews(memoryAdapter({ A1: {}, B: {}, A2: {} }));
    await openViews(table);
    vk(table, "filter").value = "a";
    vk(table, "filter").dispatchEvent(new Event("input"));
    vk(table, "delete:A1").click();
    vk(table, "step-cancel").previousElementSibling.click(); // Delete
    await announced(table, "View “A1” deleted");
    assert.equal(deepActiveElement(), vk(table, "load:A2"));
    vk(table, "delete:A2").click();
    vk(table, "step-cancel").previousElementSibling.click();
    await announced(table, "View “A2” deleted");
    assert.equal(deepActiveElement(), vk(table, "name"), "no match left: the name field");
});

test("saved views panel: the list collapses and stays collapsed when reopened", async () => {
    const table = mountViews(memoryAdapter({ A: {} }));
    await openViews(table);
    const toggle = vk(table, "group:own");
    assert.equal(toggle.closest("h3")?.textContent, "My views (1)", "the group has a heading");
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    const body = root(table).getElementById(toggle.getAttribute("aria-controls"));
    assert.ok(body?.contains(vk(table, "load:A")));
    toggle.click();
    assert.equal(vk(table, "group:own").getAttribute("aria-expanded"), "false");
    assert.equal(deepActiveElement(), vk(table, "group:own"), "focus stays on the toggle");
    assert.ok(root(table).getElementById(vk(table, "group:own").getAttribute("aria-controls"))?.hidden, "list hidden");

    $(table, '[data-fk="tb:saved-views"]').click();   // close
    await openViews(table);
    assert.equal(vk(table, "group:own").getAttribute("aria-expanded"), "false", "kept between openings");
    vk(table, "group:own").click();
    assert.ok(vk(table, "load:A").checkVisibility(), "expanded again");
});

test("saved views panel: a failing list is shown outside the collapsed group", async () => {
    const adapter = memoryAdapter({ A: {} });
    const table = mountViews(adapter);
    await openViews(table);
    vk(table, "group:own").click();
    adapter.list = () => Promise.reject(new Error("offline"));
    $(table, '[data-fk="tb:saved-views"]').click();
    $(table, '[data-fk="tb:saved-views"]').click();
    await announced(table, "The saved views could not be loaded.");
    assert.ok(vk(table, "retry").checkVisibility(), "Try again is visible");
});

test("German saved views panel", async () => {
    const table = mountViews(memoryAdapter({ A: {} }), { locale: "de-DE" });
    const panel = await openViews(table);
    assert.equal(accessibleName(panel), "Gespeicherte Ansichten");
    assert.equal(accessibleName(vk(table, "rename:A")), "Umbenennen: A");
    assert.equal(vk(table, "group:own").textContent, "Meine Ansichten (1)");
    assert.equal(accessibleName(vk(table, "filter")), "Ansichten filtern");
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
    const announcer = /** @type {Element} */ (document.querySelector("body > [data-jw-datatable-announcer]"));
    /** @type {any[]} */
    const texts = [];
    const observer = new MutationObserver(() => {
        const text = announcer.textContent?.trim();
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
