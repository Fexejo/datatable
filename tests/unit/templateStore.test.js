import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { LocalStorageAdapter, TemplateStore } from "../../templateStore.js";

// Minimal in-memory localStorage for Node.
beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k)
    };
});

test("LocalStorageAdapter round-trip with index", async () => {
    const store = new TemplateStore(new LocalStorageAdapter("ns"));
    await store.save("A", { sort: [] });
    await store.save("B", { page: 2 });
    await store.save("A", { sort: [{ key: "x" }] });
    assert.deepEqual(await store.list(), ["A", "B"]);
    assert.deepEqual(await store.get("A"), { sort: [{ key: "x" }] });
    await store.remove("A");
    assert.deepEqual(await store.list(), ["B"]);
    assert.equal(await store.get("A"), null);
});

test("namespaces are isolated", async () => {
    await new LocalStorageAdapter("one").save("X", 1);
    assert.deepEqual(await new LocalStorageAdapter("two").list(), []);
});

test("TemplateStore accepts sync adapters", async () => {
    const names = [];
    const store = new TemplateStore({
        list: () => names,
        get: () => null,
        save: (n) => { names.push(n); },
        remove: () => {}
    });
    await store.save("sync");
    assert.deepEqual(await store.list(), ["sync"]);
});
