// Public API for the data table.
//
// Registers the <jw-datatable> custom element and provides a factory that
// creates the element, configures it, and mounts it in a container.

import { JwDataTable } from "./src/jwDataTable.js";
import { LocalStorageAdapter, ViewStore } from "./src/core/viewStore.js";
import { inferColumns, inferType } from "./src/core/columns.js";

// Public types (src/types.js); tools/build.js bundles them with the
// declarations of the exports into dist/jw-datatable.min.d.ts.
/** @typedef {import("./src/types.js").DataTableConfig} DataTableConfig */
/** @typedef {import("./src/types.js").Features} Features */
/** @typedef {import("./src/types.js").Column} Column */
/** @typedef {import("./src/types.js").ColumnFormat} ColumnFormat */
/** @typedef {import("./src/types.js").ColumnLink} ColumnLink */
/** @typedef {import("./src/types.js").Row} Row */
/** @typedef {import("./src/types.js").Layout} Layout */
/** @typedef {import("./src/types.js").SortSpec} SortSpec */
/** @typedef {import("./src/types.js").Filter} Filter */
/** @typedef {import("./src/types.js").ValueFilter} ValueFilter */
/** @typedef {import("./src/types.js").PatternFilter} PatternFilter */
/** @typedef {import("./src/types.js").SerializedState} SerializedState */
/** @typedef {import("./src/types.js").ViewStorageAdapter} ViewStorageAdapter */
/** @typedef {import("./src/types.js").ViewStorageContext} ViewStorageContext */
/** @typedef {import("./src/types.js").ViewEntry} ViewEntry */
/** @typedef {import("./src/types.js").SharedView} SharedView */
/** @typedef {import("./src/types.js").ActiveView} ActiveView */
/** @typedef {import("./src/types.js").ExportOptions} ExportOptions */
/** @typedef {import("./src/types.js").ExportDetail} ExportDetail */
/** @typedef {import("./src/types.js").NavigateDetail} NavigateDetail */
/** @typedef {import("./src/types.js").DataTableEventDetails} DataTableEventDetails */
/** @typedef {import("./src/types.js").DataTableEventMap} DataTableEventMap */

/**
 * Creates a configured data table and appends it to `container`.
 *
 * @param {HTMLElement|string} container Target element or CSS selector.
 * @param {DataTableConfig} config See README.
 * @returns {JwDataTable} table instance (Web Component).
 */
export function createDataTable(container, config = {}) {
    const host = typeof container === "string" ? document.querySelector(container) : container;
    if (!host) throw new Error("createDataTable: container not found.");
    const table = /** @type {JwDataTable} */ (document.createElement("jw-datatable"));
    host.appendChild(table);
    table.configure(config);
    return table;
}

export { JwDataTable, LocalStorageAdapter, ViewStore, inferColumns, inferType };
export default createDataTable;
