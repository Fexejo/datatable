// JSDoc types of the public API and the table state — documentation and
// editor IntelliSense only; nothing here runs. Reference them as
// `import("./types.js").Column` (path relative to the referencing file).
// The README describes each option in detail.

/**
 * @typedef {object} DataTableConfig
 * @property {Column[]} columns                 Column definitions.
 * @property {object[]} [data]                  Row objects.
 * @property {string} [id]                      Namespace of the saved views (default "default").
 * @property {string} [title]                   Toolbar title; also names the table for assistive tech.
 * @property {string} [locale]                  BCP-47 locale: formatting, sorting and UI language (default "en-US").
 * @property {Features} [features]              Feature switches.
 * @property {{ pageSize?: number, pageSizeOptions?: number[] }} [pagination] Sizes offered
 *     (default 10–1000) only while a page stays within 5000 rendered cells.
 * @property {Partial<SerializedState>} [initial] Initial state.
 * @property {Layout} [defaultLayout]           Initial layout; turns off automatic switching.
 * @property {{ minWidth?: string, titleColumn?: string }} [grid] Card layout.
 * @property {{ enabled?: boolean, breakpoint?: number, autoLayout?: boolean, mobileLayout?: Layout }} [responsive]
 * @property {string} [maxHeight]               Scroll the body above this height (sticky header).
 * @property {string} [columnMinWidth]          Minimum width of text columns.
 * @property {"wrap"|"ellipsis"} [cellOverflow] Long cell text wraps or ends in "…".
 * @property {{ adapter?: ViewStorageAdapter, namespace?: string, key?: string }} [storage] Saved views.
 * @property {string} [searchPlaceholder]
 * @property {string} [emptyText]               Shown without data.
 * @property {string} [noResultsText]           Shown when the filters match nothing.
 * @property {string} [exportFilename]          Base of the default export file name.
 * @property {Partial<ExportOptions>} [exportDefaults]
 * @property {string} [styles]                  Extra CSS for this table.
 * @property {(row: object, index: number) => string} [rowClass]
 * @property {(row: object, index: number) => void} [onRowClick]
 * @property {(value: any, row: object, column: Column) => void} [onCellClick]
 */

/**
 * Opt-in features are off unless enabled; pagination, context menu, copy
 * buttons and multi-sort (with sorting) are on.
 * @typedef {object} Features
 * @property {boolean} [pagination]       Still on when all rows would exceed 5000 rendered cells.
 * @property {boolean} [sorting]
 * @property {boolean} [multiSort]
 * @property {boolean} [filtering]
 * @property {boolean} [globalSearch]
 * @property {boolean} [contextMenu]
 * @property {boolean} [export]
 * @property {boolean} [grid]
 * @property {boolean} [compact]
 * @property {boolean} [columnVisibility]
 * @property {boolean} [columnPinning]
 * @property {boolean} [columnReorder]
 * @property {boolean} [rowDetails]
 * @property {boolean} [savedViews]
 * @property {boolean} [copyButtons]
 */

/** @typedef {"table"|"grid"|"compact"} Layout */

/**
 * @typedef {object} Column
 * @property {string} key                       Field of the row; dot paths work ("address.city").
 * @property {string} [label]                   Header (default: key).
 * @property {string} [type]                    "string", "number", "currency", "date", "boolean", "enum", … (default "string").
 * @property {(row: object) => any} [accessor]  Value instead of `key`.
 * @property {object} [format]                  Type-dependent format options.
 * @property {(value: any, ctx: { row: object, column: Column, locale: string }) => string|Node} [formatter]
 * @property {(value: any, ctx: object) => any} [exportFormatter]
 * @property {{ value: any, label?: string }[]} [options] Labels of enum/select values.
 * @property {"left"|"right"|"center"} [align]
 * @property {string} [width]
 * @property {string} [minWidth]
 * @property {string} [maxWidth]
 * @property {"wrap"|"ellipsis"} [overflow]
 * @property {boolean} [hidden]
 * @property {boolean} [compact]                Shown in the compact layout.
 * @property {boolean} [pinned]
 * @property {boolean} [sortable]
 * @property {boolean} [filterable]
 * @property {boolean} [searchable]
 * @property {boolean} [exportable]
 * @property {boolean} [copyable]
 * @property {string|((row: object, value: any) => string)|ColumnLink} [link]
 * @property {(row: object, value: any, event: Event) => void} [action]
 * @property {(value: any, row: object) => string} [cellClass]
 */

/**
 * @typedef {object} ColumnLink
 * @property {string|((row: object, value: any) => string)} [url]
 * @property {boolean} [spa]                    Emit `jw-datatable:navigate` instead of navigating.
 * @property {(row: object, value: any, event: Event) => void} [handler]
 */

/** @typedef {{ key: string, direction: "asc"|"desc" }} SortSpec */

/** @typedef {{ kind: "value", values: any[] }} ValueFilter */

/**
 * @typedef {object} PatternFilter
 * @property {"pattern"} kind
 * @property {string} operator                  See OPERATORS in core/filtering.js.
 * @property {any} [operand]
 * @property {any} [operand2]
 * @property {number} [arity]                   Number of operands (default 1).
 */

/** @typedef {ValueFilter|PatternFilter} Filter */

/**
 * The component's state (core/state.js).
 * @typedef {object} TableState
 * @property {SortSpec[]} sort
 * @property {Record<string, Filter>} filters
 * @property {string} globalSearch
 * @property {number} page
 * @property {number} pageSize
 * @property {Layout} layout
 * @property {Set<string>} hiddenColumns
 * @property {string[]} pinnedColumns          In pin order.
 * @property {string[]} columnOrder            Every column key.
 */

/**
 * The state as `getState()`, events and saved views carry it (JSON-safe).
 * @typedef {object} SerializedState
 * @property {SortSpec[]} sort
 * @property {Record<string, Filter>} filters
 * @property {string} globalSearch
 * @property {number} [page]                    Omitted in saved views.
 * @property {number} pageSize
 * @property {Layout} layout
 * @property {string[]} hiddenColumns
 * @property {string[]} pinnedColumns
 * @property {string[]} columnOrder
 */

/**
 * Storage of saved views; every method may return a Promise.
 * @typedef {object} ViewStorageAdapter
 * @property {() => string[]|Promise<string[]>} list
 * @property {(name: string) => object|null|Promise<object|null>} get
 * @property {(name: string, state: object) => void|Promise<void>} save
 * @property {(oldName: string, newName: string) => void|Promise<void>} rename
 * @property {(name: string) => void|Promise<void>} delete
 */

/**
 * @typedef {object} ExportOptions
 * @property {"csv"|"xlsx"|"json"} format
 * @property {"download"|"clipboard"} destination
 * @property {"page"|"filtered"|"all"} scope
 * @property {boolean} allColumns               Include hidden columns.
 * @property {boolean} localized                Displayed text instead of raw values.
 * @property {boolean} headers
 * @property {"label"|"key"} [names]            Header / property names.
 * @property {boolean} metadata                 JSON: { columns, data }.
 * @property {string} delimiter                 CSV.
 * @property {string} [filename]
 */

export {};
