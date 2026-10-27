// Type test of dist/jw-datatable.min.d.ts (see tsconfig.json): everything here
// must compile, and every line after `@ts-expect-error` must be a type error.
import createDefault, {
    createDataTable,
    inferColumns,
    inferType,
    JwDataTable,
    LocalStorageAdapter,
    ViewStore,
    type Column,
    type DataTableConfig,
    type SerializedState,
    type SharedView,
    type ActiveView,
    type ViewStorageAdapter
} from "../../dist/jw-datatable.min.js";

const columns: Column[] = [
    { key: "name", label: "Name", sortable: true, link: { url: (row) => `/people/${row.id}`, spa: true } },
    { key: "fee", type: "currency", format: { currency: "EUR" }, align: "right" },
    { key: "joined", type: "date", formatter: (value, { locale }) => new Date(value).toLocaleDateString(locale) }
];
const config: DataTableConfig = {
    columns,
    data: [{ id: 1, name: "Ada", fee: 50, joined: "2024-01-02" }],
    title: "People",
    features: { filtering: true, export: true, savedViews: true },
    initial: { sort: [{ key: "name", direction: "asc" }], layout: "grid" },
    storage: { adapter: new LocalStorageAdapter("people") },
    stickyHeader: true,
    onRowClick: (row, index) => console.log(row.name, index)
};

const table: JwDataTable = createDataTable("#people", config);
const same: JwDataTable = createDefault(document.body);
table.setData([{ id: 2 }]);
table.resetState();
table.setState({ pageSize: 25, filters: { name: { kind: "value", values: ["Ada"] } } });
const state: SerializedState = table.getState();
const pageSize: number = state.pageSize;
const detail = table.exportData({ format: "csv", destination: "clipboard" });
const content: string | Uint8Array | undefined = detail?.content;
const loaded: Promise<boolean> = table.loadView("mine");
const active: { name: string, modified: boolean } | null = same.getActiveView();
const activeShared: ActiveView["shared"] = same.getActiveView()?.shared;
const others: Promise<SharedView[]> = table.listSharedViews();
const loadedShared: Promise<boolean> = table.loadSharedView({ id: "7", name: "Theirs", detail: "by Anna" });
const shared: Promise<void> = table.shareView("mine", false);

const adapter: ViewStorageAdapter = {
    list: async (context) => [context.key],
    get: () => null,
    save: () => {},
    rename: () => {},
    delete: () => {}
};
const sharingAdapter: ViewStorageAdapter = {
    ...adapter,
    list: () => ["a", { name: "b", shared: true }],
    share: async (name, isShared, { key }) => { console.log(name, isShared, key); },
    listShared: () => [{ id: "1", name: "Theirs", detail: "by Anna" }],
    getShared: async (id) => (id === "1" ? {} : null)
};
const views: Promise<string[]> = new ViewStore(adapter, { key: "people" }).list();
const inferred: Column[] = inferColumns([{ a: 1 }], { overrides: { a: { label: "A" } } });
const type: string = inferType([{ a: 1 }], "a");

// Events: typed on the element and, as they bubble, on any element.
table.addEventListener("jw-datatable:viewshare", (event) => {
    const isShared: boolean = event.detail.shared;
    console.log(isShared);
});
table.addEventListener("jw-datatable:viewload", (event) => {
    const by: string | undefined = event.detail.shared?.detail;
    console.log(by);
});
table.addEventListener("jw-datatable:change", (event) => {
    const sort: SerializedState["sort"] = event.detail.state.sort;
    console.log(sort);
});
document.body.addEventListener("jw-datatable:export", (event) => {
    if (event.detail.format === "xlsx") event.preventDefault();
});
const queried: JwDataTable | null = document.querySelector("jw-datatable");

// @ts-expect-error feature switches are booleans by feature name
createDataTable("#x", { features: { csvExport: true } });
// @ts-expect-error a column needs a key
createDataTable("#x", { columns: [{ label: "Name" }] });
// @ts-expect-error unknown layout
table.setState({ layout: "list" });
// @ts-expect-error unknown export format
table.exportData({ format: "pdf" });
// @ts-expect-error the detail of `change` has no `rows`
table.addEventListener("jw-datatable:change", (event) => event.detail.rows);
// @ts-expect-error internal members are not part of the declarations
table._commit({});

// @ts-expect-error a shared view in list() needs a name
const badAdapter: ViewStorageAdapter = { ...adapter, list: () => [{ shared: true }] };

export { pageSize, content, loaded, active, activeShared, others, loadedShared, shared, sharingAdapter, badAdapter, views, inferred, type, queried };
