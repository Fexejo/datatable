import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { LocalStorageAdapter, ViewStore } from "../../src/core/viewStore.js";

// Minimal in-memory localStorage for Node.
/** @type {Map<string, string>} */
let backing;
beforeEach(() => {
    backing = new Map();
    globalThis.localStorage = /** @type {any} */ ({
        getItem: (/** @type {string} */ k) => (backing.has(k) ? backing.get(k) : null),
        setItem: (/** @type {string} */ k, /** @type {unknown} */ v) => backing.set(k, String(v)),
        removeItem: (/** @type {string} */ k) => backing.delete(k)
    });
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
    new LocalStorageAdapter("one").save("X", { n: 1 });
    assert.deepEqual(await new LocalStorageAdapter("two").list(), []);
});

test("ViewStore requires every adapter method", () => {
    assert.throws(() => new ViewStore(/** @type {any} */ ({ list() {}, get() {}, save() {}, delete() {} })), /missing: rename/);
});

test("ViewStore accepts sync adapters and turns throws into rejections", async () => {
    /** @type {string[]} */
    const names = [];
    // `get` returns undefined, which the store turns into null.
    const store = new ViewStore(/** @type {any} */ ({
        list: () => names,
        get: () => undefined,
        save: (/** @type {string} */ n) => { names.push(n); },
        rename: () => { throw new Error("nope"); },
        delete: () => {}
    }));
    await store.save("sync", {});
    assert.deepEqual(await store.list(), ["sync"]);
    assert.equal(await store.get("sync"), null);
    await assert.rejects(store.rename("sync", "x"), /nope/);
});

test("ViewStore passes the context to every adapter call", async () => {
    /** @type {unknown[][]} */
    const calls = [];
    const record = (/** @type {string} */ method) => (/** @type {unknown[]} */ ...args) => { calls.push([method, ...args]); return method === "list" ? [] : null; };
    const adapter = /** @type {any} */ (Object.fromEntries(["list", "get", "save", "rename", "delete"].map((m) => [m, record(m)])));
    const store = new ViewStore(adapter, { key: "orders" });
    await store.list();
    await store.get("A");
    await store.save("A", { n: 1 });
    await store.rename("A", "B");
    await store.delete("B");
    const ctx = { key: "orders" };
    assert.deepEqual(calls, [["list", ctx], ["get", "A", ctx], ["save", "A", { n: 1 }, ctx], ["rename", "A", "B", ctx], ["delete", "B", ctx]]);
    assert.deepEqual(new ViewStore(adapter).context, { key: "default" });
});

test("LocalStorageAdapter treats unreadable storage as empty", async () => {
    backing.set("ns::views", "{not json");
    backing.set("ns::view::A", "{not json");
    const adapter = new LocalStorageAdapter("ns");
    assert.deepEqual(adapter.list(), []);
    assert.equal(adapter.get("A"), null);
});

test("damaged view data counts as empty (index, entries, adapter results)", async () => {
    backing.set("ns::views", JSON.stringify({ A: 1 }));
    const adapter = new LocalStorageAdapter("ns");
    assert.deepEqual(adapter.list(), [], "an index that is no array");
    adapter.save("A", {});
    assert.deepEqual(adapter.list(), ["A"], "saving repairs the index");
    backing.set("ns::views", JSON.stringify(["A", 7, null, "B"]));
    assert.deepEqual(adapter.list(), ["A", "B"], "only string names");

    const results = { list: /** @type {unknown} */ ([1, "x"]), get: /** @type {unknown} */ ("state") };
    const store = new ViewStore(/** @type {any} */ ({
        list: () => results.list, get: () => results.get, save() {}, rename() {}, delete() {}
    }));
    assert.deepEqual(await store.list(), ["x"]);
    assert.equal(await store.get("x"), null, "a string is no state");
    results.get = [1];
    assert.equal(await store.get("x"), null, "an array is no state");
    results.list = "x";
    assert.deepEqual(await store.list(), []);
});

// A complete adapter with sharing; `own` and `others` are what list() and listShared() return.
/**
 * @param {unknown} own
 * @param {unknown} others
 * @param {Record<string, unknown>} [states]
 */
function sharingAdapter(own, others, states = {}) {
    /** @type {unknown[][]} */
    const calls = [];
    return {
        calls,
        list: () => own,
        get: () => null,
        save() {},
        rename() {},
        delete() {},
        share: (/** @type {unknown[]} */ ...args) => { calls.push(["share", ...args]); },
        listShared: (/** @type {unknown[]} */ ...args) => { calls.push(["listShared", ...args]); return others; },
        getShared: (/** @type {string} */ id, /** @type {unknown} */ context) => { calls.push(["getShared", id, context]); return states[id]; }
    };
}

test("ViewStore: sharing is on only with all three sharing methods", async () => {
    const plain = new ViewStore(/** @type {any} */ ({ list: () => [], get() {}, save() {}, rename() {}, delete() {} }));
    assert.equal(plain.canShare, false);
    await assert.rejects(plain.share("A", true), /cannot share/);
    await assert.rejects(plain.listShared(), /cannot share/);
    await assert.rejects(plain.getShared("1"), /cannot share/);
    assert.equal(new ViewStore(new LocalStorageAdapter("ns")).canShare, false);

    const { getShared, ...partial } = sharingAdapter([], []);
    assert.throws(() => new ViewStore(/** @type {any} */ (partial)), /missing: getShared/);
    assert.equal(new ViewStore(/** @type {any} */ (sharingAdapter([], []))).canShare, true);
});

test("ViewStore: own views with their sharing state; damaged entries are dropped", async () => {
    const store = new ViewStore(/** @type {any} */ (sharingAdapter(["A", { name: "B", shared: true }, { name: "C", shared: "yes" }, { shared: true }, 7, null], [])));
    assert.deepEqual(await store.ownViews(), [{ name: "A", shared: false }, { name: "B", shared: true }, { name: "C", shared: false }]);
    assert.deepEqual(await store.list(), ["A", "B", "C"]);
});

test("ViewStore: shares, lists and gets the views of others with the context", async () => {
    const adapter = sharingAdapter([], [
        { id: "1", name: "Theirs", detail: "by Anna" },
        { id: "2", name: "No detail", detail: 5 },
        { id: 3, name: "Bad id" },
        { id: "4" },
        "x"
    ], { 1: { pageSize: 50 }, 2: "state" });
    const store = new ViewStore(/** @type {any} */ (adapter), { key: "orders" });
    const ctx = { key: "orders" };
    await store.share("Mine", true);
    assert.deepEqual(await store.listShared(), [{ id: "1", name: "Theirs", detail: "by Anna" }, { id: "2", name: "No detail" }]);
    assert.deepEqual(await store.getShared("1"), { pageSize: 50 });
    assert.equal(await store.getShared("2"), null, "a string is no state");
    assert.equal(await store.getShared("9"), null);
    assert.deepEqual(adapter.calls.slice(0, 3), [["share", "Mine", true, ctx], ["listShared", ctx], ["getShared", "1", ctx]]);
    adapter.listShared = () => /** @type {any} */ ("nope");
    assert.deepEqual(await store.listShared(), []);
});
