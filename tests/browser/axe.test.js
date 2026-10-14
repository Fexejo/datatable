// Automated accessibility checks with axe-core (from node_modules: npm ci).

import { test, assert, nextFrame, waitFor, input } from "./harness.js";
import { ALL_FEATURES, mount, $, $$, rightClick, memoryAdapter, SORT_DESC, mountViews, COMPACT } from "./helpers.js";

// ---- Automated accessibility checks (axe-core) ------------------------------

// axe-core comes from node_modules (npm ci); it checks open shadow roots too.
let axeLoading = null;
function loadAxe() {
    axeLoading ??= new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "../../node_modules/axe-core/axe.min.js";
        script.onload = () => resolve(window.axe);
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
async function assertNoAxeViolations(state) {
    const axe = await loadAxe();
    const { violations } = await axe.run({ include: [["#fixture"]] }, AXE_OPTIONS);
    const report = violations.map((v) =>
        `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => n.target.join(" > ")).join("\n    ")}`);
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
function mountAlone(config) {
    document.getElementById("fixture").replaceChildren();
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
    assert.equal($(members, ".k-dt-pager").getAttribute("aria-label"), "Pagination: Members");
    assert.equal($(guests, ".k-dt-pager").getAttribute("aria-label"), "Pagination: Guests");
    const untitled = mount();
    assert.equal($(untitled, ".k-dt-pager").getAttribute("aria-label"), "Pagination", "without a title");
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
    $(table, ".k-dt-overlay .k-dt-tab").click();
    await assertNoAxeViolations("filter panel, values tab");
    $(table, '[data-fk="tb:filters"]').click();
    await assertNoAxeViolations("filter summary");
    $(table, '[data-fk="tb:columns"]').click();
    await assertNoAxeViolations("column chooser");
    $(table, '[data-fk="tb:saved-views"]').click();
    await waitFor(() => $(table, ".k-dt-overlay .k-dt-views-name"));
    await assertNoAxeViolations("saved views");
    table.openExportDialog();
    $(table, ".k-dt-overlay .k-dt-disclosure").click();
    await assertNoAxeViolations("export dialog, more options");
});

test("axe: context menu and the record details dialog", async () => {
    const table = mount({ features: { ...ALL_FEATURES, columnPinning: true, rowDetails: true } });
    rightClick($(table, '[data-fk="cell:0:name"]'));
    await assertNoAxeViolations("context menu");
    $$(table, ".k-ctx-item").find((item) => item.textContent === "Show details").click();
    await waitFor(() => $(table, ".k-dt-details"));
    await assertNoAxeViolations("details dialog");
});

test("axe: mobile — cards, bottom sheet and context menu", async () => {
    await input.viewport(390, 800);
    const table = mount({ features: { ...ALL_FEATURES }, responsive: { enabled: true } });
    await waitFor(() => $(table, ".k-dt-grid"));
    await assertNoAxeViolations("mobile cards");
    $(table, '[data-fk="tb:columns"]').click();
    await assertNoAxeViolations("mobile bottom sheet");
    rightClick($(table, ".k-dt-card"));
    await assertNoAxeViolations("mobile context menu");
}, { cdp: true });
