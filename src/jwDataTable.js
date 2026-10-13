// <jw-datatable> — configurable, reusable data table (Vanilla JS).
//
// Features: pagination, sorting (including multi-column), value and pattern filters,
// quick filters and actions via context menu, CSV/XLSX/JSON export, card and compact layouts,
// links (href / SPA routing / custom handlers), per-column copy buttons,
// runtime data updates, and saved views (localStorage or a custom adapter).
//
// This file is the Web Component: it owns the state, renders the table and
// cards, handles events and opens panels. State logic lives in core/, the
// panels in panels/, toolbar and footer in render/, DOM building blocks in
// ui/. The public API is `datatable.js`.

import { getTranslations } from "./core/i18n.js";
import { getCellValue, clamp, debounce, uid, typeGroup } from "./core/util.js";
import { formatValue, toText } from "./core/formatters.js";
import { sortData, toggleSort } from "./core/comparators.js";
import { distinctValues, isActiveFilter, describeFilter } from "./core/filtering.js";
import { normalizeColumns } from "./core/columns.js";
import { DEFAULT_PAGE_SIZES, MAX_PAGE_CELLS, exceedsCellLimit, pageRange, pageSizeChoices } from "./core/pagination.js";
import {
    createState, mergeState, serializeState, viewSignature, activeFilterCount,
    normalizeOrder, orderedColumns, moveColumn, deriveRows
} from "./core/state.js";
import { ViewStore, LocalStorageAdapter } from "./core/viewStore.js";
import {
    EXPORT_DEFAULTS, EXPORT_FORMATS, buildExport, exportColumns, defaultNames,
    defaultFilename, withExtension, downloadFile, neutralizeFormula
} from "./export/export.js";
import { el, iconEl, deepActiveElement, focusIsLost, truncate } from "./ui/dom.js";
import { applyStyles } from "./ui/stylesheet.js";
import { Announcer, getAnnouncer } from "./ui/announcer.js";
import { Overlay } from "./ui/overlay.js";
import { openContextMenu, closeContextMenu } from "./ui/contextMenu.js";
import { writeClipboard, confirmOnButton, flashCopied } from "./ui/clipboard.js";
import { waitForLongPress } from "./ui/longPress.js";
import { initRoving, tableCellTarget, listItemTarget } from "./ui/keyboard.js";
import { bindColumnMove } from "./ui/columnDrag.js";
import { layoutPinned, updateScrollShadows } from "./ui/pinnedLayout.js";
import { buildToolbar, buildFilterButtons } from "./render/toolbar.js";
import { buildFooter } from "./render/footer.js";
import { buildFilterPanel } from "./panels/filterPanel.js";
import { buildFilterSummary } from "./panels/filterSummary.js";
import { buildExportDialog } from "./panels/exportDialog.js";
import { buildColumnChooser } from "./panels/columnChooser.js";
import { buildDetailsDialog } from "./panels/detailsDialog.js";
import { buildViewsPanel } from "./panels/viewsPanel.js";

/** @typedef {import("./types.js").NormalizedColumn} Column */
/** @typedef {import("./types.js").Row} Row */
/** @typedef {import("./types.js").Layout} Layout */
/** @typedef {import("./types.js").Filter} Filter */
/** @typedef {import("./types.js").SortSpec} SortSpec */
/** @typedef {import("./types.js").TableState} TableState */
/** @typedef {import("./types.js").ExportOptions} ExportOptions */
/** @typedef {import("./ui/contextMenu.js").MenuItem} MenuItem */
/**
 * Record of a rendered cell, card, header or field (`_items`); a header has no row.
 * @typedef {{ column: Column, row: Row|null, value: any, index?: number }} ItemRecord
 */
/** @typedef {{ row: Row, index: number }} RowRecord Record of a rendered table row. */
/** @typedef {{ clientX: number, clientY: number, target: HTMLElement }} MenuPoint */

// Saved view names are trimmed and must not be empty.
/** @param {unknown} name */
function viewName(name) {
    const result = String(name ?? "").trim();
    if (!result) throw new TypeError("A saved view needs a name");
    return result;
}

// Elements that open the context menu; each has a record in `_items`.
const MENU_HOSTS = "th.k-dt-th, td.k-dt-td, .k-dt-card";
// Elements holding one value (with its link, action or copy button).
const VALUE_HOSTS = "td.k-dt-td, dd.k-dt-pair-value, .k-dt-card-title";
// Controls inside a value host, handled by `_onClick`.
const VALUE_CONTROLS = ".k-dt-copy, .k-dt-cell-action, .k-dt-link, .k-dt-details-btn";

// Target of a column link: `link.url` as a string or (row, value) => string.
/**
 * @param {import("./types.js").ColumnLink} link
 * @param {Row} row
 * @param {any} value
 * @returns {string|null}
 */
function linkHref(link, row, value) {
    if (typeof link.url === "function") return link.url(row, value);
    return typeof link.url === "string" ? link.url : null;
}

// Opt-in features default to `false` and must be enabled explicitly via
// `config.features`. Always-on basics (pagination, context menu, copy buttons)
// stay `true`. `multiSort` only takes effect when `sorting` is enabled.
/** @type {Required<import("./types.js").Features>} */
const DEFAULT_FEATURES = {
    pagination: true,
    sorting: false,
    multiSort: true,
    filtering: false,
    globalSearch: false,
    contextMenu: true,
    export: false,
    grid: false,
    compact: false,
    columnVisibility: false,
    columnPinning: false,
    columnReorder: false,
    rowDetails: false,
    savedViews: false,
    copyButtons: true
};

class JwDataTable extends HTMLElement {
    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: "open" });
        // Replaced by `configure()`; nothing renders before.
        this._configured = false;
        /** @type {import("./types.js").DataTableConfig & { locale: string }} */
        this._config = { locale: "en-US" };
        this._t = getTranslations();
        this._features = { ...DEFAULT_FEATURES };
        /** @type {Row[]} */
        this._sourceData = [];
        /** @type {Column[]} */
        this._columns = [];
        this._state = createState([], {}, { pageSize: DEFAULT_PAGE_SIZES[0] });
        this._pageSizeOptions = DEFAULT_PAGE_SIZES;
        /** @type {{ enabled: boolean, breakpoint: number, autoLayout: boolean, mobileLayout: Layout }} */
        this._responsive = { enabled: false, breakpoint: 640, autoLayout: false, mobileLayout: "grid" };
        this._pageCount = 1;
        // Keys of pinned columns that don't fit (see `_layoutPinned`).
        /** @type {string[]} */
        this._pausedPins = [];
        // Focus key of the body's roving tab stop.
        /** @type {string|undefined} */
        this._rovingKey = undefined;
        /** @type {{ panel: HTMLElement, sync: () => void }|null} */
        this._chooser = null;
        /** @type {Row[]} */
        this._viewData = [];
        /** @type {Row[]} */
        this._pageData = [];
        this._paginationForced = false;
        /** @type {ViewStore|null} */
        this._viewStore = null;
        // { name, signature } of the saved view last saved or loaded.
        /** @type {{ name: string, signature: string }|null} */
        this._activeView = null;
        this._instanceId = uid("kdt");
        // Responsive / touch state
        /** @type {MediaQueryList|null} */
        this._mql = null;
        /** @type {((event: MediaQueryListEvent) => void)|null} */
        this._mqlHandler = null;
        this._mobileMatches = false;
        this._layoutUserSet = false;
        /** @type {(() => void)|null} */
        this._longPress = null;   // cancels a pending long-press
        /** @type {{ key: string|null }} */
        this._drag = { key: null };   // column being dragged by its header
        this._suppressClickUntil = 0;
        this._suppressContextUntil = 0;
        /** @type {ResizeObserver|null} */
        this._resizeObserver = null;
        // Rendered row, cell, card, header and field elements → their record
        // { row, index, column, value }, read by the delegated event handlers.
        /** @type {WeakMap<Element, ItemRecord|RowRecord>} */
        this._items = new WeakMap();
        this._listen();
        this._overlay = new Overlay(this.shadow, { restoreFocus: (key) => this._restoreFocus(key) });
        // While a modal panel is open, everything outside it is hidden from
        // assistive tech, so the panel's own live region is used.
        this._announcer = new Announcer(() => this._overlay.liveRegion() || getAnnouncer());
        // Rebuilds body/footer only, so the focused search field is preserved.
        this._debouncedSearch = debounce((/** @type {string} */ value) => this._commit({ globalSearch: value, page: 1 }, {
            update: "body",
            announce: () => this._debouncedSearchAnnounce()
        }), 200);
        // Announce the result count only once typing pauses, not after every letter.
        this._debouncedSearchAnnounce = debounce(() => this._announceResults(), 1000);
    }

    connectedCallback() {
        getAnnouncer();
        if (!this._configured) return;
        if (!this._mql) this._setupResponsive();
        if (!this.shadow.querySelector(".k-dt")) this._render();
    }

    disconnectedCallback() {
        this._debouncedSearch.cancel();
        this._debouncedSearchAnnounce.cancel();
        this._announcer.cancel();
        closeContextMenu();
        this._closeOverlay();
        this._cancelLongPress();
        this._teardownResponsive();
        this._resizeObserver?.disconnect();
    }

    // ---- Public API -------------------------------------------------------

    /** @param {import("./types.js").DataTableConfig} config */
    configure(config = {}) {
        this._config = {
            locale: "en-US",
            ...config
        };
        this._t = getTranslations(this._config.locale);
        applyStyles(this.shadow, this._config.styles || "");
        // Derive text defaults from translation bundle; allow explicit config override.
        this._config.emptyText ??= this._t.emptyData;
        this._config.noResultsText ??= this._t.noResults;
        this._features = { ...DEFAULT_FEATURES, ...(config.features || {}) };
        this._columns = normalizeColumns(config.columns || [], {
            features: this._features,
            columnMinWidth: this._config.columnMinWidth
        });
        this._sourceData = Array.isArray(config.data) ? config.data.slice() : [];

        const pagination = config.pagination || {};
        this._pageSizeOptions = pagination.pageSizeOptions || DEFAULT_PAGE_SIZES;
        this._paginationForced = false;

        const storage = config.storage || {};
        this._viewStore = null;
        this._activeView = null;
        if (this._features.savedViews) {
            const storageKey = storage.key || config.id || "default";
            const namespace = (storage.namespace || "jw-datatable") + "::" + storageKey;
            this._viewStore = new ViewStore(storage.adapter || new LocalStorageAdapter(namespace));
        }

        const initial = config.initial || {};
        this._state = createState(this._columns, initial, {
            pageSize: pagination.pageSize || this._pageSizeOptions[0] || 25,
            layout: config.defaultLayout
        });

        // An explicit layout choice (config or initial state) pins the layout and
        // opts out of the automatic breakpoint-driven switching.
        this._layoutUserSet = !!(initial.layout || config.defaultLayout);

        this._configured = true;
        this._setupResponsive();
        this._deriveView();
        this._render();
        return this;
    }

    /** @param {Row[]} rows */
    set data(rows) {
        this.setData(rows);
    }

    get data() {
        return this._sourceData;
    }

    // Replace data at runtime; sort/filter state is preserved.
    /** @param {Row[]} rows */
    setData(rows) {
        this._sourceData = Array.isArray(rows) ? rows.slice() : [];
        if (!this._configured) return;
        this._deriveView();
        this._render();
        this._emit("datachange", { data: this._sourceData });
    }

    refresh() {
        this._deriveView();
        this._render();
    }

    /** @returns {import("./types.js").SerializedState} */
    getState() {
        return serializeState(this._state);
    }

    /** @param {Partial<import("./types.js").SerializedState>} partial */
    setState(partial = {}) {
        if (partial.layout) this._layoutUserSet = true;
        this._commit(mergeState(this._state, partial, this._columns.map((c) => c.key)));
    }

    clearFilters() {
        this._commit({ filters: {}, globalSearch: "", page: 1 }, { announce: () => this._announceResults() });
    }

    // Builds the export and downloads it or copies it to the clipboard.
    // `options` override `config.exportDefaults`. Returns the event detail, or
    // null when a `jw-datatable:export` listener cancelled it.
    /** @param {Partial<ExportOptions>} options */
    exportData(options = {}) {
        /** @type {ExportOptions} */
        const opts = { ...this._exportDefaults(), ...options };
        if (!EXPORT_FORMATS[opts.format]) opts.format = EXPORT_DEFAULTS.format;
        opts.names ??= defaultNames(opts.format);
        // XLSX is binary and can only be downloaded.
        if (opts.destination !== "clipboard" || !EXPORT_FORMATS[opts.format].text) opts.destination = "download";
        const rows = this._exportRows(opts.scope);
        const columns = exportColumns(opts.allColumns ? this._orderedColumns() : this._visibleColumns());
        const content = buildExport(rows, columns, { ...opts, locale: this._config.locale, sheet: this._exportBaseName() });
        const filename = opts.filename
            ? withExtension(opts.filename, opts.format)
            : defaultFilename(this._exportBaseName(), opts.format);
        const detail = {
            format: opts.format,
            destination: opts.destination,
            filename,
            content,
            rowCount: rows.length,
            columns: columns.map((c) => c.key),
            options: { ...opts, filename }
        };
        if (!this._emit("export", detail, { cancelable: true })) return null;
        const count = this._t.resultsCount(rows.length);
        if (opts.destination === "clipboard") {
            this._copyText(/** @type {string} */ (content), null, null, this._t.exportedClipboard(count));
        } else {
            downloadFile(content, filename, opts.format);
            this._announce(this._t.exported(count, filename));
        }
        return detail;
    }

    openExportDialog() {
        this._openExportDialog(/** @type {HTMLElement|null} */ (this.shadow.querySelector('[data-fk="tb:export"]')));
    }

    // Saved views: the state without the current page, stored through the
    // adapter. The methods reject when the adapter fails (or the feature is
    // off); the `view*` events fire after success.

    async listViews() {
        return this._requireViewStore().list();
    }

    /** @param {string} name */
    async saveView(name) {
        const store = this._requireViewStore();
        name = viewName(name);
        const state = this._viewState();
        await store.save(name, state);
        this._activeView = { name, signature: this._viewSignature() };
        this._emit("viewsave", { name, state });
    }

    // Resolves to false when there is no view with this name.
    /**
     * @param {string} name
     * @returns {Promise<boolean>}
     */
    async loadView(name) {
        const store = this._requireViewStore();
        name = viewName(name);
        const saved = await store.get(name);
        if (!saved) return false;
        // A loaded view starts on page 1.
        this.setState({ ...saved, page: 1 });
        this._activeView = { name, signature: this._viewSignature() };
        this._emit("viewload", { name, state: this._viewState() });
        return true;
    }

    // Overwrites a view named `newName`; the panel asks before that.
    /**
     * @param {string} oldName
     * @param {string} newName
     */
    async renameView(oldName, newName) {
        const store = this._requireViewStore();
        oldName = viewName(oldName);
        newName = viewName(newName);
        if (oldName === newName) return;
        await store.rename(oldName, newName);
        if (this._activeView?.name === oldName) this._activeView.name = newName;
        else if (this._activeView?.name === newName) this._activeView = null;
        this._emit("viewrename", { oldName, name: newName });
    }

    /** @param {string} name */
    async deleteView(name) {
        const store = this._requireViewStore();
        name = viewName(name);
        await store.delete(name);
        if (this._activeView?.name === name) this._activeView = null;
        this._emit("viewdelete", { name });
    }

    // The view last saved or loaded: { name, modified }, or null.
    getActiveView() {
        if (!this._activeView) return null;
        return { name: this._activeView.name, modified: this._viewSignature() !== this._activeView.signature };
    }

    // ---- Responsive (Mobile First) ----------------------------------------

    // Sets up a matchMedia listener that, when `responsive.autoLayout` is on,
    // switches to `responsive.mobileLayout` (cards by default) below the
    // breakpoint and back to the table on desktop — unless the developer/user
    // chose a layout explicitly.
    _setupResponsive() {
        this._teardownResponsive();
        const r = this._config.responsive || {};
        this._responsive = {
            enabled: r.enabled !== false,
            breakpoint: typeof r.breakpoint === "number" ? r.breakpoint : 640,
            autoLayout: r.autoLayout !== false,
            mobileLayout: r.mobileLayout || "grid"
        };

        if (!this._responsive.enabled || typeof window.matchMedia !== "function") {
            this._mobileMatches = false;
            return;
        }

        this._mql = window.matchMedia(`(max-width: ${this._responsive.breakpoint - 0.02}px)`);
        this._mobileMatches = this._mql.matches;
        this._mqlHandler = (event) => this._onBreakpointChange(event.matches);
        this._mql.addEventListener("change", this._mqlHandler);
        this._applyAutoLayout();
    }

    _teardownResponsive() {
        if (this._mql && this._mqlHandler) this._mql.removeEventListener("change", this._mqlHandler);
        this._mql = null;
        this._mqlHandler = null;
    }

    _applyAutoLayout() {
        if (!this._responsive || !this._responsive.enabled || !this._responsive.autoLayout) return;
        if (this._layoutUserSet || !this._availableLayouts().includes(this._responsive.mobileLayout)) return;
        this._state.layout = this._mobileMatches ? this._responsive.mobileLayout : "table";
    }

    /** @param {boolean} matches */
    _onBreakpointChange(matches) {
        this._mobileMatches = matches;
        // Transient popups computed for the previous layout are no longer valid.
        this._closeOverlay();
        closeContextMenu();

        const mobileLayout = this._responsive.mobileLayout;
        if (!this._responsive.autoLayout || this._layoutUserSet || !this._availableLayouts().includes(mobileLayout)) return;
        const next = matches ? mobileLayout : "table";
        if (next !== this._state.layout) this._commit({ layout: next });
    }

    _isMobile() {
        return !!this._mobileMatches;
    }

    // ---- Layouts: table, cards ("grid"), compact table + details ----------

    /** @returns {Layout[]} */
    _availableLayouts() {
        return /** @type {Layout[]} */ (["table", this._features.grid && "grid", this._features.compact && "compact"].filter(Boolean));
    }

    // The layout to render: the chosen one if its feature is on, else the table.
    _currentLayout() {
        return this._availableLayouts().includes(this._state.layout) ? this._state.layout : "table";
    }

    _isCompact() {
        return this._currentLayout() === "compact";
    }

    // Columns of the table layout; the compact layout shows only the columns
    // marked `compact: true`, else the first two visible ones.
    _tableColumns() {
        const visible = this._visibleColumns();
        if (!this._isCompact()) return visible;
        const marked = visible.filter((c) => c.compact);
        return marked.length ? marked : visible.slice(0, 2);
    }

    // ---- Normalization & derivation ---------------------------------------

    // All columns (including hidden ones) in display order.
    _orderedColumns() {
        return orderedColumns(this._columns, this._state, { pinning: this._features.columnPinning });
    }

    // Visible columns in display order.
    _visibleColumns() {
        return this._orderedColumns().filter((c) => !this._state.hiddenColumns.has(c.key));
    }

    _orderChanged() {
        return this._state.columnOrder.join("\u0000") !== this._columns.map((c) => c.key).join("\u0000");
    }

    /** @param {Column|undefined} column */
    _isPinned(column) {
        return !!column && this._features.columnPinning && this._state.pinnedColumns.includes(column.key);
    }

    _deriveView() {
        this._checkPagination();
        const rows = deriveRows(this._sourceData, this._state, this._columns, {
            locale: this._config.locale,
            globalSearch: this._features.globalSearch,
            pagination: this._paginated()
        });
        this._viewData = rows.viewData;
        this._pageData = rows.pageData;
        this._pageCount = rows.pageCount;
        this._state.page = rows.page;
    }

    // Cells rendered per row in the current layout (hidden columns render none).
    _cellsPerRow() {
        if (this._currentLayout() === "grid") return this._visibleColumns().length;
        return this._tableColumns().length + (this._isCompact() ? 1 : 0);
    }

    // Pagination is on unless turned off — and then still on when rendering
    // all rows would exceed MAX_PAGE_CELLS (see core/pagination.js).
    _paginated() {
        return this._features.pagination || this._paginationForced;
    }

    _checkPagination() {
        const forced = !this._features.pagination
            && exceedsCellLimit(this._sourceData.length, this._cellsPerRow());
        if (forced && !this._paginationForced) {
            console.warn(`jw-datatable: ${this._sourceData.length} rows × ${this._cellsPerRow()} columns exceed `
                + `${MAX_PAGE_CELLS} cells; pagination is turned on (features.pagination: false is ignored).`);
        }
        this._paginationForced = forced;
    }

    // ---- State changes ----------------------------------------------------

    // Every change from the UI or the API goes through here: apply `patch`,
    // re-derive the rows, update the DOM no more than `update` needs, emit
    // `jw-datatable:change`, then call `announce` (rows are up to date by then).
    //   "full"    – re-render the table
    //   "body"    – rows and footer only; the toolbar (e.g. a focused search field) stays
    //   "sort"    – header sort state in place, rows and footer
    //   "columns" – header cells reused and reordered, rows; syncs an open column chooser
    /**
     * @param {Partial<TableState>} patch
     * @param {{ update?: "full"|"body"|"sort"|"columns", announce?: (() => void)|null }} [options]
     */
    _commit(patch, { update = "full", announce = null } = {}) {
        Object.assign(this._state, patch);
        this._deriveView();
        if (update === "body") this._refreshBody();
        else if (update === "sort") this._refreshSort();
        else if (update === "columns") this._refreshColumns();
        else this._render();
        this._emitChange();
        announce?.();
    }

    // ---- Rendering --------------------------------------------------------

    _render() {
        if (!this._configured) return;
        const focusKey = this._focusKey();
        // Replace only the table root; open panels and the context menu stay in place.
        const previous = this.shadow.querySelector(".k-dt");

        const root = el("div", { class: "k-dt", part: "root" });
        root.appendChild(this._renderToolbar());
        // The viewport stays put while the body inside is replaced; it draws
        // the horizontal scroll shadows.
        root.appendChild(el("div", { class: "k-dt-viewport" }, [this._renderBody()]));

        if (this._paginated()) root.appendChild(this._renderFooter());
        if (previous) previous.replaceWith(root);
        else this.shadow.prepend(root);
        this._observeLayout();
        this._restoreFocus(focusKey);
    }

    _renderBody() {
        const body = el("div", { class: "k-dt-body", part: "body", onscroll: (e) => updateScrollShadows(/** @type {HTMLElement} */ (e.currentTarget.parentElement)) });
        if (this._config.maxHeight) body.style.maxHeight = this._config.maxHeight;
        body.appendChild(this._currentLayout() === "grid" ? this._renderGrid() : this._renderTable());
        return body;
    }

    _renderToolbar() {
        const t = this._t;
        const features = this._features;
        /** @type {Record<Layout, { icon: string, label: string }>} */
        const layoutMeta = {
            table: { icon: "table", label: t.layoutTable },
            grid: { icon: "layout-grid", label: t.layoutGrid },
            compact: { icon: "rows-3", label: t.layoutCompact }
        };
        /** @type {{ fk: string, icon: string, label: string, open: (anchor: HTMLElement) => void }[]} */
        const panels = [];
        if (features.columnVisibility) panels.push({ fk: "tb:columns", icon: "columns-3", label: t.showHideColumns, open: (a) => this._openColumnChooser(a) });
        if (this._viewStore) panels.push({ fk: "tb:saved-views", icon: "bookmark", label: t.savedViews, open: (a) => this._openViewsPanel(a) });
        if (features.export) panels.push({ fk: "tb:export", icon: "download", label: t.exportData, open: (a) => this._openExportDialog(a) });
        return buildToolbar({
            t,
            title: this._config.title,
            titleId: this._hintId("title"),
            search: features.globalSearch ? {
                value: this._state.globalSearch,
                placeholder: this._config.searchPlaceholder || t.searchPlaceholder,
                onInput: (value) => this._debouncedSearch(value)
            } : null,
            ...this._filterButtonProps(),
            layouts: this._availableLayouts().map((layout) => ({ layout, ...layoutMeta[layout] })),
            currentLayout: this._currentLayout(),
            onLayout: (layout) => {
                this._layoutUserSet = true;
                this._commit({ layout });
            },
            panels,
            openerKey: this._overlay.openerKey
        });
    }

    _filterButtonProps() {
        const features = this._features;
        return {
            filterCount: features.filtering ? activeFilterCount(this._state, { globalSearch: features.globalSearch }) : 0,
            onShowFilters: (/** @type {HTMLElement} */ anchor) => this._openFilterSummary(anchor),
            onClearFilters: () => this.clearFilters()
        };
    }

    // "Filter (n)" and its "x" in place: typing in the search field changes
    // the count without re-rendering the toolbar.
    _refreshFilterButtons() {
        const right = this.shadow.querySelector(".k-dt-toolbar-right");
        if (!right) return;
        const next = buildFilterButtons({ t: this._t, ...this._filterButtonProps(), openerKey: this._overlay.openerKey });
        const current = right.querySelector(":scope > .k-dt-btn-group");
        if (current && next) current.replaceWith(next);
        else if (current) current.remove();
        else if (next) right.prepend(next);
    }

    _renderTable() {
        const wrap = el("div", { class: "k-dt-scroll" });
        const table = el("table", {
            class: "k-dt-table",
            part: "table",
            // The toolbar title names the table for assistive tech.
            "aria-labelledby": this._config.title ? this._hintId("title") : null
        });
        const columns = this._tableColumns();
        const compact = this._isCompact();
        if (compact) table.classList.add("k-dt-table--compact");

        // Header
        const thead = el("thead");
        const headRow = el("tr");
        columns.forEach((column, i) => headRow.appendChild(this._pinCell(this._renderHeaderCell(column), i, columns)));
        if (compact) {
            headRow.appendChild(el("th", { class: "k-dt-th k-dt-details-col", scope: "col" }, [
                el("span", { class: "k-dt-sr-only", text: this._t.details })
            ]));
        }
        thead.appendChild(headRow);
        table.appendChild(thead);

        table.appendChild(this._renderTbody(columns));
        if (this._pageData.length > 0) {
            table.setAttribute("aria-describedby", this._hintId("table"));
            wrap.appendChild(el("p", {
                id: this._hintId("table"),
                class: "k-dt-sr-only",
                text: compact ? this._t.compactKeyboardHint : this._t.tableKeyboardHint
            }));
        }
        wrap.appendChild(table);
        return wrap;
    }

    // No data at all, or nothing left after filtering.
    _emptyMessage() {
        return this._sourceData.length === 0 ? this._config.emptyText : this._config.noResultsText;
    }

    /** @param {Column[]} columns */
    _renderTbody(columns) {
        const tbody = el("tbody");
        if (this._pageData.length === 0) {
            tbody.appendChild(el("tr", {}, [
                el("td", { class: "k-dt-empty", colSpan: (columns.length + (this._isCompact() ? 1 : 0)) || 1 }, [this._emptyMessage()])
            ]));
        } else {
            this._pageData.forEach((row, index) => tbody.appendChild(this._renderRow(row, index, columns)));
            this._initRoving(tbody, ".k-dt-td", (event, cell) => this._onCellKey(event, /** @type {HTMLTableCellElement} */ (cell)));
        }
        return tbody;
    }

    /** @param {Column} column */
    _renderHeaderCell(column) {
        const th = el("th", {
            class: "k-dt-th k-dt-align-" + column.align + (column.minWidth ? " k-dt-has-min" : ""),
            scope: "col",
            "data-key": column.key,
            "aria-sort": this._ariaSort(column),
            style: (column.width ? `width:${column.width};` : "")
                + (column.minWidth ? `--k-dt-col-min:${column.minWidth};` : "") || null
        });

        const inner = el("div", { class: "k-dt-th-inner" });
        const labelBtn = el(column.sortable ? "button" : "span", {
            class: "k-dt-th-label",
            type: column.sortable ? "button" : null,
            "data-fk": column.sortable ? `sort:${column.key}` : null,
            title: column.sortable ? this._t.sortHint : null,
            onclick: column.sortable
                ? (e) => this._applySort(column.key, { additive: e.shiftKey && this._features.multiSort })
                : undefined
        }, [el("span", { text: column.label })]);

        if (column.sortable) labelBtn.appendChild(this._sortIndicator(column));
        inner.appendChild(labelBtn);

        if (column.filterable) {
            const active = isActiveFilter(this._state.filters[column.key]);
            inner.appendChild(el("button", {
                type: "button",
                class: "k-dt-filter-btn" + (active ? " is-active" : ""),
                "data-fk": `filter:${column.key}`,
                "aria-haspopup": "dialog",
                "aria-expanded": String(this._overlay.openerKey === `filter:${column.key}`),
                title: active ? this._t.filterActive : this._t.filter,
                "aria-label": this._t.filterPanelTitle(column.label),
                onclick: (e) => this._openFilterPanel(column, e.currentTarget)
            }, [iconEl("list-filter")]));
        }

        if (this._isPinned(column)) inner.appendChild(this._unpinButton(column));

        th.appendChild(inner);

        this._items.set(th, { column, row: null, value: null });
        if (this._features.columnReorder) {
            bindColumnMove(th, {
                key: column.key,
                label: column.label,
                drag: this._drag,
                canDrag: () => !this._isMobile() && !window.matchMedia?.("(pointer: coarse)").matches,
                onStep: (step) => this._moveColumn(column.key, this._tableColumns().findIndex((c) => c.key === column.key) + step),
                onDrop: (key, after) => {
                    const keys = this._tableColumns().map((c) => c.key);
                    const point = keys.indexOf(column.key) + (after ? 1 : 0);
                    this._moveColumn(key, point > keys.indexOf(key) ? point - 1 : point);
                }
            });
        }
        return th;
    }

    /** @param {Column} column */
    _ariaSort(column) {
        const sort = this._state.sort.find((s) => s.key === column.key);
        return sort ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
    }

    // Sort icon, plus rank (visual) and priority (screen readers) for multi-sort.
    /** @param {Column} column */
    _sortIndicator(column) {
        const sortIndex = this._state.sort.findIndex((s) => s.key === column.key);
        const sort = sortIndex >= 0 ? this._state.sort[sortIndex] : null;
        const icon = sort ? (sort.direction === "asc" ? "arrow-up" : "arrow-down") : "arrow-up-down";
        const wrap = el("span", { class: "k-dt-sort-ind" }, [
            iconEl(icon, "k-dt-sort-ic" + (sort ? " is-active" : ""))
        ]);
        if (sort && this._state.sort.length > 1) {
            wrap.appendChild(el("span", { class: "k-dt-sort-rank", "aria-hidden": "true", text: String(sortIndex + 1) }));
            wrap.appendChild(el("span", { class: "k-dt-sr-only", text: this._t.sortPriority(sortIndex + 1) }));
        }
        return wrap;
    }

    // Shown in the header of pinned columns.
    /** @param {Column} column */
    _unpinButton(column) {
        return el("button", {
            type: "button",
            class: "k-dt-pin-btn",
            "data-fk": `pin:${column.key}`,
            title: this._t.unpinColumn,
            "aria-label": this._t.unpinColumnNamed(column.label),
            onclick: (event) => {
                // This button goes away: move focus to the column's header
                // button first, so it stays on the same element while the
                // column moves.
                /** @type {HTMLElement|null|undefined} */
                const headerButton = event.currentTarget.closest("th")?.querySelector("button.k-dt-th-label, .k-dt-filter-btn");
                headerButton?.focus();
                this._togglePin(column.key, false);
            }
        }, [iconEl("pin")]);
    }

    /**
     * @param {Row} row
     * @param {number} index
     * @param {Column[]} columns
     */
    _renderRow(row, index, columns) {
        const tr = el("tr", { class: "k-dt-tr" });
        if (typeof this._config.rowClass === "function") {
            const cls = this._config.rowClass(row, index);
            if (cls) tr.classList.add(...String(cls).split(/\s+/));
        }
        const compact = this._isCompact();
        // Compact layout: the whole row opens the details (see `_onClick`).
        if (compact || typeof this._config.onRowClick === "function") tr.classList.add("k-dt-clickable");
        this._items.set(tr, { row, index });
        columns.forEach((column, i) => tr.appendChild(this._pinCell(this._renderCell(column, row, index), i, columns)));
        if (compact) tr.appendChild(this._renderDetailsCell(row, index));
        return tr;
    }

    // Last cell of a compact row: the button that opens the record's details.
    /**
     * @param {Row} row
     * @param {number} index
     */
    _renderDetailsCell(row, index) {
        const td = el("td", { class: "k-dt-td k-dt-details-col", tabIndex: -1, "data-fk": `cell:${index}:#details` });
        const button = el("button", {
            type: "button",
            class: "k-dt-details-btn",
            "data-fk": `details:${index}`,
            "aria-haspopup": "dialog",
            "aria-expanded": "false",
            title: this._t.showDetails,
            "aria-label": this._t.showDetailsFor(this._recordTitle(row))
        }, [iconEl("maximize-2")]);
        td.appendChild(button);
        // Its context menu is the one of the row's first column.
        const column = this._tableColumns()[0];
        this._items.set(td, { column, row, value: getCellValue(row, column), index });
        return td;
    }

    /**
     * @param {Column} column
     * @param {Row} row
     * @param {number} index
     */
    _renderCell(column, row, index) {
        const value = getCellValue(row, column);
        const fk = `cell:${index}:${column.key}`;
        const td = el("td", { class: "k-dt-td k-dt-align-" + column.align, tabIndex: -1, "data-fk": fk });
        if (typeGroup(column.type) !== "text") td.classList.add("k-dt-nowrap");
        if (typeof column.cellClass === "function") {
            const cls = column.cellClass(value, row);
            if (cls) td.classList.add(...String(cls).split(/\s+/));
        }

        const content = el("div", { class: "k-dt-cell" }, [this._valueNode(column, row, value, fk)]);
        if (column.copyable) content.appendChild(this._copyButton(column, fk));
        td.appendChild(content);
        // Single-line cell with an ellipsis; the full text shows as a tooltip
        // (`_onPointerOver`) and while the cell has focus (CSS `:focus-within`).
        if ((column.overflow || this._config.cellOverflow) === "ellipsis") {
            td.classList.add("k-dt-truncate");
            if (column.maxWidth) td.style.setProperty("--k-dt-cell-max-width", column.maxWidth);
        }
        this._items.set(td, { column, row, value, index });
        return td;
    }

    // Builds the display node including link logic (href / SPA / custom handler).
    // `fk`: focus-key prefix of the containing cell/card (keeps focus across re-renders).
    /**
     * @param {Column} column
     * @param {Row} row
     * @param {any} value
     * @param {string|null} fk
     */
    _valueNode(column, row, value, fk) {
        const display = formatValue(value, column, this._config.locale, row);
        const content = display instanceof Node ? display : document.createTextNode(display);
        // An empty value gets no link or button: it would be a focus stop without a name.
        if (typeof display === "string" && !display.trim()) return el("span", { class: "k-dt-value" }, [content]);

        // Clicks are handled in `_onClick`.
        const link = column.link;
        if (link && (link.url || link.spa || typeof link.handler === "function")) {
            return el("a", { class: "k-dt-link", href: linkHref(link, row, value) || "#", "data-fk": fk ? `${fk}:link` : null }, [content]);
        }
        if (typeof column.action === "function") {
            return el("button", { type: "button", class: "k-dt-cell-action", "data-fk": fk ? `${fk}:action` : null }, [content]);
        }
        return el("span", { class: "k-dt-value" }, [content]);
    }

    // Copies the value of its cell or field (see `_onClick`).
    /**
     * @param {Column} column
     * @param {string|null} fk
     */
    _copyButton(column, fk) {
        return el("button", {
            type: "button",
            class: "k-dt-copy",
            "data-fk": fk ? `${fk}:copy` : null,
            title: this._t.copyValue,
            "aria-label": `${this._t.copyValue}: ${column.label}`
        }, [iconEl("copy")]);
    }

    _renderGrid() {
        const columns = this._visibleColumns();
        const grid = el("div", {
            class: "k-dt-grid",
            part: "grid",
            role: "list",
            "aria-labelledby": this._config.title ? this._hintId("title") : null
        });
        const min = (this._config.grid && this._config.grid.minWidth) || "240px";
        grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${min}, 1fr))`;

        if (this._pageData.length === 0) {
            grid.appendChild(el("div", { class: "k-dt-empty", text: this._emptyMessage() }));
            return grid;
        }

        const titleKey = this._config.grid && this._config.grid.titleColumn;
        this._pageData.forEach((row, index) => {
            const fk = `card:${index}`;
            const card = el("div", { class: "k-dt-card", part: "card", role: "listitem", tabIndex: -1, "data-fk": fk });
            if (typeof this._config.onRowClick === "function") card.classList.add("k-dt-clickable");
            const titleColumn = titleKey ? columns.find((c) => c.key === titleKey) : null;
            if (titleColumn) {
                const value = getCellValue(row, titleColumn);
                const title = el("div", { class: "k-dt-card-title" }, [
                    this._valueNode(titleColumn, row, value, `${fk}:${titleColumn.key}`)
                ]);
                this._items.set(title, { column: titleColumn, row, value });
                card.appendChild(title);
            }
            card.appendChild(this._renderFields(columns.filter((c) => c !== titleColumn), row, fk));
            // Its context menu is the one of the first column.
            this._items.set(card, { column: columns[0], row, value: getCellValue(row, columns[0]), index });
            grid.appendChild(card);
        });
        this._initRoving(grid, ".k-dt-card", (event, card) => this._onCardKey(event, card));
        grid.setAttribute("aria-describedby", this._hintId("grid"));
        // The hint sits next to the list (a list may only contain list items).
        const fragment = document.createDocumentFragment();
        fragment.append(grid, el("p", { id: this._hintId("grid"), class: "k-dt-sr-only", text: this._t.gridKeyboardHint }));
        return fragment;
    }

    // Label/value pairs of one record as a description list (cards, detail dialog).
    // `fk`: focus-key prefix, or null where focus keys are not needed.
    /**
     * @param {Column[]} columns
     * @param {Row} row
     * @param {string|null} fk
     */
    _renderFields(columns, row, fk) {
        const list = el("dl", { class: "k-dt-fields" });
        columns.forEach((column) => {
            const value = getCellValue(row, column);
            const key = fk ? `${fk}:${column.key}` : null;
            const val = el("dd", { class: "k-dt-pair-value k-dt-card-val" }, [this._valueNode(column, row, value, key)]);
            if (column.copyable) val.appendChild(this._copyButton(column, key));
            this._items.set(val, { column, row, value });
            list.appendChild(el("div", { class: "k-dt-pair k-dt-card-row" }, [
                el("dt", { class: "k-dt-pair-label k-dt-card-label", text: column.label }),
                val
            ]));
        });
        return list;
    }

    _renderFooter() {
        return buildFooter({
            t: this._t,
            page: this._state.page,
            pageCount: this._pageCount,
            pageSize: this._state.pageSize,
            pageSizeOptions: pageSizeChoices(this._pageSizeOptions, this._cellsPerRow(), this._state.pageSize),
            total: this._viewData.length,
            onPage: (page) => this._goToPage(page),
            onPageSize: (pageSize) => this._commit({ pageSize, page: 1 }, { announce: () => this._announcePage() })
        });
    }

    // ---- Partial refresh (the focused element stays the same) -------------

    // Replaces table body and footer only; of the toolbar only the filter
    // buttons (the search field stays).
    _refreshBody() {
        const root = this.shadow.querySelector(".k-dt");
        if (!root) { this._render(); return; }
        const focusKey = this._focusKey();

        root.querySelector(".k-dt-body")?.replaceWith(this._renderBody());
        this._refreshFilterButtons();
        this._refreshFooter();
        this._observeLayout();
        if (focusIsLost()) this._restoreFocus(focusKey);
    }

    // Sorting updates the existing table in place (header state + body + footer)
    // instead of a full re-render: the focused header button stays the same
    // element, so screen readers don't re-announce the whole table context.
    _refreshSort() {
        /** @type {HTMLTableElement|null} */
        const table = this.shadow.querySelector(".k-dt-table");
        if (!table?.tHead) { this._render(); return; }   // cards: no header to keep
        const focusKey = this._focusKey();
        const columns = this._tableColumns();
        for (const th of Array.from(table.tHead.rows[0].cells)) {
            const column = columns.find((c) => c.key === th.dataset.key);
            if (!column) continue;
            th.setAttribute("aria-sort", this._ariaSort(column));
            th.querySelector(".k-dt-sort-ind")?.replaceWith(this._sortIndicator(column));
        }
        table.tBodies[0].replaceWith(this._renderTbody(columns));
        this._refreshFooter();
        this._layoutPinned();
        if (focusIsLost()) this._restoreFocus(focusKey);
    }

    // Column changes (pin, show/hide) also update the existing table in place:
    // header cells are reused and reordered around the focused one (moving a
    // focused element would drop focus), so the table and the focused control
    // stay the same elements and screen readers don't re-announce the table.
    _refreshColumns() {
        this._syncColumnChooser();
        /** @type {HTMLTableElement|null} */
        const table = this.shadow.querySelector(".k-dt-table");
        if (!table?.tHead) { this._render(); return; }   // cards: rebuilt as a whole
        const focusKey = this._focusKey();
        const columns = this._tableColumns();
        const headRow = table.tHead.rows[0];
        /** @type {Map<string|undefined, HTMLTableCellElement>} */
        const existing = new Map(Array.from(headRow.cells).filter((th) => th.dataset.key).map((th) => [th.dataset.key, th]));
        const cells = columns.map((column, i) => {
            const th = existing.get(column.key) || this._renderHeaderCell(column);
            existing.delete(column.key);
            this._setHeaderPin(th, column, i, columns);
            return th;
        });
        /** @type {HTMLTableCellElement|null} */
        const detailsTh = headRow.querySelector(".k-dt-details-col");
        if (detailsTh) cells.push(detailsTh);
        existing.forEach((th) => th.remove());

        const active = deepActiveElement();
        const anchor = cells.find((th) => th.contains(active));
        const at = anchor ? cells.indexOf(anchor) : -1;
        cells.forEach((th, i) => {
            if (i < at) headRow.insertBefore(th, anchor ?? null);
            else if (i > at) headRow.appendChild(th);
        });

        table.tBodies[0].replaceWith(this._renderTbody(columns));
        // The column count decides the page sizes offered (and may force pagination).
        this._refreshFooter();
        this._layoutPinned();
        if (focusIsLost()) this._restoreFocus(focusKey);
    }

    // Replaces, adds or removes the footer.
    _refreshFooter() {
        const root = this.shadow.querySelector(".k-dt");
        const footer = root?.querySelector(".k-dt-footer");
        if (!this._paginated()) footer?.remove();
        else if (footer) footer.replaceWith(this._renderFooter());
        else root?.appendChild(this._renderFooter());
    }

    // Brings a reused header cell's pinned state (sticky offset, unpin button) up to date.
    /**
     * @param {HTMLTableCellElement} th
     * @param {Column} column
     * @param {number} index
     * @param {Column[]} columns
     */
    _setHeaderPin(th, column, index, columns) {
        th.classList.remove("k-dt-pinned", "k-dt-pinned-last");
        th.style.removeProperty("--k-dt-pin-left");
        this._pinCell(th, index, columns);
        const button = th.querySelector(".k-dt-pin-btn");
        if (this._isPinned(column)) {
            if (!button) th.querySelector(".k-dt-th-inner")?.appendChild(this._unpinButton(column));
        } else {
            button?.remove();
        }
    }

    // ---- Pinned columns & scroll shadows ----------------------------------

    // Lays out pinned columns now and again whenever the body or table resizes.
    _observeLayout() {
        this._layoutPinned();
        if (typeof ResizeObserver !== "function") return;
        this._resizeObserver ??= new ResizeObserver(() => this._layoutPinned());
        this._resizeObserver.disconnect();
        const body = this.shadow.querySelector(".k-dt-body");
        const table = this.shadow.querySelector(".k-dt-table");
        if (body) this._resizeObserver.observe(body);
        if (table) this._resizeObserver.observe(table);
    }

    // Pinned columns that don't fit are paused (see ui/pinnedLayout.js).
    _layoutPinned() {
        /** @type {HTMLElement|null} */
        const viewport = this.shadow.querySelector(".k-dt-viewport");
        this._pausedPins = viewport ? layoutPinned(viewport) : [];
    }

    // Marks the cell at `index` as pinned (sticky offset + last-pinned edge).
    /**
     * @template {HTMLTableCellElement} T
     * @param {T} cell
     * @param {number} index
     * @param {Column[]} columns
     * @returns {T}
     */
    _pinCell(cell, index, columns) {
        if (!this._isPinned(columns[index])) return cell;
        cell.classList.add("k-dt-pinned");
        cell.style.setProperty("--k-dt-pin-left", `var(--k-dt-pin-${index})`);
        if (!this._isPinned(columns[index + 1])) cell.classList.add("k-dt-pinned-last");
        return cell;
    }

    /**
     * @param {string} key
     * @param {boolean} pinned
     */
    _togglePin(key, pinned) {
        const pinnedColumns = this._state.pinnedColumns.filter((k) => k !== key);
        if (pinned) pinnedColumns.push(key);
        /** @param {string} k */
        const labelOf = (k) => this._columns.find((c) => c.key === k)?.label ?? k;
        const label = labelOf(key);
        this._commit({ pinnedColumns }, {
            update: "columns",
            announce: () => {
                // The chooser's toggle button announces its own state; everything else needs a message.
                if (pinned && this._pausedPins.length) this._announce(this._t.pinsPaused(label, this._pausedPins.map(labelOf).join(", ")));
                else if (!this._overlay.isOpen()) this._announce(pinned ? this._t.columnPinned(label) : this._t.columnUnpinned(label));
            }
        });
    }

    // ---- Sorting & paging -------------------------------------------------

    /**
     * @param {string} key
     * @param {{ additive?: boolean }} options
     */
    _applySort(key, options) {
        this._setSort(toggleSort(this._state.sort, key, options));
    }

    /**
     * @param {string} key
     * @param {SortSpec["direction"]|null} direction
     */
    _setSortDirection(key, direction, additive = false) {
        const rest = additive ? this._state.sort.filter((s) => s.key !== key) : [];
        this._setSort(direction ? [...rest, { key, direction }] : rest);
    }

    /** @param {SortSpec[]} sort */
    _setSort(sort) {
        this._commit({ sort, page: 1 }, { update: "sort", announce: () => this._announceSort() });
    }

    /** @param {number} page */
    _goToPage(page) {
        this._commit({ page: clamp(page, 1, this._pageCount) }, { announce: () => this._announcePage() });
    }

    // ---- Focus & keyboard -------------------------------------------------

    // Interactive elements carry a stable `data-fk` key, so focus survives the
    // re-render that follows most interactions (sort, filter, page, …).
    /** @returns {string|null} */
    _focusKey() {
        const active = deepActiveElement();
        if (!active || active.getRootNode() !== this.shadow) return null;
        /** @type {HTMLElement|null} */
        const keyed = active.closest("[data-fk]");
        return keyed?.dataset.fk ?? null;
    }

    // Focuses the element with `key`. Fallbacks: the enclosing item
    // ("cell:3:name:link" → "cell:3:name"), the current page for pager keys,
    // any element of the same kind (a removed header → first header), and
    // finally the body's roving tab stop.
    /** @param {string|null|undefined} key */
    _restoreFocus(key) {
        if (!key) return false;
        /** @param {HTMLElement & { disabled?: boolean }} node */
        const usable = (node) => node.isConnected && !node.disabled && node.getClientRects().length > 0;
        /** @param {string} selector */
        const find = (selector) => Array.from(/** @type {NodeListOf<HTMLElement>} */ (this.shadow.querySelectorAll(selector))).find(usable);
        const parts = key.split(":");
        /** @type {HTMLElement|undefined} */
        let target;
        for (let n = parts.length; n >= 2 && !target; n -= 1) {
            target = find(`[data-fk="${CSS.escape(parts.slice(0, n).join(":"))}"]`);
        }
        target = target
            || find(`[data-fk="${CSS.escape(key)}"]`)
            || (parts[0] === "page" && find('.k-dt-pager [aria-current="page"]'))
            || find(`[data-fk^="${CSS.escape(parts[0])}:"]`)
            || find('.k-dt-body [tabindex="0"]');
        if (!target) return false;
        target.focus();
        return true;
    }

    /** @param {string} kind */
    _hintId(kind) {
        return `${this._instanceId}-${kind}-hint`;
    }

    // Roving tabindex (see ui/keyboard.js); the last focused item is
    // remembered across re-renders.
    /**
     * @param {HTMLElement} container
     * @param {string} selector
     * @param {(event: KeyboardEvent, item: HTMLElement) => void} onKey
     */
    _initRoving(container, selector, onKey) {
        initRoving(container, selector, {
            rememberedKey: this._rovingKey,
            onFocus: (key) => { this._rovingKey = key; },
            onKey
        });
    }

    /**
     * @param {KeyboardEvent} event
     * @param {HTMLTableCellElement} cell
     */
    _onCellKey(event, cell) {
        if (event.key === "Enter") {
            // Activate the cell's link/action/details button, else the row's click.
            /** @type {HTMLElement|null} */
            const inner = cell.querySelector(".k-dt-link, .k-dt-cell-action, .k-dt-details-btn");
            if (inner) inner.click();
            else if (this._isCompact() || this._config.onCellClick || this._config.onRowClick) cell.click();
            else return;
            event.preventDefault();
            return;
        }
        const target = tableCellTarget(event, cell);
        if (!target) return;
        event.preventDefault();
        target.focus();
    }

    /**
     * @param {KeyboardEvent} event
     * @param {HTMLElement} card
     */
    _onCardKey(event, card) {
        if (event.key === "Enter") {
            if (!this._config.onRowClick) return;
            event.preventDefault();
            card.click();
            return;
        }
        /** @type {HTMLElement[]} */
        const cards = Array.from(card.parentElement?.querySelectorAll(".k-dt-card") ?? []);
        const target = listItemTarget(event, card, cards);
        if (!target) return;
        event.preventDefault();
        target.focus();
    }

    // Polite screen-reader announcement (status messages, WCAG 4.1.3).
    /** @param {string|undefined} message */
    _announce(message) {
        this._announcer.announce(message);
    }

    _announceResults() {
        const total = this._viewData.length;
        this._announce(total === 0 ? this._config.noResultsText : this._t.resultsCount(total));
    }

    _announcePage() {
        const { start, end, total } = pageRange(this._state.page, this._state.pageSize, this._viewData.length);
        this._announce(this._t.pageInfo(start, end, total));
    }

    _announceSort() {
        const parts = this._state.sort.map((spec) => {
            const column = this._columns.find((c) => c.key === spec.key);
            return `${column?.label ?? spec.key} ${spec.direction === "asc" ? this._t.ascending : this._t.descending}`;
        });
        this._announce(parts.length ? this._t.sortedBy(parts.join(", ")) : this._t.sortCleared);
    }

    // ---- Delegated events -------------------------------------------------

    // Rows, cells, cards and headers get no listeners of their own (thousands
    // on a large page): handlers on the shadow root find the element and its
    // record in `_items`. Panels live in the same shadow root, so their
    // fields (record details) are handled here too.
    _listen() {
        const root = this.shadow;
        root.addEventListener("click", (event) => this._onClick(/** @type {MouseEvent} */ (event)));
        root.addEventListener("contextmenu", (event) => this._onContextMenu(/** @type {MouseEvent} */ (event)));
        root.addEventListener("keydown", (event) => this._onContextKey(/** @type {KeyboardEvent} */ (event)));
        root.addEventListener("pointerdown", (event) => this._onPointerDown(/** @type {PointerEvent} */ (event)));
        root.addEventListener("pointerover", (event) => this._onPointerOver(/** @type {PointerEvent} */ (event)));
        // Clicking a copy button must not move focus into the cell: screen
        // readers would read the whole table context instead of the message.
        root.addEventListener("mousedown", (event) => {
            if (/** @type {Element|null} */ (event.target)?.closest?.(".k-dt-copy")) event.preventDefault();
        });
    }

    // The closest element matching `selector` that has a record, or null.
    /**
     * @param {EventTarget|null} node
     * @param {string} selector
     * @returns {HTMLElement|null}
     */
    _host(node, selector) {
        const host = /** @type {HTMLElement|null} */ (node instanceof Element ? node.closest(selector) : null);
        return host && this._items.has(host) ? host : null;
    }

    // The record of a cell, card, header or field that `_host()` found.
    /**
     * @param {Element} host
     * @returns {ItemRecord}
     */
    _record(host) {
        return /** @type {ItemRecord} */ (this._items.get(host));
    }

    // Controls inside a value first (copy and action stop there; a link goes
    // on to the cell and row), then the cell, then the row or card.
    /** @param {MouseEvent} event */
    _onClick(event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const suppressed = this._shouldSuppressClick();
        /** @type {HTMLElement|null} */
        const control = target.closest(VALUE_CONTROLS);
        const valueHost = control && this._host(control, VALUE_HOSTS);
        if (valueHost) {
            const { column, row, value } = this._record(valueHost);
            if (control.matches(".k-dt-copy")) {
                const text = toText(value, column, this._config.locale, row);
                this._copyText(neutralizeFormula(text), control, text);
                return;
            }
            if (!row) return;
            if (control.matches(".k-dt-details-btn")) {
                this._openDetails(row, { anchor: control });
                return;
            }
            if (suppressed) { event.preventDefault(); return; }
            if (control.matches(".k-dt-cell-action")) {
                column.action?.(row, value, event);
                return;
            }
            this._followLink(event, column, row, value);
        }
        if (suppressed) return;

        const cell = this._host(target, "td.k-dt-td");
        if (cell && typeof this._config.onCellClick === "function" && !this._isCompact()) {
            const { column, row, value } = this._record(cell);
            this._config.onCellClick(value, /** @type {Row} */ (row), column);
        }
        const record = this._host(target, "tr.k-dt-tr, .k-dt-card");
        if (!record) return;
        const { row, index } = /** @type {RowRecord} */ (this._items.get(record));
        if (record.matches("tr") && this._isCompact()) {
            // Compact layout: the whole row opens the details (links and buttons
            // inside keep their own action); onRowClick moves into the dialog.
            if (!target.closest("a, button")) this._openDetails(row);
        } else if (typeof this._config.onRowClick === "function") {
            this._config.onRowClick(row, index);
        }
    }

    // Links: a custom handler or SPA routing replace the browser navigation.
    /**
     * @param {MouseEvent} event
     * @param {Column} column
     * @param {Row} row
     * @param {any} value
     */
    _followLink(event, column, row, value) {
        const link = column.link;
        if (!link) return;
        if (typeof link.handler === "function") {
            event.preventDefault();
            link.handler(row, value, event);
        } else if (link.spa) {
            event.preventDefault();
            this._emit("navigate", { href: linkHref(link, row, value), row, column, value });
        }
    }

    // Truncated cells show the full text as a tooltip, only when it is cut off.
    /** @param {PointerEvent} event */
    _onPointerOver(event) {
        const td = /** @type {Element|null} */ (event.target)?.closest?.("td.k-dt-truncate");
        if (!td || td.contains(/** @type {Node|null} */ (event.relatedTarget)) || !this._items.has(td)) return;
        /** @type {HTMLElement|null} */
        const node = td.querySelector(".k-dt-cell > :first-child");
        if (!node) return;
        const { column, row, value } = this._record(td);
        if (node.scrollWidth > node.clientWidth) node.title = toText(value, column, this._config.locale, row);
        else node.removeAttribute("title");
    }

    // ---- Context menu -----------------------------------------------------

    // Right-click (desktop). The browser's own menu is suppressed anywhere in
    // the table so only ours shows; form fields keep it (paste, spell-check, …),
    // and so do panels.
    /** @param {MouseEvent} event */
    _onContextMenu(event) {
        if (!this._features.contextMenu || !/** @type {Element|null} */ (event.target)?.closest?.(".k-dt")) return;
        if (/** @type {Element|undefined} */ (event.composedPath()[0])?.matches?.("input, textarea, select")) return;
        event.preventDefault();
        const host = this._host(event.target, MENU_HOSTS);
        if (!host) return;
        this._cancelLongPress();
        // A long-press already opened the menu; don't reopen on the native
        // contextmenu event that follows the same gesture.
        if (Date.now() < this._suppressContextUntil) return;
        this._openContextMenuAt(host, event);
    }

    // Keyboard: Shift+F10 or the context-menu key on a focused cell, card or
    // header control. Browsers may follow up with a native `contextmenu`
    // event, which is suppressed.
    /** @param {KeyboardEvent} event */
    _onContextKey(event) {
        if (!this._features.contextMenu) return;
        if (!(event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))) return;
        const target = /** @type {Element|undefined} */ (event.composedPath()[0]);
        if (target?.matches?.("input, textarea, select")) return;
        const host = this._host(event.target, MENU_HOSTS);
        if (!host) return;
        event.preventDefault();
        event.stopPropagation();
        this._suppressContextUntil = Date.now() + 500;
        const rect = (target instanceof Element ? target : host).getBoundingClientRect();
        this._openContextMenuAt(host, { clientX: rect.left + 4, clientY: rect.bottom, target: host });
    }

    // Touch: a long-press opens the context menu.
    /** @param {PointerEvent} event */
    _onPointerDown(event) {
        if (!this._features.contextMenu || event.pointerType !== "touch") return;
        const host = this._host(event.target, MENU_HOSTS);
        if (!host) return;
        this._cancelLongPress();
        this._longPress = waitForLongPress(host, event, (clientX, clientY) => {
            this._longPress = null;
            // Swallow the click and the native contextmenu that follow the
            // long-press release.
            this._suppressClickUntil = Date.now() + 700;
            this._suppressContextUntil = Date.now() + 700;
            this._openContextMenuAt(host, { clientX, clientY, target: host });
        });
    }

    _cancelLongPress() {
        this._longPress?.();
        this._longPress = null;
    }

    // `point`: { clientX, clientY } — where to open. `host` is the anchor for
    // a filter panel opened from the menu (not the event's target: once a
    // native event is dispatched, its target inside a shadow root is null).
    /**
     * @param {HTMLElement} host
     * @param {{ clientX: number, clientY: number, target?: unknown }} point
     */
    _openContextMenuAt(host, point) {
        const { column, row, value } = this._record(host);
        this._openContextMenu({ clientX: point.clientX, clientY: point.clientY, target: host }, column, row, value);
    }

    // True briefly after a long-press so the synthetic click does not also
    // trigger row/cell/link handlers. Non-consuming so every nested handler in
    // the same click sees it.
    _shouldSuppressClick() {
        return !!this._suppressClickUntil && Date.now() < this._suppressClickUntil;
    }

    /**
     * @param {MenuPoint} event
     * @param {Column} column
     * @param {Row|null} row
     * @param {any} value
     */
    _openContextMenu(event, column, row, value) {
        /** @type {MenuItem[]} */
        const items = [];
        // Where focus returns after the menu (or a panel opened from it) closes.
        const returnKey = this._focusKey();
        const group = typeGroup(column.type);

        if (row && this._detailsEnabled()) {
            items.push({ label: this._t.showDetails, icon: "maximize-2", onSelect: () => this._openDetails(row, { returnKey }) });
            items.push({ separator: true });
        }

        if (column.sortable) {
            items.push({ label: this._t.sortAsc, icon: "arrow-up", onSelect: () => this._setSortDirection(column.key, "asc") });
            items.push({ label: this._t.sortDesc, icon: "arrow-down", onSelect: () => this._setSortDirection(column.key, "desc") });
            if (this._features.multiSort) {
                items.push({ label: this._t.addSortKey, icon: "arrow-up-down", onSelect: () => this._setSortDirection(column.key, "asc", true) });
            }
            if (this._state.sort.some((s) => s.key === column.key)) {
                items.push({ label: this._t.removeSortKey, icon: "x", onSelect: () => this._setSortDirection(column.key, null, true) });
            }
            items.push({ separator: true });
        }

        if (column.filterable) {
            if (row) {
                const label = toText(value, column, this._config.locale, row);
                items.push({
                    label: this._t.filterByValue(truncate(label)),
                    icon: "list-filter",
                    onSelect: () => this._setFilter(column.key, { kind: "value", values: [value] })
                });
                if (group === "text" || group === "number") {
                    items.push({
                        label: this._t.excludeValue(truncate(label)),
                        icon: "x",
                        // Numbers compare the raw value; text compares the displayed text.
                        onSelect: () => this._setFilter(column.key, {
                            kind: "pattern", operator: "notEquals", operand: group === "number" ? value : label, arity: 1
                        })
                    });
                }
            }
            items.push({ label: this._t.openFilter, icon: "list-filter", onSelect: () => this._openFilterPanel(column, event.target, returnKey) });
            if (isActiveFilter(this._state.filters[column.key])) {
                items.push({ label: this._t.clearColumnFilter, icon: "x", onSelect: () => this._setFilter(column.key, null) });
            }
            items.push({ separator: true });
        }

        if (row) {
            items.push({ label: this._t.copyCell, icon: "copy", onSelect: () => {
                const text = toText(value, column, this._config.locale, row);
                this._copyText(neutralizeFormula(text), null, text);
            } });
            items.push({ label: this._t.copyRow, icon: "copy", onSelect: () => this._copyRow(row) });
        }
        items.push({ label: this._t.copyColumn, icon: "copy", onSelect: () => this._copyColumn(column) });

        if (this._features.columnVisibility || this._features.columnPinning || this._features.columnReorder) items.push({ separator: true });
        if (this._features.columnReorder) items.push(...this._moveMenuItems(column));
        if (this._features.columnPinning) {
            items.push(this._isPinned(column)
                ? { label: this._t.unpinColumn, icon: "pin-off", onSelect: () => this._togglePin(column.key, false) }
                : { label: this._t.pinColumn, icon: "pin", onSelect: () => this._togglePin(column.key, true) });
        }
        if (this._features.columnVisibility) {
            items.push({ label: this._t.hideColumn, icon: "eye-off", onSelect: () => this._toggleColumn(column.key, false) });
        }

        if (this._features.export) {
            items.push({ separator: true });
            items.push({ label: this._t.exportMenu, icon: "download", onSelect: () => this._openExportDialog(null, returnKey) });
        }

        openContextMenu(this.shadow, {
            x: event.clientX,
            y: event.clientY,
            items,
            label: this._t.actionsFor(column.label),
            sheet: this._isMobile(),
            restoreFocus: () => this._restoreFocus(returnKey)
        });
    }

    // ---- Filter panel -----------------------------------------------------

    // `onDone()`: called instead of closing after Apply/Reset and on Escape
    // (the filter summary uses it to come back).
    /**
     * @param {Column} column
     * @param {HTMLElement|null} anchor
     * @param {string|null} [returnKey]
     * @param {{ onDone?: (() => void)|null }} [options]
     */
    _openFilterPanel(column, anchor, returnKey, { onDone = null } = {}) {
        closeContextMenu();
        const panel = buildFilterPanel({
            t: this._t,
            column,
            filter: this._state.filters[column.key] || null,
            values: distinctValues(this._sourceData, column, this._config.locale),
            onApply: (filter) => {
                this._setFilter(column.key, filter);
                if (onDone) onDone();
                else this._closeOverlay();
            }
        });
        this._showOverlay(panel, anchor, returnKey, { onEscape: onDone });
    }

    // ---- Filter summary ---------------------------------------------------

    // The active filters for the summary: the global search first, then the
    // column filters in display order. `id`: "search" or "column:<key>".
    _filterEntries() {
        const t = this._t;
        /** @type {{ id: string, label: string, value: string }[]} */
        const entries = [];
        if (this._features.globalSearch && this._state.globalSearch) {
            entries.push({ id: "search", label: t.searchFilter, value: t.quoted(this._state.globalSearch) });
        }
        for (const column of this._orderedColumns()) {
            const filter = this._state.filters[column.key];
            if (!filter || !isActiveFilter(filter)) continue;
            entries.push({
                id: `column:${column.key}`,
                label: column.label,
                value: describeFilter(filter, column, { t, locale: this._config.locale })
            });
        }
        return entries;
    }

    // `focusId`: the entry to focus (coming back from its filter panel).
    /**
     * @param {HTMLElement|null} anchor
     * @param {string|null} [focusId]
     */
    _openFilterSummary(anchor, focusId = null) {
        const summary = buildFilterSummary({
            t: this._t,
            entries: () => this._filterEntries(),
            focusId,
            onEdit: (id) => this._editFilterEntry(id),
            onRemove: (id) => {
                const entries = this._filterEntries();
                const index = entries.findIndex((e) => e.id === id);
                // The last one: the summary goes, its toolbar button too.
                if (entries.length === 1) this._closeOverlay();
                this._removeFilterEntry(id);
                if (entries.length > 1) summary.refresh(index);
            },
            onClearAll: () => {
                this._closeOverlay();
                this.clearFilters();
            },
            onClose: () => this._closeOverlay()
        });
        this._showOverlay(summary.panel, anchor, "tb:filters");
    }

    // The search entry goes to the search field; a column entry opens that
    // column's filter panel, which comes back to the summary when done.
    /** @param {string} id */
    _editFilterEntry(id) {
        if (id === "search") {
            this._closeOverlay({ restoreFocus: false });
            this._restoreFocus("search");
            return;
        }
        const column = this._columns.find((c) => `column:${c.key}` === id);
        if (!column) return;
        /** @returns {HTMLElement|null} */
        const toolbarButton = () => this.shadow.querySelector('[data-fk="tb:filters"]');
        this._openFilterPanel(column, toolbarButton(), "tb:filters", {
            onDone: () => {
                if (!this._filterEntries().length) { this._closeOverlay(); return; }
                // Without restoring focus: it goes straight into the summary.
                this._closeOverlay({ restoreFocus: false });
                this._openFilterSummary(toolbarButton(), id);
            }
        });
    }

    /** @param {string} id */
    _removeFilterEntry(id) {
        if (id === "search") {
            this._debouncedSearch.cancel();
            this._commit({ globalSearch: "", page: 1 }, { announce: () => this._announceResults() });
        } else {
            this._setFilter(id.slice("column:".length), null);
        }
    }

    // `filter`: the column's new filter, or null to remove it.
    /**
     * @param {string} key
     * @param {Filter|null} filter
     */
    _setFilter(key, filter) {
        const filters = { ...this._state.filters };
        if (filter) filters[key] = filter;
        else delete filters[key];
        this._commit({ filters, page: 1 }, { announce: () => this._announceResults() });
    }

    // ---- Column order -----------------------------------------------------

    // Moves column `key` to index `target` among the columns shown in the table
    // (`all`: among all columns incl. hidden ones, as listed in the column
    // chooser). Pinned columns form a block at the front: a column moved into
    // it gets pinned, a pinned one moved out of it gets unpinned; right at the
    // boundary it keeps its state.
    /**
     * @param {string} key
     * @param {number} target
     */
    _moveColumn(key, target, { all = false } = {}) {
        const scope = () => (all ? this._orderedColumns() : this._tableColumns());
        const moved = moveColumn(this._state, scope().map((c) => c.key), key, target, { pinning: this._features.columnPinning });
        if (!moved) return;
        const { pinned, wasPinned, pinnedColumns, columnOrder } = moved;
        const column = this._columns.find((c) => c.key === key);
        this._commit({ pinnedColumns, columnOrder }, {
            update: "columns",
            announce: () => {
                const list = scope();
                const position = list.findIndex((c) => c.key === key) + 1;
                const message = pinned === wasPinned ? this._t.columnMoved
                    : pinned ? this._t.columnMovedPinned : this._t.columnMovedUnpinned;
                this._announce(message(column?.label ?? key, position, list.length));
            }
        });
    }

    /**
     * @param {Column} column
     * @returns {MenuItem[]}
     */
    _moveMenuItems(column) {
        const keys = this._tableColumns().map((c) => c.key);
        const i = keys.indexOf(column.key);
        /** @type {MenuItem[]} */
        const items = [];
        if (i > 0) {
            items.push({ label: this._t.moveLeft, icon: "arrow-left", onSelect: () => this._moveColumn(column.key, i - 1) });
            items.push({ label: this._t.moveToStart, icon: "arrow-left-to-line", onSelect: () => this._moveColumn(column.key, 0) });
        }
        if (i >= 0 && i < keys.length - 1) {
            items.push({ label: this._t.moveRight, icon: "arrow-right", onSelect: () => this._moveColumn(column.key, i + 1) });
            items.push({ label: this._t.moveToEnd, icon: "arrow-right-to-line", onSelect: () => this._moveColumn(column.key, keys.length - 1) });
        }
        if (this._orderChanged()) items.push({ label: this._t.resetColumnOrder, onSelect: () => this._resetColumnOrder() });
        return items;
    }

    _resetColumnOrder() {
        this._commit({ columnOrder: normalizeOrder(undefined, this._columns.map((c) => c.key)) }, {
            update: "columns",
            announce: () => this._announce(this._t.columnOrderReset)
        });
    }

    // ---- Record details ---------------------------------------------------

    _detailsEnabled() {
        return !!(this._features.rowDetails || this._features.compact);
    }

    // All columns of a record: visible ones in display order, then hidden ones.
    _detailColumns() {
        const visible = this._visibleColumns();
        return [...visible, ...this._columns.filter((c) => !visible.includes(c))];
    }

    // Short name of a record: the card title column, else the first visible column.
    /** @param {Row} row */
    _recordTitle(row) {
        const key = this._config.grid?.titleColumn;
        const column = (key && this._columns.find((c) => c.key === key)) || this._visibleColumns()[0];
        return column ? toText(getCellValue(row, column), column, this._config.locale, row) : "";
    }

    // Modal dialog with every field of `row` (see panels/detailsDialog.js).
    // The table follows previous/next along, so focus returns to the right
    // row when the dialog closes.
    /**
     * @param {Row} row
     * @param {{ returnKey?: string|null, anchor?: HTMLElement|null }} [options]
     */
    _openDetails(row, { returnKey = this._focusKey(), anchor = null } = {}) {
        closeContextMenu();
        const index = this._viewData.indexOf(row);
        if (index < 0) return;
        const onRowClick = this._config.onRowClick;
        const panel = buildDetailsDialog({
            t: this._t,
            rows: () => this._viewData,
            index,
            title: (record) => this._recordTitle(record),
            fields: (record) => this._renderFields(this._detailColumns(), record, null),
            onNavigate: (record, message) => {
                this._followDetails(record);
                this._announce(message);
            },
            onOpen: typeof onRowClick === "function" ? (record) => {
                const pageIndex = this._pageData.indexOf(record);
                this._closeOverlay();
                onRowClick(record, pageIndex);
            } : null,
            onClose: () => this._closeOverlay()
        });
        this._showOverlay(panel, anchor, returnKey, { centered: true });
    }

    // Shows the page that contains `record` and points the dialog's focus
    // return at that record's row/card.
    /** @param {Row} record */
    _followDetails(record) {
        if (this._paginated()) {
            const page = Math.floor(this._viewData.indexOf(record) / this._state.pageSize) + 1;
            if (page !== this._state.page) this._commit({ page }, { update: "body" });
        }
        const pageIndex = this._pageData.indexOf(record);
        /**
         * @template {string|null|undefined} K
         * @param {K} key
         * @returns {K}
         */
        const retarget = (key) => /** @type {K} */ (key?.replace(/^(cell|card|details):\d+/, (_, kind) => `${kind}:${pageIndex}`));
        this._overlay.returnKey = retarget(this._overlay.returnKey);
        this._rovingKey = retarget(this._rovingKey);
    }

    // ---- Column visibility ------------------------------------------------

    /** @param {HTMLElement|null} anchor */
    _openColumnChooser(anchor) {
        this._chooser = buildColumnChooser({
            t: this._t,
            columns: () => this._orderedColumns(),
            isHidden: (column) => this._state.hiddenColumns.has(column.key),
            isPinned: (column) => this._isPinned(column),
            pinning: this._features.columnPinning,
            reorder: this._features.columnReorder,
            onToggle: (key, visible) => this._toggleColumn(key, visible),
            onPin: (key, pinned) => this._togglePin(key, pinned),
            onMove: (key, step) => {
                const index = this._orderedColumns().findIndex((c) => c.key === key);
                this._moveColumn(key, index + step, { all: true });
            }
        });
        this._showOverlay(this._chooser.panel, anchor);
        this._syncColumnChooser();
    }

    // Brings an open column chooser in line with the current order and pins.
    _syncColumnChooser() {
        this._chooser?.sync();
    }

    /**
     * @param {string} key
     * @param {boolean} visible
     */
    _toggleColumn(key, visible) {
        const hiddenColumns = new Set(this._state.hiddenColumns);
        if (visible) hiddenColumns.delete(key);
        else hiddenColumns.add(key);
        this._commit({ hiddenColumns }, {
            update: "columns",
            announce: () => {
                // The chooser's checkbox announces itself; the context menu needs a message.
                if (visible || this._overlay.isOpen()) return;
                const column = this._columns.find((c) => c.key === key);
                this._announce(this._t.columnHidden(column?.label ?? key));
            }
        });
    }

    // ---- Saved views panel ------------------------------------------------

    _requireViewStore() {
        if (!this._viewStore) throw new Error("Saved views are off (features.savedViews)");
        return this._viewStore;
    }

    _viewState() {
        return serializeState(this._state, { includePage: false });
    }

    _viewSignature() {
        return viewSignature(this._viewState());
    }

    /** @param {HTMLElement|null} anchor */
    _openViewsPanel(anchor) {
        const { panel, refresh } = buildViewsPanel({
            t: this._t,
            views: {
                list: () => this.listViews(),
                save: (name) => this.saveView(name),
                load: (name) => this.loadView(name),
                rename: (oldName, newName) => this.renameView(oldName, newName),
                remove: (name) => this.deleteView(name),
                active: () => this.getActiveView()
            },
            announce: (message) => this._announce(message),
            close: () => this._closeOverlay()
        });
        this._showOverlay(panel, anchor);
        refresh();
    }

    // ---- Export dialog ----------------------------------------------------

    /** @returns {ExportOptions} */
    _exportDefaults() {
        return { ...EXPORT_DEFAULTS, ...(this._config.exportDefaults || {}) };
    }

    // Rows in display order; "page" without pagination is the same as "filtered".
    /** @param {ExportOptions["scope"]} scope */
    _exportRows(scope) {
        if (scope === "page" && this._paginated()) return this._pageData;
        if (scope === "all") return sortData(this._sourceData, this._state.sort, this._columns, this._config.locale);
        return this._viewData;
    }

    _exportBaseName() {
        return this._config.exportFilename || this._config.title || "export";
    }

    /**
     * @param {HTMLElement|null} anchor
     * @param {string|null} [returnKey]
     */
    _openExportDialog(anchor, returnKey = this._focusKey()) {
        const t = this._t;
        /** @type {[ExportOptions["scope"], string, number][]} */
        const scopes = [
            ["filtered", t.exportScopeFiltered, this._viewData.length],
            ["all", t.exportScopeAll, this._sourceData.length]
        ];
        if (this._paginated()) scopes.unshift(["page", t.exportScopePage, this._pageData.length]);
        const panel = buildExportDialog({
            t,
            defaults: this._exportDefaults(),
            baseName: this._exportBaseName(),
            scopes,
            // "All columns" is only offered when some exportable column is hidden.
            hasHiddenColumns: exportColumns(this._orderedColumns()).length > exportColumns(this._visibleColumns()).length,
            onSubmit: (options) => {
                this._closeOverlay();
                this.exportData(options);
            },
            onCancel: () => this._closeOverlay()
        });
        this._showOverlay(panel, anchor, returnKey, { centered: true });
    }

    // ---- Overlay (Panels) -------------------------------------------------

    // Opens `panel` as a modal dialog (see ui/overlay.js); focus returns to
    // `returnKey` (default: the element focused now). `centered`: a dialog in
    // the middle of the screen instead of a popover at `anchor`.
    /**
     * @param {HTMLElement} panel
     * @param {HTMLElement|null} anchor
     * @param {string|null} [returnKey]
     * @param {{ centered?: boolean, onEscape?: (() => void)|null }} [options]
     */
    _showOverlay(panel, anchor, returnKey = this._focusKey(), { centered = false, onEscape = null } = {}) {
        this._overlay.show(panel, { anchor, returnKey, centered, onEscape, sheet: this._isMobile() });
    }

    /** @param {{ restoreFocus?: boolean }} [options] */
    _closeOverlay(options) {
        this._overlay.close(options);
    }

    // ---- Copy -------------------------------------------------------------

    // `button`: the copy button that was used, if any. `shownValue`: optional
    // value to include in the announcement; `message` replaces it altogether.
    /**
     * @param {string} text
     * @param {HTMLElement|null} [button]
     * @param {string|null} [shownValue]
     * @param {string} [message]
     */
    _copyText(text, button, shownValue, message) {
        // Decided at click time: a keyboard user has focus on the button.
        const buttonFocused = !!button && deepActiveElement() === button;
        writeClipboard(text).then(() => {
            message ??= shownValue ? this._t.copiedValue(truncate(shownValue, 60)) : this._t.copied;
            // Name + check icon stay until the button loses focus.
            if (buttonFocused && button?.isConnected) {
                confirmOnButton(button, message);
                return;
            }
            this._announce(message);
            if (button) flashCopied(button);
        });
    }

    // Copied text may be pasted into a spreadsheet, which would run cells
    // starting with "=", "+", … as formulas (see `neutralizeFormula`).
    /** @param {Row} row */
    _copyRow(row) {
        const text = this._visibleColumns()
            .map((column) => neutralizeFormula(toText(getCellValue(row, column), column, this._config.locale, row)))
            .join("\t");
        this._copyText(text);
    }

    /** @param {Column} column */
    _copyColumn(column) {
        const text = this._viewData
            .map((row) => neutralizeFormula(toText(getCellValue(row, column), column, this._config.locale, row)))
            .join("\n");
        this._copyText(text);
    }

    // ---- State serialization & events -------------------------------------

    // Returns false when a listener cancelled a `cancelable` event.
    /**
     * @param {string} name
     * @param {object} detail
     */
    _emit(name, detail, { cancelable = false } = {}) {
        return this.dispatchEvent(new CustomEvent("jw-datatable:" + name, { detail, bubbles: true, composed: true, cancelable }));
    }

    _emitChange() {
        this._emit("change", { state: serializeState(this._state) });
    }
}

if (!customElements.get("jw-datatable")) {
    customElements.define("jw-datatable", JwDataTable);
}

export { JwDataTable };
