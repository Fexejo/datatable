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
    $$(table, "tbody tr").map((tr) => tr.children[index].querySelector(".k-dt-cell").textContent.trim());

/** @param {Element} node */
export function rightClick(node) {
    const r = node.getBoundingClientRect();
    node.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, composed: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5
    }));
}

// Active live region: the open panel's own region, else the shared one in <body>.
export const status = (/** @type {HTMLElement} */ table) => $(table, ".k-dt-overlay [data-live]")
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
