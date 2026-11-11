// Shared fixtures and helpers of the browser tests.
// `?dist` in the page URL runs the tests against the built bundle instead of the sources.

import { waitFor } from "./harness.js";
import { createIcon } from "../../src/ui/icons.js";

export const ENTRY = new URLSearchParams(location.search).has("dist")
    ? "../../dist/jw-datatable.min.js"
    : "../../datatable.js";

export const api = await import(ENTRY);

export const { createDataTable } = api;

export const NAMES = ["Anna", "Ben", "Clara", "David", "Emma", "Felix"];

export const DATA = Array.from({ length: 30 }, (_, i) => ({
    id: i + 1,
    name: NAMES[i % NAMES.length],
    fee: Math.round(((i * 37) % 200) * 100) / 100,
    active: i % 3 !== 0,
    joined: `202${i % 5}-0${(i % 9) + 1}-15`
}));

export const COLUMNS = [
    { key: "id", label: "ID", type: "integer" },
    { key: "name", label: "Name", type: "string", copyable: true },
    { key: "fee", label: "Fee", type: "currency", format: { currency: "EUR" } },
    { key: "active", label: "Active", type: "boolean" },
    { key: "joined", label: "Joined", type: "date" }
];

export const ALL_FEATURES = {
    sorting: true, filtering: true, globalSearch: true, grid: true,
    columnVisibility: true, columnReorder: true, savedViews: true, export: true
};

/** @typedef {import("../../src/jwDataTable.js").JwDataTable} JwDataTable */

// Mounts a table into #fixture: the test data plus `config` (which may also
// carry options a test expects the table to ignore).
/**
 * @param {Partial<import("../../src/types.js").DataTableConfig> & Record<string, any>} [config]
 * @returns {JwDataTable}
 */
export function mount(config = {}) {
    // The shared announcer outlives tests; start each test with a clean slate.
    const announcer = document.querySelector("[data-jw-datatable-announcer]");
    if (announcer) announcer.textContent = "";
    return createDataTable("#fixture", {
        id: "test",
        columns: COLUMNS,
        data: DATA,
        pagination: { pageSize: 10 },
        responsive: { enabled: false },
        ...config
    });
}

// The table's (open) shadow root.
/**
 * @param {HTMLElement} table
 * @returns {ShadowRoot}
 */
export const root = (table) => /** @type {ShadowRoot} */ (table.shadowRoot);

// Query helpers inside a table's shadow root (typed `any`, see harness.js).
/**
 * @param {HTMLElement} table
 * @param {string} sel
 * @returns {any}
 */
export const $ = (table, sel) => table.shadowRoot?.querySelector(sel);

/**
 * @param {HTMLElement} table
 * @param {string} sel
 * @returns {any[]}
 */
export const $$ = (table, sel) => Array.from(table.shadowRoot?.querySelectorAll(sel) ?? []);

/**
 * Texts of column `index` in the body rows.
 * @param {HTMLElement} table
 * @param {number} index
 * @returns {string[]}
 */
export const columnTexts = (table, index) =>
    $$(table, "tbody tr").map((tr) => tr.children[index].querySelector(".jw-dt-cell").textContent.trim());

/** @param {Element} node */
export function rightClick(node) {
    const r = node.getBoundingClientRect();
    node.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, composed: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5
    }));
}

// Active live region: the open panel's own region, else the shared one in <body>.
export const status = (/** @type {HTMLElement} */ table) => $(table, ".jw-dt-overlay [data-live]")
    || document.querySelector("body > [data-jw-datatable-announcer]");

// Announcements may carry an invisible alternating suffix (see _announce).
export const statusText = (/** @type {HTMLElement} */ table) => (status(table)?.textContent ?? "").replace(/\u00a0$/, "");

/**
 * Waits for `text` in the active live region.
 * @param {HTMLElement} table
 * @param {string} text
 */
export const announced = (table, text) => waitFor(() => statusText(table) === text, {
    message: `expected announcement "${text}", got "${statusText(table)}"`
});

// Identifies the Lucide icon inside `node` (same serialized markup as a fresh one).
export const hasIcon = (/** @type {Element} */ node, /** @type {string} */ name) => node.querySelector("svg")?.innerHTML === createIcon(name).innerHTML;

// In-memory adapter; `fail` makes the named methods reject.
/**
 * @param {Record<string, any>} [views]
 * @param {{ fail?: string[] }} [options]
 */
export function memoryAdapter(views = {}, { fail = [] } = {}) {
    /** @type {Map<string, any>} */
    const saved = new Map(Object.entries(views));
    /** @type {any[][]} */
    const calls = [];
    /**
     * @template {any[]} A
     * @template R
     * @param {string} method
     * @param {(...args: A) => R} fn
     */
    const step = (method, fn) => (/** @type {A} */ ...args) => {
        calls.push([method, ...args]);
        return fail.includes(method) ? Promise.reject(new Error(`${method} failed`)) : fn(...args);
    };
    return {
        saved,
        calls,
        list: step("list", () => [...saved.keys()]),
        get: step("get", (/** @type {string} */ n) => saved.get(n) ?? null),
        save: step("save", (/** @type {string} */ n, /** @type {object} */ d) => { saved.set(n, d); }),
        rename: step("rename", (/** @type {string} */ from, /** @type {string} */ to) => { saved.set(to, saved.get(from)); saved.delete(from); }),
        delete: step("delete", (/** @type {string} */ n) => { saved.delete(n); })
    };
}

// A memoryAdapter that also shares: `sharedNames` are the own views shared,
// `others` the views others shared ({ id, name, detail?, state }).
/**
 * @param {Record<string, any>} [views]
 * @param {{ id: string, name: string, detail?: string, state: object }[]} [others]
 * @param {{ fail?: string[] }} [options]
 */
export function sharingAdapter(views = {}, others = [], options = {}) {
    const adapter = memoryAdapter(views, options);
    /** @type {Set<string>} */
    const sharedNames = new Set();
    const list = adapter.list;
    const rename = adapter.rename;
    const remove = adapter.delete;
    /** @param {string} method */
    const fails = (method) => options.fail?.includes(method);
    return Object.assign(adapter, {
        sharedNames,
        others,
        list: () => Promise.resolve(list()).then((names) => names.map((name) => (sharedNames.has(name) ? { name, shared: true } : name))),
        rename: (/** @type {string} */ from, /** @type {string} */ to) => {
            if (sharedNames.delete(from)) sharedNames.add(to);
            return rename(from, to);
        },
        delete: (/** @type {string} */ name) => { sharedNames.delete(name); return remove(name); },
        share: (/** @type {string} */ name, /** @type {boolean} */ shared, /** @type {any} */ context) => {
            adapter.calls.push(["share", name, shared, context]);
            if (fails("share")) return Promise.reject(new Error("share failed"));
            if (shared) sharedNames.add(name); else sharedNames.delete(name);
        },
        listShared: (/** @type {any} */ context) => {
            adapter.calls.push(["listShared", context]);
            if (fails("listShared")) return Promise.reject(new Error("listShared failed"));
            return others.map(({ state, ...view }) => view);
        },
        getShared: (/** @type {string} */ id, /** @type {any} */ context) => {
            adapter.calls.push(["getShared", id, context]);
            return others.find((view) => view.id === id)?.state ?? null;
        }
    });
}

/** @type {import("../../src/types.js").SortSpec[]} */
export const SORT_DESC = [{ key: "name", direction: "desc" }];

/**
 * @param {import("../../src/types.js").ViewStorageAdapter} adapter
 * @param {Partial<import("../../src/types.js").DataTableConfig> & Record<string, any>} [config]
 */
export const mountViews = (adapter, config = {}) => mount({ features: { savedViews: true, sorting: true }, storage: { adapter }, ...config });

export const headerKeys = (/** @type {HTMLElement} */ table) => $$(table, "thead th").map((th) => th.dataset.key);

export const menuItem = (/** @type {HTMLElement} */ table, /** @type {string} */ text) => $$(table, '[role="menuitem"]').find((i) => i.textContent.trim() === text);

/** @type {Partial<import("../../src/types.js").DataTableConfig>} */
export const COMPACT = { features: { compact: true }, defaultLayout: "compact" };

// stickyHeader: a table of 30 rows with room below it to scroll the page past it.
/** @param {Partial<import("../../src/types.js").DataTableConfig>} [config] */
export function mountSticky(config = {}) {
    const table = mount({ stickyHeader: true, pagination: { pageSize: 30 }, ...config });
    const spacer = document.createElement("div");
    spacer.style.height = "2000px";
    table.after(spacer);
    return table;
}

// Sticky scrollbar: a table of 30 rows, narrower than its columns, at the top
// of the page and taller than the window, with room below it to scroll past it.
/** @param {Partial<import("../../src/types.js").DataTableConfig>} [config] */
export function mountWide(config = {}) {
    scrollTo(0, 0);
    const table = mount({ pagination: { pageSize: 30 }, columnMinWidth: "12rem", ...config });
    table.style.width = "320px";
    const spacer = document.createElement("div");
    spacer.style.height = "2000px";
    table.after(spacer);
    return table;
}

// The sticky scrollbar, once it is shown.
export const shownBar = (/** @type {HTMLElement} */ table) => waitFor(() => {
    /** @type {HTMLElement|null} */
    const bar = table.shadowRoot?.querySelector(".jw-dt-hscroll") ?? null;
    return bar && !bar.hidden ? bar : null;
}, { message: "sticky scrollbar shown" });

// Scrolls the page until the top of the table lies `by` px above the window's top.
export const scrollPagePast = (/** @type {HTMLElement} */ table, /** @type {number} */ by) =>
    scrollTo(0, scrollY + $(table, "table").getBoundingClientRect().top + by);

// Box of the (shifted) header row; the thead itself isn't transformed.
export const headerBox = (/** @type {HTMLElement} */ table) => $(table, "thead th").getBoundingClientRect();
