// Persist saved views (sort, filters, page size, layout, columns, …).
// Storage is pluggable via an adapter; without one, views live in
// localStorage. A backend adapter can be swapped in without changing the
// component.
//
// Adapter interface (all methods required; each may return a Promise):
//   list(): string[]                     — all view names, in display order
//   get(name): object | null             — view state
//   save(name, state): void              — save or overwrite a view
//   rename(oldName, newName): void       — rename; overwrites `newName`
//   delete(name): void                   — delete a view
// Every call gets the context `{ key }` (which table) as its last argument.

/** @typedef {import("../types.js").ViewStorageAdapter} ViewStorageAdapter */
/** @typedef {import("../types.js").ViewStorageContext} ViewStorageContext */

/** @type {(keyof ViewStorageAdapter)[]} */
export const ADAPTER_METHODS = ["list", "get", "save", "rename", "delete"];

// The strings of a list of view names (anything else, e.g. damaged data, is dropped).
/**
 * @param {unknown} names
 * @returns {string[]}
 */
function validNames(names) {
    return Array.isArray(names) ? names.filter((name) => typeof name === "string") : [];
}

/** @implements {ViewStorageAdapter} */
export class LocalStorageAdapter {
    constructor(namespace = "jw-datatable") {
        this.namespace = namespace;
        this.indexKey = `${namespace}::views`;
    }

    /** @param {string} name */
    _entryKey(name) {
        return `${this.namespace}::view::${name}`;
    }

    // Names of the stored views; a damaged index counts as empty.
    /** @returns {string[]} */
    _readIndex() {
        try {
            return validNames(JSON.parse(localStorage.getItem(this.indexKey) || "[]"));
        } catch {
            return [];
        }
    }

    /** @param {string[]} names */
    _writeIndex(names) {
        localStorage.setItem(this.indexKey, JSON.stringify(names));
    }

    list() {
        return this._readIndex();
    }

    /**
     * @param {string} name
     * @returns {object|null}
     */
    get(name) {
        try {
            const raw = localStorage.getItem(this._entryKey(name));
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    /**
     * @param {string} name
     * @param {object} state
     */
    save(name, state) {
        localStorage.setItem(this._entryKey(name), JSON.stringify(state));
        const names = this._readIndex();
        if (!names.includes(name)) {
            names.push(name);
            this._writeIndex(names);
        }
    }

    /**
     * @param {string} oldName
     * @param {string} newName
     */
    rename(oldName, newName) {
        if (oldName === newName) return;
        const raw = localStorage.getItem(this._entryKey(oldName));
        if (raw == null) throw new Error(`View "${oldName}" not found`);
        localStorage.setItem(this._entryKey(newName), raw);
        localStorage.removeItem(this._entryKey(oldName));
        // Keep the position of the renamed view; drop an overwritten one.
        this._writeIndex(this._readIndex()
            .filter((n) => n !== newName)
            .map((n) => (n === oldName ? newName : n)));
    }

    /** @param {string} name */
    delete(name) {
        localStorage.removeItem(this._entryKey(name));
        this._writeIndex(this._readIndex().filter((n) => n !== name));
    }
}

// Thin facade over the adapter: checks the interface and turns every result
// into a Promise. Results of the wrong type count as empty (`list()`: the
// string names only; `get()`: an object or null); the component validates
// the state itself (core/state.js `sanitizeState()`).
export class ViewStore {
    /**
     * @param {ViewStorageAdapter} [adapter]
     * @param {Partial<ViewStorageContext>} [context] Passed to every adapter call.
     */
    constructor(adapter, context = {}) {
        this.adapter = adapter ?? new LocalStorageAdapter();
        /** @type {ViewStorageContext} */
        this.context = { key: context.key ?? "default" };
        const missing = ADAPTER_METHODS.filter((m) => typeof this.adapter[m] !== "function");
        if (missing.length) throw new TypeError(`View storage adapter is missing: ${missing.join(", ")}`);
    }

    // Async wrappers, so a throwing sync adapter also ends in a rejection.
    async list() {
        return validNames(await this.adapter.list(this.context));
    }

    /**
     * @param {string} name
     * @returns {Promise<object|null>}
     */
    async get(name) {
        const state = await this.adapter.get(name, this.context);
        return typeof state === "object" && state !== null && !Array.isArray(state) ? state : null;
    }

    /**
     * @param {string} name
     * @param {object} state
     */
    async save(name, state) {
        await this.adapter.save(name, state, this.context);
    }

    /**
     * @param {string} oldName
     * @param {string} newName
     */
    async rename(oldName, newName) {
        await this.adapter.rename(oldName, newName, this.context);
    }

    /** @param {string} name */
    async delete(name) {
        await this.adapter.delete(name, this.context);
    }
}
