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

export const $ = (table, sel) => table.shadowRoot.querySelector(sel);

export const $$ = (table, sel) => Array.from(table.shadowRoot.querySelectorAll(sel));

export const columnTexts = (table, index) =>
    $$(table, "tbody tr").map((tr) => tr.children[index].querySelector(".k-dt-cell").textContent.trim());

export function rightClick(node) {
    const r = node.getBoundingClientRect();
    node.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true, composed: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5
    }));
}

// Active live region: the open panel's own region, else the shared one in <body>.
export const status = (table) => $(table, ".k-dt-overlay [data-live]")
    || document.querySelector("body > [data-jw-datatable-announcer]");

// Announcements may carry an invisible alternating suffix (see _announce).
export const statusText = (table) => (status(table)?.textContent ?? "").replace(/\u00a0$/, "");

export const announced = (table, text) => waitFor(() => statusText(table) === text, {
    message: `expected announcement "${text}", got "${statusText(table)}"`
});

// Identifies the Lucide icon inside `node` (same serialized markup as a fresh one).
export const hasIcon = (node, name) => node.querySelector("svg")?.innerHTML === createIcon(name).innerHTML;

// In-memory adapter; `fail` makes the named methods reject.
export function memoryAdapter(views = {}, { fail = [] } = {}) {
    const saved = new Map(Object.entries(views));
    const calls = [];
    const step = (method, fn) => (...args) => {
        calls.push([method, ...args]);
        return fail.includes(method) ? Promise.reject(new Error(`${method} failed`)) : fn(...args);
    };
    return {
        saved,
        calls,
        list: step("list", () => [...saved.keys()]),
        get: step("get", (n) => saved.get(n) ?? null),
        save: step("save", (n, d) => { saved.set(n, d); }),
        rename: step("rename", (from, to) => { saved.set(to, saved.get(from)); saved.delete(from); }),
        delete: step("delete", (n) => { saved.delete(n); })
    };
}

export const SORT_DESC = [{ key: "name", direction: "desc" }];

export const mountViews = (adapter, config = {}) => mount({ features: { savedViews: true, sorting: true }, storage: { adapter }, ...config });

export const headerKeys = (table) => $$(table, "thead th").map((th) => th.dataset.key);

export const menuItem = (table, text) => $$(table, '[role="menuitem"]').find((i) => i.textContent.trim() === text);

export const COMPACT = { features: { compact: true }, defaultLayout: "compact" };
