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

/** @typedef {import("../types.js").ViewStorageAdapter} ViewStorageAdapter */

/** @type {(keyof ViewStorageAdapter)[]} */
export const ADAPTER_METHODS = ["list", "get", "save", "rename", "delete"];

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

    /** @returns {string[]} */
    _readIndex() {
        try {
            return JSON.parse(localStorage.getItem(this.indexKey) || "[]");
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
// into a Promise. It does not shape the state itself; the component does.
export class ViewStore {
    /** @param {ViewStorageAdapter} [adapter] */
    constructor(adapter) {
        this.adapter = adapter ?? new LocalStorageAdapter();
        const missing = ADAPTER_METHODS.filter((m) => typeof this.adapter[m] !== "function");
        if (missing.length) throw new TypeError(`View storage adapter is missing: ${missing.join(", ")}`);
    }

    // Async wrappers, so a throwing sync adapter also ends in a rejection.
    async list() {
        const names = await this.adapter.list();
        return Array.isArray(names) ? names : [];
    }

    /**
     * @param {string} name
     * @returns {Promise<object|null>}
     */
    async get(name) {
        return (await this.adapter.get(name)) ?? null;
    }

    /**
     * @param {string} name
     * @param {object} state
     */
    async save(name, state) {
        await this.adapter.save(name, state);
    }

    /**
     * @param {string} oldName
     * @param {string} newName
     */
    async rename(oldName, newName) {
        await this.adapter.rename(oldName, newName);
    }

    /** @param {string} name */
    async delete(name) {
        await this.adapter.delete(name);
    }
}
