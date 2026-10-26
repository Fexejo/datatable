// Persist saved views (sort, filters, page size, layout, columns, …).
// Storage is pluggable via an adapter; without one, views live in
// localStorage. A backend adapter can be swapped in without changing the
// component.
//
// Adapter interface (each method may return a Promise):
//   list(): (string | { name, shared })[] — own views, in display order
//   get(name): object | null             — view state
//   save(name, state): void              — save or overwrite a view
//   rename(oldName, newName): void       — rename; overwrites `newName`
//   delete(name): void                   — delete a view
// Optional, all three or none (sharing):
//   share(name, shared): void            — share an own view, or stop sharing it
//   listShared(): { id, name, detail? }[] — views others shared
//   getShared(id): object | null         — state of a view others shared
// Every call gets the context `{ key }` (which table) as its last argument.

/** @typedef {import("../types.js").ViewStorageAdapter} ViewStorageAdapter */
/** @typedef {import("../types.js").ViewStorageContext} ViewStorageContext */
/** @typedef {import("../types.js").SharedView} SharedView */
/** @typedef {{ name: string, shared: boolean }} OwnView */

/** @type {(keyof ViewStorageAdapter)[]} */
export const ADAPTER_METHODS = ["list", "get", "save", "rename", "delete"];
/** @type {(keyof ViewStorageAdapter)[]} */
export const SHARING_METHODS = ["share", "listShared", "getShared"];

// The strings of a list of view names (anything else, e.g. damaged data, is dropped).
/**
 * @param {unknown} names
 * @returns {string[]}
 */
function validNames(names) {
    return Array.isArray(names) ? names.filter((name) => typeof name === "string") : [];
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Own views from `list()`: names, or { name, shared } (anything else is dropped).
/**
 * @param {unknown} list
 * @returns {OwnView[]}
 */
function validOwnViews(list) {
    if (!Array.isArray(list)) return [];
    return list.flatMap((item) => {
        if (typeof item === "string") return [{ name: item, shared: false }];
        return isObject(item) && typeof item.name === "string" ? [{ name: item.name, shared: item.shared === true }] : [];
    });
}

// Views others shared: { id, name, detail? } with strings (anything else is dropped).
/**
 * @param {unknown} list
 * @returns {SharedView[]}
 */
function validSharedViews(list) {
    if (!Array.isArray(list)) return [];
    return list.flatMap((item) => {
        if (!isObject(item) || typeof item.id !== "string" || typeof item.name !== "string") return [];
        return [{ id: item.id, name: item.name, ...(typeof item.detail === "string" ? { detail: item.detail } : {}) }];
    });
}

// A view state is an object; anything else counts as missing.
/**
 * @param {unknown} state
 * @returns {object|null}
 */
function validState(state) {
    return isObject(state) ? state : null;
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
// into a Promise. Results of the wrong type count as empty (`list()`: names
// or { name, shared }; `get()`: an object or null); the component validates
// the state itself (core/state.js `sanitizeState()`). Sharing is on when the
// adapter has all three sharing methods (`canShare`).
export class ViewStore {
    /**
     * @param {ViewStorageAdapter} [adapter]
     * @param {Partial<ViewStorageContext>} [context] Passed to every adapter call.
     */
    constructor(adapter, context = {}) {
        /** @type {ViewStorageAdapter} */
        this.adapter = adapter ?? new LocalStorageAdapter();
        /** @type {ViewStorageContext} */
        this.context = { key: context.key ?? "default" };
        const has = (/** @type {keyof ViewStorageAdapter} */ m) => typeof this.adapter[m] === "function";
        // The sharing methods only count as missing once one of them is there.
        const sharing = SHARING_METHODS.some(has);
        const missing = [...ADAPTER_METHODS, ...(sharing ? SHARING_METHODS : [])].filter((m) => !has(m));
        if (missing.length) throw new TypeError(`View storage adapter is missing: ${missing.join(", ")}`);
        this.canShare = sharing;
    }

    // Async wrappers, so a throwing sync adapter also ends in a rejection.
    async list() {
        return (await this.ownViews()).map((view) => view.name);
    }

    // The own views with whether each is shared.
    async ownViews() {
        return validOwnViews(await this.adapter.list(this.context));
    }

    /**
     * @param {string} name
     * @returns {Promise<object|null>}
     */
    async get(name) {
        return validState(await this.adapter.get(name, this.context));
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

    // Sharing: these reject when the adapter cannot share.

    /**
     * @param {string} name
     * @param {boolean} shared
     */
    async share(name, shared) {
        await this._sharing().share(name, shared, this.context);
    }

    async listShared() {
        return validSharedViews(await this._sharing().listShared(this.context));
    }

    /**
     * @param {string} id
     * @returns {Promise<object|null>}
     */
    async getShared(id) {
        return validState(await this._sharing().getShared(id, this.context));
    }

    // The sharing methods, bound to the adapter.
    _sharing() {
        const { share, listShared, getShared } = this.adapter;
        if (!share || !listShared || !getShared) throw new Error("The view storage adapter cannot share views (share, listShared, getShared)");
        return { share: share.bind(this.adapter), listShared: listShared.bind(this.adapter), getShared: getShared.bind(this.adapter) };
    }
}
