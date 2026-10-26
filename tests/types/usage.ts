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
    onRowClick: (row, index) => console.log(row.name, index)
};

const table: JwDataTable = createDataTable("#people", config);
const same: JwDataTable = createDefault(document.body);
table.setData([{ id: 2 }]);
table.setState({ pageSize: 25, filters: { name: { kind: "value", values: ["Ada"] } } });
const state: SerializedState = table.getState();
const pageSize: number = state.pageSize;
const detail = table.exportData({ format: "csv", destination: "clipboard" });
const content: string | Uint8Array | undefined = detail?.content;
const loaded: Promise<boolean> = table.loadView("mine");
const active: { name: string, modified: boolean } | null = same.getActiveView();

const adapter: ViewStorageAdapter = {
    list: async (context) => [context.key],
    get: () => null,
    save: () => {},
    rename: () => {},
    delete: () => {}
};
const views: Promise<string[]> = new ViewStore(adapter, { key: "people" }).list();
const inferred: Column[] = inferColumns([{ a: 1 }], { overrides: { a: { label: "A" } } });
const type: string = inferType([{ a: 1 }], "a");

// Events: typed on the element and, as they bubble, on any element.
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

export { pageSize, content, loaded, active, views, inferred, type, queried };
