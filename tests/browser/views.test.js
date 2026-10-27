// Saved views: API, events, panel, adapter errors.

import { test, assert, sleep, waitFor, deepActiveElement, accessibleName, input } from "./harness.js";
import { mount, $, $$, columnTexts, announced, hasIcon, memoryAdapter, sharingAdapter, SORT_DESC, mountViews, root, COLUMNS, DATA } from "./helpers.js";

// ---- Saved views ----------------------------------------------------------

const openViews = async (/** @type {HTMLElement} */ table) => {
    $(table, '[data-fk="tb:saved-views"]').click();
    await waitFor(() => !$(table, ".jw-dt-overlay").hasAttribute("aria-busy"), { message: "views panel did not load" });
    return $(table, ".jw-dt-overlay");
};
const viewNames = (/** @type {HTMLElement} */ table) => $$(table, ".jw-dt-overlay .jw-dt-views-group .jw-dt-views-name").map((n) => n.textContent);
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
    const group = cancel.closest('[role="alertdialog"]');
    assert.equal(accessibleName(group), "A view named “Mine” already exists. Overwrite it?");
    assert.equal(group?.getAttribute("aria-modal"), "true");
    assert.ok(vk(table, "name").closest("[inert]") && vk(table, "filter").inert, "the rest of the panel is inert");
    assert.ok(!$(table, ".jw-dt-overlay [data-live]").closest("[inert]"), "announcements still reach screen readers");
    await input.press("Tab");
    assert.equal(deepActiveElement(), group?.querySelector("button"), "Tab wraps to the first answer");
    await input.press("Tab");
    assert.equal(deepActiveElement(), cancel, "Tab stays in the question");
    assert.ok(!adapter.calls.some(([m]) => m === "save"), "nothing saved yet");

    await input.press("Escape");
    assert.ok($(table, ".jw-dt-overlay"), "Escape steps back, the panel stays open");
    assert.equal(vk(table, "step-cancel"), null, "question gone");
    assert.equal($(table, ".jw-dt-overlay [inert]"), null, "nothing inert any more");
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
    assert.equal(accessibleName(vk(table, "step-cancel").closest('[role="alertdialog"]')), "Delete the view “B”?");
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
    const dialog = field.closest('[role="dialog"]');
    assert.equal(accessibleName(dialog), "Rename: A");
    assert.equal(dialog?.getAttribute("aria-modal"), "true");
    assert.ok(vk(table, "load:B").closest("[inert]") && vk(table, "name").closest("[inert]"), "other views and fields are inert");
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
    assert.equal(deepActiveElement(), vk(table, "group:own"), "focus on the group's heading");

    adapter.get = () => Promise.reject(new Error("offline"));
    vk(table, "load:B").click();
    await announced(table, "That did not work. Please try again.");
    assert.equal(deepActiveElement(), vk(table, "load:B"), "focus stays on the view");
});

// ---- Default view (resetState) ---------------------------------------------

/** @type {Partial<import("../../src/types.js").DataTableConfig>} */
const STARTED = {
    features: { savedViews: true, sorting: true, filtering: true, columnPinning: true, columnVisibility: true },
    columns: COLUMNS.map((c) => (c.key === "name" ? { ...c, pinned: true } : c.key === "joined" ? { ...c, hidden: true } : c)),
    initial: { sort: SORT_DESC, filters: { active: { kind: "value", values: [true] } } },
    pagination: { pageSize: 25 }
};

test("resetState() goes back to the initial state, keeps the data and ends the active view", async () => {
    const table = mountViews(memoryAdapter({ Asc: { sort: [{ key: "id", direction: "asc" }], pinnedColumns: [] } }), STARTED);
    const initial = table.getState();
    assert.deepEqual(initial.pinnedColumns, ["name"], "column option pinned");
    assert.deepEqual(initial.hiddenColumns, ["joined"], "column option hidden");
    table.setData(DATA.slice(0, 12));
    await table.loadView("Asc");
    table.setState({ page: 2, pageSize: 10, globalSearch: "a", hiddenColumns: [], columnOrder: ["fee", "id", "name", "active", "joined"] });
    /** @type {any[]} */
    const changes = [];
    table.addEventListener("jw-datatable:change", (/** @type {any} */ e) => changes.push(e.detail));

    table.resetState();
    assert.deepEqual(table.getState(), initial);
    assert.equal(table.getActiveView(), null, "no active view");
    assert.equal(table.data.length, 12, "data kept");
    assert.equal(changes.length, 1, "one change event");
    await announced(table, "Default view restored");
});

test("resetState() turns the automatic layout back on; a configured layout stays", async () => {
    await input.viewport(390, 800);
    const table = mountViews(memoryAdapter(), { ...STARTED, features: { ...STARTED.features, grid: true }, responsive: { enabled: true } });
    assert.equal(table.getState().layout, "grid", "cards on a phone");
    table.setState({ layout: "table" });
    table.resetState();
    assert.equal(table.getState().layout, "grid");
    await input.viewport(1280, 800);
    await waitFor(() => table.getState().layout === "table", { message: "switches with the width again" });

    const pinned = mountViews(memoryAdapter(), { features: { savedViews: true, grid: true }, defaultLayout: "grid", responsive: { enabled: true } });
    pinned.setState({ layout: "table" });
    pinned.resetState();
    assert.equal(pinned.getState().layout, "grid", "defaultLayout");
}, { cdp: true });

test("saved views panel: the default view on top restores the initial state", async () => {
    const table = mountViews(memoryAdapter({ Asc: { sort: [{ key: "id", direction: "asc" }] } }), STARTED);
    const initial = table.getState();
    await openViews(table);
    const entry = () => vk(table, "default");
    assert.equal(entry().closest(".jw-dt-views-list")?.firstElementChild, entry().parentElement, "first in the list");
    assert.equal(accessibleName(entry()), "Default view");
    assert.equal(entry().getAttribute("aria-current"), "true", "current while nothing changed");
    assert.ok(hasIcon(entry(), "check"));
    vk(table, "load:Asc").click();
    await announced(table, "View “Asc” loaded");

    $(table, '[data-fk="tb:saved-views"]').focus();
    await openViews(table);
    assert.equal(entry().getAttribute("aria-current"), null, "a view is loaded");
    vk(table, "filter").value = "zzz";
    vk(table, "filter").dispatchEvent(new Event("input"));
    assert.ok(entry(), "the filter doesn't hide it");
    entry().focus();
    await input.press("Enter");
    await announced(table, "Default view restored");
    assert.equal($(table, ".jw-dt-overlay"), null, "panel closed");
    assert.equal(deepActiveElement(), $(table, '[data-fk="tb:saved-views"]'), "focus back on the toolbar button");
    assert.deepEqual(table.getState(), initial);

    table.setState({ globalSearch: "x" });
    await openViews(table);
    assert.equal(entry().getAttribute("aria-current"), null, "changed by hand");
}, { cdp: true });

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

test("saved views panel on mobile: the actions of a view are in a menu", async () => {
    await input.viewport(390, 800);
    const table = mountViews(memoryAdapter({ A: {}, B: {} }), { responsive: { enabled: true } });
    await openViews(table);
    assert.equal(vk(table, "rename:A"), null, "no row of buttons");
    const more = vk(table, "more:A");
    assert.equal(accessibleName(more), "Actions: A");
    assert.equal(more.getAttribute("aria-haspopup"), "menu");
    more.focus();
    await input.press("Enter");
    const menu = $(table, ".jw-dt-overlay .jw-ctx-menu");
    assert.ok(menu?.classList.contains("jw-ctx-menu--sheet"), "a bottom sheet inside the panel");
    assert.equal(accessibleName(menu), "Actions: A");
    assert.equal(vk(table, "more:A").getAttribute("aria-expanded"), "true");
    assert.deepEqual($$(table, '[role="menuitem"]').map((i) => i.textContent), ["Rename", "Delete"]);
    assert.equal(deepActiveElement(), $(table, '[role="menuitem"]'), "focus on the first item");
    assert.ok(vk(table, "more:A").closest("[inert]") && vk(table, "name").closest("[inert]"), "the panel behind the menu is inert");

    await input.press("Escape");
    assert.equal($(table, ".jw-ctx-menu"), null, "menu closed");
    assert.ok($(table, ".jw-dt-overlay"), "the panel stays open");
    assert.equal(deepActiveElement(), vk(table, "more:A"), "focus back on the menu button");
    assert.equal(vk(table, "more:A").getAttribute("aria-expanded"), "false");
    assert.equal($(table, ".jw-dt-overlay [inert]"), null, "nothing inert after closing the menu");

    await input.press("Enter");
    await input.press("Enter");   // Rename
    assert.equal(deepActiveElement(), vk(table, "rename-input"), "rename field");
    await input.press("Escape");
    assert.equal(deepActiveElement(), vk(table, "more:A"), "back to the menu button");

    vk(table, "more:B").click();
    $$(table, '[role="menuitem"]')[1].click();   // Delete
    assert.equal(deepActiveElement(), vk(table, "step-cancel"), "the question asks first");
    vk(table, "step-cancel").click();
    assert.equal(deepActiveElement(), vk(table, "more:B"), "Cancel returns to the menu button");
    vk(table, "more:B").click();
    $$(table, '[role="menuitem"]')[1].click();
    vk(table, "step-cancel").previousElementSibling.click();
    await announced(table, "View “B” deleted");
    assert.deepEqual(viewNames(table), ["A"]);
}, { cdp: true });

// ---- Sharing ----------------------------------------------------------------

const OTHERS = () => [
    { id: "7", name: "Desc", detail: "by Anna Smith", state: { sort: SORT_DESC } },
    { id: "8", name: "Big pages", state: { pageSize: 50 } }
];
const sharedNames = (/** @type {HTMLElement} */ table) =>
    $$(table, '.jw-dt-overlay [data-vk^="shared:"]').map((b) => b.textContent);

test("sharing API: share, list and load views of others; events and the active view", async () => {
    const adapter = sharingAdapter({ Mine: {} }, OTHERS());
    const table = mountViews(adapter, { id: "people" });
    /** @type {any[]} */
    const events = [];
    for (const name of ["viewshare", "viewload"]) {
        table.addEventListener(`jw-datatable:${name}`, (/** @type {any} */ e) => events.push([name, e.detail]));
    }
    await table.shareView(" Mine ");
    assert.ok(adapter.sharedNames.has("Mine"));
    assert.deepEqual(adapter.calls.at(-1), ["share", "Mine", true, { key: "people" }]);
    await table.shareView("Mine", false);
    assert.deepEqual(events.slice(0, 2), [["viewshare", { name: "Mine", shared: true }], ["viewshare", { name: "Mine", shared: false }]]);

    const others = await table.listSharedViews();
    assert.deepEqual(others, [{ id: "7", name: "Desc", detail: "by Anna Smith" }, { id: "8", name: "Big pages" }]);
    table.setState({ page: 2 });
    assert.equal(await table.loadSharedView(others[0]), true);
    assert.equal(columnTexts(table, 1)[0], "Felix");
    assert.equal(table.getState().page, 1);
    const shared = { id: "7", name: "Desc", detail: "by Anna Smith" };
    assert.deepEqual(table.getActiveView(), { name: "Desc", modified: false, shared });
    assert.equal(events[2][0], "viewload");
    assert.deepEqual(events[2][1].shared, shared);

    // An own view with the same name is another view.
    await table.saveView("Other");
    await table.loadSharedView(others[0]);
    await table.renameView("Other", "Desc");
    assert.deepEqual(table.getActiveView()?.shared, shared, "renaming an own view onto the name keeps it");
    await table.deleteView("Desc");
    assert.deepEqual(table.getActiveView()?.shared, shared, "deleting the own view keeps it");
    assert.equal(await table.loadSharedView({ id: "99", name: "Gone" }), false);
    await table.saveView("Copy");
    assert.deepEqual(table.getActiveView(), { name: "Copy", modified: false }, "saved as an own view");
});

test("a view of others only sets a page size the table offers", async () => {
    const adapter = sharingAdapter({}, [
        { id: "1", name: "Offered", state: { pageSize: 50 } },
        { id: "2", name: "Huge", state: { pageSize: 1000000, sort: SORT_DESC } }
    ]);
    const table = mountViews(adapter, { pagination: { pageSize: 10, pageSizeOptions: [10, 50] } });
    await table.loadSharedView({ id: "1", name: "Offered" });
    assert.equal(table.getState().pageSize, 50);
    await table.loadSharedView({ id: "2", name: "Huge" });
    assert.equal(table.getState().pageSize, 50, "the page size stays");
    assert.equal(columnTexts(table, 1)[0], "Felix", "the rest of the view applies");
    table.setState({ pageSize: 37 });
    assert.equal(table.getState().pageSize, 37, "setState() and own views are not limited");
});

test("sharing API rejects without a sharing adapter", async () => {
    const table = mountViews(memoryAdapter());
    for (const call of [() => table.shareView("A"), () => table.listSharedViews(), () => table.loadSharedView({ id: "1", name: "A" })]) {
        let rejected = false;
        await call().catch(() => { rejected = true; });
        assert.ok(rejected);
    }
    await openViews(table);
    assert.equal(vk(table, "group:shared"), null, "no group of shared views");
    assert.equal(vk(table, "share:A"), null);
});

test("saved views panel: share toggle and the views of others", async () => {
    const adapter = sharingAdapter({ Mine: {} }, OTHERS());
    const table = mountViews(adapter);
    await openViews(table);
    assert.equal(vk(table, "group:own").textContent, "My views (1)");
    assert.equal(vk(table, "group:shared").textContent, "Shared by others (2)");
    assert.deepEqual(sharedNames(table), ["Desc by Anna Smith", "Big pages"]);
    assert.equal(accessibleName(vk(table, "shared:7")), "Desc by Anna Smith", "the detail is part of the name");
    assert.equal(vk(table, "shared:7").closest("li")?.querySelectorAll("button").length, 1, "no rename, delete or share");

    const toggle = vk(table, "share:Mine");
    assert.equal(accessibleName(toggle), "Share: Mine");
    assert.equal(toggle.getAttribute("aria-pressed"), "false");
    assert.ok(hasIcon(toggle, "share-2"));
    toggle.click();
    await announced(table, "View “Mine” shared");
    assert.equal(vk(table, "share:Mine").getAttribute("aria-pressed"), "true");
    assert.equal(deepActiveElement(), vk(table, "share:Mine"), "focus stays on the toggle");
    vk(table, "share:Mine").click();
    await announced(table, "View “Mine” no longer shared");
    assert.equal(vk(table, "share:Mine").getAttribute("aria-pressed"), "false");

    vk(table, "filter").value = "anna";
    vk(table, "filter").dispatchEvent(new Event("input"));
    assert.deepEqual(sharedNames(table), ["Desc by Anna Smith"], "the filter also matches the detail");
    assert.deepEqual(viewNames(table), ["Desc"], "no own view matches");
    assert.equal(vk(table, "group:shared").textContent, "Shared by others (1)");
    vk(table, "group:shared").click();
    assert.equal(vk(table, "group:shared").getAttribute("aria-expanded"), "false", "collapses on its own");
    assert.equal(vk(table, "group:own").getAttribute("aria-expanded"), "true");
    vk(table, "group:shared").click();

    vk(table, "shared:7").click();
    await announced(table, "View “Desc” loaded");
    assert.equal($(table, ".jw-dt-overlay"), null, "panel closed");
    assert.equal(columnTexts(table, 1)[0], "Felix");
});

test("saved views panel: a loaded view of others can be saved as an own one, not updated", async () => {
    const adapter = sharingAdapter({ Desc: {} }, OTHERS());
    const table = mountViews(adapter);
    await table.loadSharedView({ id: "7", name: "Desc", detail: "by Anna Smith" });
    table.setState({ sort: [] });
    await openViews(table);
    const active = $(table, ".jw-dt-overlay .jw-dt-views-active p");
    assert.equal(active.textContent, "Current view: Desc · by Anna Smith (modified)");
    assert.equal(vk(table, "update"), null, "no Update");
    assert.equal(vk(table, "shared:7").getAttribute("aria-current"), "true");
    assert.equal(vk(table, "load:Desc").getAttribute("aria-current"), null, "the own view of that name is not current");
    const saveAs = vk(table, "save-as");
    assert.equal(saveAs.textContent, "Save as my view");
    assert.equal(root(table).getElementById(saveAs.getAttribute("aria-describedby")), active);
    saveAs.click();
    assert.equal(deepActiveElement(), vk(table, "name"));
    assert.equal(vk(table, "name").value, "Desc", "the name is filled in");
    vk(table, "save").click();
    assert.ok(vk(table, "step-cancel"), "an own view of that name: asks before overwriting");
    vk(table, "step-cancel").previousElementSibling.click();
    await announced(table, "View “Desc” saved");
    assert.deepEqual(adapter.saved.get("Desc").sort, []);
    assert.deepEqual(table.getActiveView(), { name: "Desc", modified: false });
});

test("saved views panel: deleting a shared view warns first", async () => {
    const adapter = sharingAdapter({ A: {}, B: {} });
    adapter.sharedNames.add("A");
    const table = mountViews(adapter);
    await openViews(table);
    vk(table, "delete:A").click();
    assert.equal(accessibleName(vk(table, "step-cancel").closest('[role="alertdialog"]')),
        "Delete the view “A”? It is shared: others will no longer be able to use it.");
    vk(table, "step-cancel").click();
    vk(table, "delete:B").click();
    assert.equal(accessibleName(vk(table, "step-cancel").closest('[role="alertdialog"]')), "Delete the view “B”?");
    vk(table, "rename:A").click();
    vk(table, "rename-input").value = "A2";
    vk(table, "rename-input").dispatchEvent(new Event("input"));
    vk(table, "rename-input").nextElementSibling?.querySelector("button")?.click();
    await announced(table, "View “A” renamed to “A2”");
    assert.equal(vk(table, "share:A2").getAttribute("aria-pressed"), "true", "still shared after renaming");
});

test("saved views panel: failures around the views of others", async () => {
    const adapter = sharingAdapter({ Mine: {} }, OTHERS(), { fail: ["listShared"] });
    const table = mountViews(adapter);
    await openViews(table);
    await announced(table, "The shared views could not be loaded.");
    assert.deepEqual(viewNames(table), ["Mine"], "own views are there");
    assert.equal(vk(table, "group:shared"), null);
    adapter.listShared = () => adapter.others.map(({ state, ...view }) => view);
    vk(table, "retry-shared").click();
    await waitFor(() => sharedNames(table).length === 2, { message: "shared views after retry" });
    assert.equal(deepActiveElement(), vk(table, "group:shared"));

    adapter.others.shift();   // "Desc" is no longer shared
    vk(table, "shared:7").click();
    await announced(table, "The view “Desc” no longer exists.");
    assert.deepEqual(sharedNames(table), ["Big pages"], "list refreshed");
    assert.equal(deepActiveElement(), vk(table, "group:shared"), "the view is gone: focus stays in the panel");

    adapter.share = () => Promise.reject(new Error("offline"));
    vk(table, "share:Mine").click();
    await announced(table, "That did not work. Please try again.");
    assert.equal(deepActiveElement(), vk(table, "share:Mine"));
});

test("saved views panel on mobile: sharing is in the menu, the list says what is shared", async () => {
    await input.viewport(390, 800);
    const adapter = sharingAdapter({ A: {} }, OTHERS());
    const table = mountViews(adapter, { responsive: { enabled: true } });
    await openViews(table);
    assert.equal(vk(table, "share:A"), null, "no toggle in the row");
    vk(table, "more:A").click();
    assert.deepEqual($$(table, '[role="menuitem"]').map((i) => i.textContent), ["Share", "Rename", "Delete"]);
    $(table, '[role="menuitem"]').click();
    await announced(table, "View “A” shared");
    assert.equal(accessibleName(vk(table, "load:A")), "A Shared");
    assert.equal(deepActiveElement(), vk(table, "more:A"));
    vk(table, "more:A").click();
    assert.equal($(table, '[role="menuitem"]').textContent, "Stop sharing");
}, { cdp: true });

test("German saved views panel", async () => {
    const table = mountViews(memoryAdapter({ A: {} }), { locale: "de-DE" });
    const panel = await openViews(table);
    assert.equal(accessibleName(panel), "Gespeicherte Ansichten");
    assert.equal(accessibleName(vk(table, "rename:A")), "Umbenennen: A");
    assert.equal(vk(table, "group:own").textContent, "Meine Ansichten (1)");
    assert.equal(accessibleName(vk(table, "filter")), "Ansichten filtern");
    assert.equal(accessibleName(vk(table, "default")), "Standardansicht");
    const sharing = mountViews(sharingAdapter({ A: {} }, OTHERS()), { locale: "de-DE" });
    await openViews(sharing);
    assert.equal(vk(sharing, "group:shared").textContent, "Von anderen geteilt (2)");
    assert.equal(accessibleName(vk(sharing, "share:A")), "Freigeben: A");
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
