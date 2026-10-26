// JSDoc types of the public API and the table state — documentation and
// editor IntelliSense only; nothing here runs. Reference them as
// `import("./types.js").Column` (path relative to the referencing file).
// The README describes each option in detail.

/**
 * @typedef {object} DataTableConfig
 * @property {Column[]} [columns]               Column definitions.
 * @property {Row[]} [data]                     Row objects.
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
 * @property {(row: Row, index: number) => string|null|undefined} [rowClass] Extra row classes (space-separated).
 * @property {(row: Row, index: number) => void} [onRowClick]
 * @property {(value: any, row: Row, column: Column) => void} [onCellClick]
 */

/** @typedef {Record<string, any>} Row A data row; columns read it by key or accessor. */

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
 * @property {(row: Row) => any} [accessor]     Value instead of `key`.
 * @property {ColumnFormat} [format]            Type-dependent format options.
 * @property {(value: any, ctx: { row: Row|null, column: Column, locale: string }) => string|Node} [formatter]
 * @property {(value: any, ctx: { row: Row, column: Column, locale: string, localized: boolean, format: string }) => any} [exportFormatter]
 * @property {string} [emptyText]               Shown for empty values (default "").
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
 * @property {((row: Row, value: any) => string)|ColumnLink} [link]
 * @property {(row: Row, value: any, event: Event) => void} [action]
 * @property {(value: any, row: Row) => string|null|undefined} [cellClass] Extra cell classes (space-separated).
 */

/**
 * Format options; which apply depends on the column type (README "Formatting").
 * @typedef {object} ColumnFormat
 * @property {number} [decimals]
 * @property {number} [minimumFractionDigits]
 * @property {number} [maximumFractionDigits]
 * @property {boolean} [grouping]
 * @property {string} [currency]
 * @property {boolean} [asNumber]               Percent: the value is 0–100, not 0–1.
 * @property {string} [trueLabel]
 * @property {string} [falseLabel]
 * @property {Intl.DateTimeFormatOptions} [options]
 * @property {Record<string, string>} [labels]  Enum/select labels by value.
 */

/**
 * A column with the defaults filled in (core/columns.js `normalizeColumns`).
 * @typedef {Omit<Column, "link"> & {
 *     label: string, type: string, align: "left"|"right"|"center",
 *     sortable: boolean, filterable: boolean, copyable: boolean, hidden: boolean, pinned: boolean,
 *     link?: ColumnLink, optionsMap: Record<string, any>|null
 * }} NormalizedColumn
 */

/**
 * @typedef {object} ColumnLink
 * @property {string|((row: Row, value: any) => string)} [url]
 * @property {boolean} [spa]                    Emit `jw-datatable:navigate` instead of navigating.
 * @property {(row: Row, value: any, event: Event) => void} [handler]
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
 * Storage of saved views; every method may return a Promise. The last
 * argument of every call is the context of the table.
 * @typedef {object} ViewStorageAdapter
 * @property {(context: ViewStorageContext) => string[]|Promise<string[]>} list
 * @property {(name: string, context: ViewStorageContext) => object|null|Promise<object|null>} get
 * @property {(name: string, state: object, context: ViewStorageContext) => void|Promise<void>} save
 * @property {(oldName: string, newName: string, context: ViewStorageContext) => void|Promise<void>} rename
 * @property {(name: string, context: ViewStorageContext) => void|Promise<void>} delete
 */

/**
 * Which table a storage call is for.
 * @typedef {object} ViewStorageContext
 * @property {string} key                       `storage.key`, else the table's `id`, else "default".
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

/**
 * `detail` of each event, by name without the `jw-datatable:` prefix.
 * @typedef {object} DataTableEventDetails
 * @property {NavigateDetail} navigate
 * @property {{ state: SerializedState }} change
 * @property {{ data: Row[] }} datachange
 * @property {ExportDetail} export
 * @property {{ name: string, state: SerializedState }} viewsave
 * @property {{ name: string, state: SerializedState }} viewload
 * @property {{ oldName: string, name: string }} viewrename
 * @property {{ name: string }} viewdelete
 */

/**
 * Events of the component (README "Events"); all bubble and are composed.
 * @typedef {{ [K in keyof DataTableEventDetails as `jw-datatable:${K}`]: CustomEvent<DataTableEventDetails[K]> }} DataTableEventMap
 */

/**
 * @typedef {object} NavigateDetail
 * @property {string|null} href                 null for an unsafe URL.
 * @property {Row} row
 * @property {Column} column
 * @property {any} value
 */

/**
 * Detail of `jw-datatable:export`, also returned by `exportData()`.
 * @typedef {object} ExportDetail
 * @property {ExportOptions["format"]} format
 * @property {ExportOptions["destination"]} destination
 * @property {string} filename
 * @property {string|Uint8Array<ArrayBuffer>} content XLSX is binary.
 * @property {number} rowCount
 * @property {string[]} columns                Exported column keys.
 * @property {ExportOptions} options
 */

export {};
