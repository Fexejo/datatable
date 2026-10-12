import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { LocalStorageAdapter, ViewStore } from "../../viewStore.js";

// Minimal in-memory localStorage for Node.
let backing;
beforeEach(() => {
    backing = new Map();
    globalThis.localStorage = {
        getItem: (k) => (backing.has(k) ? backing.get(k) : null),
        setItem: (k, v) => backing.set(k, String(v)),
        removeItem: (k) => backing.delete(k)
    };
});

test("LocalStorageAdapter round-trip with index", async () => {
    const store = new ViewStore(new LocalStorageAdapter("ns"));
    await store.save("A", { sort: [] });
    await store.save("B", { pageSize: 50 });
    await store.save("A", { sort: [{ key: "x" }] });
    assert.deepEqual(await store.list(), ["A", "B"]);
    assert.deepEqual(await store.get("A"), { sort: [{ key: "x" }] });
    await store.delete("A");
    assert.deepEqual(await store.list(), ["B"]);
    assert.equal(await store.get("A"), null);
});

test("LocalStorageAdapter renames in place and overwrites the target", async () => {
    const store = new ViewStore(new LocalStorageAdapter("ns"));
    await store.save("A", { n: 1 });
    await store.save("B", { n: 2 });
    await store.save("C", { n: 3 });
    await store.rename("A", "Z");
    assert.deepEqual(await store.list(), ["Z", "B", "C"], "keeps the position");
    assert.deepEqual(await store.get("Z"), { n: 1 });
    assert.equal(await store.get("A"), null);
    await store.rename("Z", "C");
    assert.deepEqual(await store.list(), ["C", "B"]);
    assert.deepEqual(await store.get("C"), { n: 1 });
    await assert.rejects(store.rename("Missing", "Y"));
});

test("namespaces are isolated", async () => {
    new LocalStorageAdapter("one").save("X", 1);
    assert.deepEqual(await new LocalStorageAdapter("two").list(), []);
});

test("ViewStore requires every adapter method", () => {
    assert.throws(() => new ViewStore({ list() {}, get() {}, save() {}, delete() {} }), /missing: rename/);
});

test("ViewStore accepts sync adapters and turns throws into rejections", async () => {
    const names = [];
    const store = new ViewStore({
        list: () => names,
        get: () => undefined,
        save: (n) => { names.push(n); },
        rename: () => { throw new Error("nope"); },
        delete: () => {}
    });
    await store.save("sync");
    assert.deepEqual(await store.list(), ["sync"]);
    assert.equal(await store.get("sync"), null);
    await assert.rejects(store.rename("sync", "x"), /nope/);
});
