/*! jw-datatable v1.3.0 | Type declarations of jw-datatable.min.js */

export declare type ActiveView = {
    name: string;
    /**
     * The state differs from the view.
     */
    modified: boolean;
    /**
     * Set when it is a view others shared.
     */
    shared?: SharedView;
};

export declare type Column = {
    /**
     * Field of the row; dot paths work ("address.city").
     */
    key: string;
    /**
     * Header (default: key).
     */
    label?: string;
    /**
     * "string", "number", "currency", "date", "boolean", "enum", … (default "string").
     */
    type?: string;
    /**
     * Value instead of `key`.
     */
    accessor?: (row: Row) => any;
    /**
     * Type-dependent format options.
     */
    format?: ColumnFormat;
    formatter?: (value: any, ctx: {
        row: Row | null;
        column: Column;
        locale: string;
    }) => string | Node;
    exportFormatter?: (value: any, ctx: {
        row: Row;
        column: Column;
        locale: string;
        localized: boolean;
        format: string;
    }) => any;
    /**
     * Shown for empty values (default "").
     */
    emptyText?: string;
    /**
     * Labels of enum/select values.
     */
    options?: {
        value: any;
        label?: string;
    }[];
    align?: "left" | "right" | "center";
    width?: string;
    minWidth?: string;
    maxWidth?: string;
    overflow?: "wrap" | "ellipsis";
    hidden?: boolean;
    /**
     * Shown in the compact layout.
     */
    compact?: boolean;
    pinned?: boolean;
    sortable?: boolean;
    filterable?: boolean;
    searchable?: boolean;
    exportable?: boolean;
    copyable?: boolean;
    link?: ((row: Row, value: any) => string) | ColumnLink;
    action?: (row: Row, value: any, event: Event) => void;
    /**
     * Extra cell classes (space-separated).
     */
    cellClass?: (value: any, row: Row) => string | null | undefined;
};

export declare type ColumnFormat = {
    decimals?: number;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
    grouping?: boolean;
    currency?: string;
    /**
     * Percent: the value is 0–100, not 0–1.
     */
    asNumber?: boolean;
    trueLabel?: string;
    falseLabel?: string;
    options?: Intl.DateTimeFormatOptions;
    /**
     * Enum/select labels by value.
     */
    labels?: Record<string, string>;
};

export declare type ColumnLink = {
    url?: string | ((row: Row, value: any) => string);
    /**
     * Emit `jw-datatable:navigate` instead of navigating.
     */
    spa?: boolean;
    handler?: (row: Row, value: any, event: Event) => void;
};

/**
 * Creates a configured data table and appends it to `container`.
 *
 * @param {HTMLElement|string} container Target element or CSS selector.
 * @param {DataTableConfig} config See README.
 * @returns {JwDataTable} table instance (Web Component).
 */
declare function createDataTable(container: HTMLElement | string, config?: DataTableConfig): JwDataTable;
export { createDataTable }
export default createDataTable;

export declare type DataTableConfig = {
    /**
     * Column definitions.
     */
    columns?: Column[];
    /**
     * Row objects.
     */
    data?: Row[];
    /**
     * Namespace of the saved views (default "default").
     */
    id?: string;
    /**
     * Toolbar title; also names the table for assistive tech.
     */
    title?: string;
    /**
     * BCP-47 locale: formatting, sorting and UI language (default "en-US").
     */
    locale?: string;
    /**
     * Feature switches.
     */
    features?: Features;
    /**
     * Sizes offered
     * (default 10–1000) only while a page stays within 5000 rendered cells.
     */
    pagination?: {
        pageSize?: number;
        pageSizeOptions?: number[];
    };
    /**
     * Initial state.
     */
    initial?: Partial<SerializedState>;
    /**
     * Initial layout; turns off automatic switching.
     */
    defaultLayout?: Layout;
    /**
     * Card layout.
     */
    grid?: {
        minWidth?: string;
        titleColumn?: string;
    };
    responsive?: {
        enabled?: boolean;
        breakpoint?: number;
        autoLayout?: boolean;
        mobileLayout?: Layout;
    };
    /**
     * Scroll the body above this height (sticky header).
     */
    maxHeight?: string;
    /**
     * Keep the header in sight while the page scrolls (not with maxHeight).
     */
    stickyHeader?: boolean;
    /**
     * Minimum width of text columns.
     */
    columnMinWidth?: string;
    /**
     * Long cell text wraps or ends in "…".
     */
    cellOverflow?: "wrap" | "ellipsis";
    /**
     * Saved views.
     */
    storage?: {
        adapter?: ViewStorageAdapter;
        namespace?: string;
        key?: string;
    };
    searchPlaceholder?: string;
    /**
     * Shown without data.
     */
    emptyText?: string;
    /**
     * Shown when the filters match nothing.
     */
    noResultsText?: string;
    /**
     * Base of the default export file name.
     */
    exportFilename?: string;
    exportDefaults?: Partial<ExportOptions>;
    /**
     * Extra CSS for this table.
     */
    styles?: string;
    /**
     * Extra row classes (space-separated).
     */
    rowClass?: (row: Row, index: number) => string | null | undefined;
    onRowClick?: (row: Row, index: number) => void;
    onCellClick?: (value: any, row: Row, column: Column) => void;
};

export declare type DataTableEventDetails = {
    navigate: NavigateDetail;
    change: {
        state: SerializedState;
    };
    datachange: {
        data: Row[];
    };
    export: ExportDetail;
    viewsave: {
        name: string;
        state: SerializedState;
    };
    viewload: {
        name: string;
        state: SerializedState;
        shared?: SharedView;
    };
    viewrename: {
        oldName: string;
        name: string;
    };
    viewdelete: {
        name: string;
    };
    viewshare: {
        name: string;
        shared: boolean;
    };
};

export declare type DataTableEventMap = {
    [K in keyof DataTableEventDetails as `jw-datatable:${K}`]: CustomEvent<DataTableEventDetails[K]>;
};

export declare type ExportDetail = {
    format: ExportOptions["format"];
    destination: ExportOptions["destination"];
    filename: string;
    /**
     * XLSX is binary.
     */
    content: string | Uint8Array<ArrayBuffer>;
    rowCount: number;
    /**
     * Exported column keys.
     */
    columns: string[];
    options: ExportOptions;
};

export declare type ExportOptions = {
    format: "csv" | "xlsx" | "json";
    destination: "download" | "clipboard";
    scope: "page" | "filtered" | "all";
    /**
     * Include hidden columns.
     */
    allColumns: boolean;
    /**
     * Displayed text instead of raw values.
     */
    localized: boolean;
    headers: boolean;
    /**
     * Header / property names.
     */
    names?: "label" | "key";
    /**
     * JSON: { columns, data }.
     */
    metadata: boolean;
    /**
     * CSV.
     */
    delimiter: string;
    filename?: string;
};

export declare type Features = {
    /**
     * Still on when all rows would exceed 5000 rendered cells.
     */
    pagination?: boolean;
    sorting?: boolean;
    multiSort?: boolean;
    filtering?: boolean;
    globalSearch?: boolean;
    contextMenu?: boolean;
    export?: boolean;
    grid?: boolean;
    compact?: boolean;
    columnVisibility?: boolean;
    columnPinning?: boolean;
    columnReorder?: boolean;
    rowDetails?: boolean;
    savedViews?: boolean;
    copyButtons?: boolean;
};

export declare type Filter = ValueFilter | PatternFilter;

/**
 * @param {(Row|null|undefined)[]} rows   Non-objects are skipped.
 * @param {{ overrides?: Record<string, Partial<Column>> }} [options]
 * @returns {Column[]}
 */
export declare function inferColumns(rows: (Row | null | undefined)[], options?: {
    overrides?: Record<string, Partial<Column>>;
}): Column[];

/**
 * @param {(Row|null|undefined)[]} rows
 * @param {string} key
 * @returns {string}
 */
export declare function inferType(rows: (Row | null | undefined)[], key: string): string;

export declare class JwDataTable extends HTMLElement {
    shadow: ShadowRoot;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    /** @param {DataTableConfig} config */
    configure(config?: DataTableConfig): this;
    /** @param {Row[]} rows */
    set data(rows: Row[]);
    get data(): Row[];
    /** @param {Row[]} rows */
    setData(rows: Row[]): void;
    refresh(): void;
    /** @returns {SerializedState} */
    getState(): SerializedState;
    /** @param {Partial<SerializedState>} partial */
    setState(partial?: Partial<SerializedState>): void;
    resetState(): void;
    clearFilters(): void;
    /**
     * @param {Partial<ExportOptions>} options
     * @returns {ExportDetail|null}
     */
    exportData(options?: Partial<ExportOptions>): ExportDetail | null;
    openExportDialog(): void;
    listViews(): Promise<string[]>;
    /** @param {string} name */
    saveView(name: string): Promise<void>;
    /**
     * @param {string} name
     * @returns {Promise<boolean>}
     */
    loadView(name: string): Promise<boolean>;
    /**
     * @param {string} oldName
     * @param {string} newName
     */
    renameView(oldName: string, newName: string): Promise<void>;
    /** @param {string} name */
    deleteView(name: string): Promise<void>;
    /**
     * @param {string} name
     * @param {boolean} [shared]
     */
    shareView(name: string, shared?: boolean): Promise<void>;
    listSharedViews(): Promise<SharedView[]>;
    /**
     * @param {SharedView} view
     * @returns {Promise<boolean>}
     */
    loadSharedView(view: SharedView): Promise<boolean>;
    /** @returns {ActiveView|null} */
    getActiveView(): ActiveView | null;
}

export declare type Layout = "table" | "grid" | "compact";

/** @implements {ViewStorageAdapter} */
export declare class LocalStorageAdapter implements ViewStorageAdapter {
    namespace: string;
    indexKey: string;
    constructor(namespace?: string);
    list(): string[];
    /**
     * @param {string} name
     * @returns {object|null}
     */
    get(name: string): object | null;
    /**
     * @param {string} name
     * @param {object} state
     */
    save(name: string, state: object): void;
    /**
     * @param {string} oldName
     * @param {string} newName
     */
    rename(oldName: string, newName: string): void;
    /** @param {string} name */
    delete(name: string): void;
}

export declare type NavigateDetail = {
    /**
     * null for an unsafe URL.
     */
    href: string | null;
    row: Row;
    column: Column;
    value: any;
};

declare type OwnView = {
    name: string;
    shared: boolean;
};

export declare type PatternFilter = {
    kind: "pattern";
    /**
     * See OPERATORS in core/filtering.js.
     */
    operator: string;
    operand?: any;
    operand2?: any;
    /**
     * Number of operands (default 1).
     */
    arity?: number;
};

export declare type Row = Record<string, any>;

export declare type SerializedState = {
    sort: SortSpec[];
    filters: Record<string, Filter>;
    globalSearch: string;
    /**
     * Omitted in saved views.
     */
    page?: number;
    pageSize: number;
    layout: Layout;
    hiddenColumns: string[];
    pinnedColumns: string[];
    columnOrder: string[];
};

export declare type SharedView = {
    /**
     * Identifies it for `getShared()`.
     */
    id: string;
    name: string;
    /**
     * Shown with the name, e.g. “by Anna Smith”.
     */
    detail?: string;
};

export declare type SortSpec = {
    key: string;
    direction: "asc" | "desc";
};

export declare type ValueFilter = {
    kind: "value";
    values: any[];
};

export declare type ViewEntry = {
    name: string;
    shared?: boolean;
};

export declare type ViewStorageAdapter = {
    list: (context: ViewStorageContext) => (string | ViewEntry)[] | Promise<(string | ViewEntry)[]>;
    get: (name: string, context: ViewStorageContext) => object | null | Promise<object | null>;
    save: (name: string, state: object, context: ViewStorageContext) => void | Promise<void>;
    rename: (oldName: string, newName: string, context: ViewStorageContext) => void | Promise<void>;
    delete: (name: string, context: ViewStorageContext) => void | Promise<void>;
    /**
     * Share an own view with others, or stop sharing it.
     */
    share?: (name: string, shared: boolean, context: ViewStorageContext) => void | Promise<void>;
    /**
     * The views others shared (not the user's own), in display order.
     */
    listShared?: (context: ViewStorageContext) => SharedView[] | Promise<SharedView[]>;
    /**
     * The state of a view others shared.
     */
    getShared?: (id: string, context: ViewStorageContext) => object | null | Promise<object | null>;
};

export declare type ViewStorageContext = {
    /**
     * `storage.key`, else the table's `id`, else "default".
     */
    key: string;
};

export declare class ViewStore {
    /** @type {ViewStorageAdapter} */
    adapter: ViewStorageAdapter;
    /** @type {ViewStorageContext} */
    context: ViewStorageContext;
    canShare: boolean;
    /**
     * @param {ViewStorageAdapter} [adapter]
     * @param {Partial<ViewStorageContext>} [context] Passed to every adapter call.
     */
    constructor(adapter?: ViewStorageAdapter, context?: Partial<ViewStorageContext>);
    list(): Promise<string[]>;
    ownViews(): Promise<OwnView[]>;
    /**
     * @param {string} name
     * @returns {Promise<object|null>}
     */
    get(name: string): Promise<object | null>;
    /**
     * @param {string} name
     * @param {object} state
     */
    save(name: string, state: object): Promise<void>;
    /**
     * @param {string} oldName
     * @param {string} newName
     */
    rename(oldName: string, newName: string): Promise<void>;
    /** @param {string} name */
    delete(name: string): Promise<void>;
    /**
     * @param {string} name
     * @param {boolean} shared
     */
    share(name: string, shared: boolean): Promise<void>;
    listShared(): Promise<SharedView[]>;
    /**
     * @param {string} id
     * @returns {Promise<object|null>}
     */
    getShared(id: string): Promise<object | null>;
}

export { }

declare global {
    interface HTMLElementTagNameMap {
        "jw-datatable": JwDataTable;
    }
    // The events bubble and are composed: typed on every element.
    interface HTMLElementEventMap extends DataTableEventMap {}
}
