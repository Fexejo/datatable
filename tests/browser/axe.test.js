// Automated accessibility checks with axe-core (from node_modules: npm ci).

import { test, assert, nextFrame, waitFor, input } from "./harness.js";
import { ALL_FEATURES, mount, $, $$, rightClick, memoryAdapter, sharingAdapter, SORT_DESC, mountViews, COMPACT, mountSticky, scrollPagePast } from "./helpers.js";

// ---- Automated accessibility checks (axe-core) ------------------------------

// axe-core comes from node_modules (npm ci); it checks open shadow roots too.
/** @type {Promise<any>|null} */
let axeLoading = null;
/** @returns {Promise<any>} */
function loadAxe() {
    axeLoading ??= new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "../../node_modules/axe-core/axe.min.js";
        script.onload = () => resolve(/** @type {any} */ (window).axe);
        script.onerror = () => reject(new Error("axe-core not found: run `npm ci`"));
        document.head.append(script);
    });
    return axeLoading;
}

const AXE_OPTIONS = {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
    resultTypes: ["violations"]
};

// Fails with one line per violation: rule, impact, help and the offending elements.
async function assertNoAxeViolations(/** @type {string} */ state) {
    const axe = await loadAxe();
    const { violations } = await axe.run({ include: [["#fixture"]] }, AXE_OPTIONS);
    const report = violations.map((/** @type {any} */ v) =>
        `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((/** @type {any} */ n) => n.target.join(" > ")).join("\n    ")}`);
    assert.equal(report.join("\n"), "", `axe violations (${state})`);
}

test("axe: table layout with all features, sorted, filtered and pinned", async () => {
    mount({
        title: "Members",
        features: { ...ALL_FEATURES, columnPinning: true, rowDetails: true },
        initial: {
            sort: [{ key: "name", direction: "asc" }],
            filters: { active: { kind: "pattern", operator: "isTrue", arity: 0 } },
            pinnedColumns: ["name"]
        }
    });
    await nextFrame();
    await assertNoAxeViolations("table");
});

// One table per check: `mount()` appends, so earlier tables are removed first.
function mountAlone(/** @type {any} */ config) {
    document.getElementById("fixture")?.replaceChildren();
    return mount(config);
}

test("axe: card and compact layouts, empty and no-result states", async () => {
    mountAlone({ title: "Members", features: { grid: true }, defaultLayout: "grid", grid: { titleColumn: "name" } });
    await assertNoAxeViolations("cards");
    mountAlone({ title: "Members", ...COMPACT });
    await assertNoAxeViolations("compact");
    mountAlone({ data: [] });
    await assertNoAxeViolations("no data");
    mountAlone({ features: { globalSearch: true }, initial: { globalSearch: "nobody" } });
    await assertNoAxeViolations("no results");
});

test("axe: two tables on one page have distinct pagination landmarks", async () => {
    const members = mount({ title: "Members" });
    const guests = mount({ title: "Guests" });
    assert.equal($(members, ".jw-dt-pager").getAttribute("aria-label"), "Pagination: Members");
    assert.equal($(guests, ".jw-dt-pager").getAttribute("aria-label"), "Pagination: Guests");
    const untitled = mount();
    assert.equal($(untitled, ".jw-dt-pager").getAttribute("aria-label"), "Pagination", "without a title");
    untitled.remove();
    await assertNoAxeViolations("two tables");
});

// Opening a panel closes the one before.
test("axe: panels — filter (both tabs), filter summary, columns, saved views, export", async () => {
    const table = mountViews(memoryAdapter({ Lean: { sort: SORT_DESC } }), {
        features: { ...ALL_FEATURES, columnPinning: true },
        initial: { filters: { name: { kind: "value", values: ["Anna"] } } }
    });
    $(table, '[data-fk="filter:fee"]').click();
    await assertNoAxeViolations("filter panel, pattern tab");
    $(table, ".jw-dt-overlay .jw-dt-tab").click();
    await assertNoAxeViolations("filter panel, values tab");
    $(table, '[data-fk="tb:filters"]').click();
    await assertNoAxeViolations("filter summary");
    $(table, '[data-fk="tb:columns"]').click();
    await assertNoAxeViolations("column chooser");
    $(table, '[data-fk="tb:saved-views"]').click();
    await waitFor(() => $(table, ".jw-dt-overlay .jw-dt-views-name"));
    await assertNoAxeViolations("saved views");
    table.openExportDialog();
    $(table, ".jw-dt-overlay .jw-dt-disclosure").click();
    await assertNoAxeViolations("export dialog, more options");
});

test("axe: saved views panel with sharing — shared toggle, views of others, a loaded one", async () => {
    const adapter = sharingAdapter({ Lean: {}, Wide: {} }, [{ id: "7", name: "Desc", detail: "by Anna Smith", state: { sort: SORT_DESC } }]);
    adapter.sharedNames.add("Lean");
    const table = mountViews(adapter, { features: { ...ALL_FEATURES } });
    await table.loadSharedView({ id: "7", name: "Desc", detail: "by Anna Smith" });
    $(table, '[data-fk="tb:saved-views"]').click();
    await waitFor(() => $(table, '.jw-dt-overlay [data-vk="shared:7"]'));
    await assertNoAxeViolations("saved views with sharing");
    $(table, '.jw-dt-overlay [data-vk="group:shared"]').click();
    await assertNoAxeViolations("saved views, shared group collapsed");
    $(table, '.jw-dt-overlay [data-vk="delete:Lean"]').click();
    await assertNoAxeViolations("saved views, modal delete question");
    $(table, '.jw-dt-overlay [data-vk="step-cancel"]').click();
    $(table, '.jw-dt-overlay [data-vk="rename:Wide"]').click();
    await assertNoAxeViolations("saved views, modal rename");
});

test("axe: context menu and the record details dialog", async () => {
    const table = mount({ features: { ...ALL_FEATURES, columnPinning: true, rowDetails: true } });
    rightClick($(table, '[data-fk="cell:0:name"]'));
    await assertNoAxeViolations("context menu");
    $$(table, ".jw-ctx-item").find((item) => item.textContent === "Show details").click();
    await waitFor(() => $(table, ".jw-dt-details"));
    await assertNoAxeViolations("details dialog");
});

test("axe: column chooser with a hidden, pinned column (disabled pin button)", async () => {
    const table = mount({ features: { columnVisibility: true, columnPinning: true, columnReorder: true },
        initial: { hiddenColumns: ["fee"], pinnedColumns: ["fee"] } });
    $(table, '[data-fk="tb:columns"]').click();
    await assertNoAxeViolations("column chooser, hidden pinned column");
});

test("axe: stickyHeader — header shifted over the rows, with pinned columns", async () => {
    const table = mountSticky({ title: "Members", features: { ...ALL_FEATURES, columnPinning: true }, initial: { pinnedColumns: ["name"] } });
    scrollPagePast(table, 300);
    await waitFor(() => $(table, "thead").style.getPropertyValue("--dt-head-shift"), { message: "header shifted" });
    await assertNoAxeViolations("sticky header");
});

test("axe: mobile — cards, bottom sheet and context menu", async () => {
    await input.viewport(390, 800);
    const table = mount({ features: { ...ALL_FEATURES }, responsive: { enabled: true } });
    await waitFor(() => $(table, ".jw-dt-grid"));
    await assertNoAxeViolations("mobile cards");
    $(table, '[data-fk="tb:columns"]').click();
    await assertNoAxeViolations("mobile bottom sheet");
    rightClick($(table, ".jw-dt-card"));
    await assertNoAxeViolations("mobile context menu");
}, { cdp: true });

test("axe: mobile — saved views panel with the actions menu of a view", async () => {
    await input.viewport(390, 800);
    const table = mountViews(memoryAdapter({ Desc: { sort: SORT_DESC } }), { responsive: { enabled: true } });
    $(table, '[data-fk="tb:saved-views"]').click();
    await waitFor(() => $(table, '.jw-dt-overlay [data-vk="more:Desc"]'));
    await assertNoAxeViolations("mobile saved views panel");
    $(table, '.jw-dt-overlay [data-vk="more:Desc"]').click();
    await assertNoAxeViolations("mobile saved views menu");
}, { cdp: true });

test("axe: touch tablet — desktop table with touch targets", async () => {
    await input.viewport(820, 1180);
    await input.touch(true);
    const table = mount({ features: { ...ALL_FEATURES, compact: true, columnPinning: true }, initial: { pinnedColumns: ["name"] } });
    await assertNoAxeViolations("touch tablet table");
    $(table, 'th[data-key="name"] .jw-dt-filter-btn').click();
    await assertNoAxeViolations("touch tablet filter panel");
}, { cdp: true });
