// Public API for the data table.
//
// Registers the <jw-datatable> custom element and provides a factory that
// creates the element, configures it, and mounts it in a container.

import { JwDataTable } from "./jwDataTable.js";
import { LocalStorageAdapter, ViewStore } from "./viewStore.js";
import { inferColumns, inferType } from "./columns.js";

/**
 * Creates a configured data table and appends it to `container`.
 *
 * @param {HTMLElement|string} container Target element or CSS selector.
 * @param {object} config See README (columns, data, features, …).
 * @returns {JwDataTable} table instance (Web Component).
 */
export function createDataTable(container, config = {}) {
    const host = typeof container === "string" ? document.querySelector(container) : container;
    if (!host) throw new Error("createDataTable: container not found.");
    const table = document.createElement("jw-datatable");
    host.appendChild(table);
    table.configure(config);
    return table;
}

export { JwDataTable, LocalStorageAdapter, ViewStore, inferColumns, inferType };
export default createDataTable;
