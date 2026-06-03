// Persist view templates (sort, filters, page size, view mode, …).
// Storage is pluggable via an adapter interface: default is localStorage;
// a backend adapter can be swapped in without changing the component.
//
// Adapter interface (methods may return Promises):
//   list(): Promise<string[]>            — all template names
//   get(name): Promise<object | null>    — template payload
//   save(name, data): Promise<void>      — save/overwrite template
//   remove(name): Promise<void>          — delete template

export class LocalStorageAdapter {
    constructor(namespace = "jw-datatable") {
        this.namespace = namespace;
        this.indexKey = `${namespace}::index`;
    }

    _entryKey(name) {
        return `${this.namespace}::tpl::${name}`;
    }

    _readIndex() {
        try {
            return JSON.parse(localStorage.getItem(this.indexKey) || "[]");
        } catch {
            return [];
        }
    }

    _writeIndex(names) {
        localStorage.setItem(this.indexKey, JSON.stringify(names));
    }

    async list() {
        return this._readIndex();
    }

    async get(name) {
        try {
            const raw = localStorage.getItem(this._entryKey(name));
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    async save(name, data) {
        localStorage.setItem(this._entryKey(name), JSON.stringify(data));
        const names = this._readIndex();
        if (!names.includes(name)) {
            names.push(name);
            this._writeIndex(names);
        }
    }

    async remove(name) {
        localStorage.removeItem(this._entryKey(name));
        this._writeIndex(this._readIndex().filter((n) => n !== name));
    }
}

// Thin facade over the adapter; does not serialize state itself —
// the component owns the state shape.
export class TemplateStore {
    constructor(adapter) {
        this.adapter = adapter ?? new LocalStorageAdapter();
    }

    list() {
        return Promise.resolve(this.adapter.list());
    }

    get(name) {
        return Promise.resolve(this.adapter.get(name));
    }

    save(name, data) {
        return Promise.resolve(this.adapter.save(name, data));
    }

    remove(name) {
        return Promise.resolve(this.adapter.remove(name));
    }
}
