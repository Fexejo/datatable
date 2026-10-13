// <jw-datatable> — configurable, reusable data table (Vanilla JS).
//
// Features: pagination, sorting (including multi-column), value and pattern filters,
// quick filters and actions via context menu, CSV/XLSX/JSON export, card and compact layouts,
// links (href / SPA routing / custom handlers), per-column copy buttons,
// runtime data updates, and saved views (localStorage or a custom adapter).
//
// The convenient public API lives in `datatable.js`. This file is the Web Component itself.

import { getTranslations } from "./core/i18n.js";
import {
    getCellValue,
    clamp,
    debounce,
    uid,
    typeGroup
} from "./core/util.js";
import { formatValue, toText } from "./core/formatters.js";
import { sortData, toggleSort } from "./core/comparators.js";
import { normalizeColumns } from "./core/columns.js";
import { pageItems, pageRange } from "./core/pagination.js";
import {
    createState,
    mergeState,
    serializeState,
    viewSignature,
    activeFilterCount,
    normalizeOrder,
    orderedColumns,
    moveColumn,
    deriveRows
} from "./core/state.js";
import {
    distinctValues,
    isActiveFilter
} from "./core/filtering.js";
import {
    EXPORT_DEFAULTS,
    EXPORT_FORMATS,
    buildExport,
    exportColumns,
    defaultNames,
    defaultFilename,
    withExtension,
    downloadFile,
    neutralizeFormula
} from "./export/export.js";
import { openContextMenu, closeContextMenu } from "./ui/contextMenu.js";
import { el, iconEl, deepActiveElement, focusIsLost, truncate } from "./ui/dom.js";
import { Announcer, getAnnouncer } from "./ui/announcer.js";
import { Overlay } from "./ui/overlay.js";
import { writeClipboard, confirmOnButton, flashCopied } from "./ui/clipboard.js";
import { ViewStore, LocalStorageAdapter } from "./core/viewStore.js";
import { buildFilterPanel } from "./panels/filterPanel.js";
import { buildExportDialog } from "./panels/exportDialog.js";
import { buildColumnChooser } from "./panels/columnChooser.js";
import { buildDetailsDialog } from "./panels/detailsDialog.js";
import { buildViewsPanel } from "./panels/viewsPanel.js";
import { applyStyles } from "./ui/stylesheet.js";

// Saved view names are trimmed and must not be empty.
function viewName(name) {
    const result = String(name ?? "").trim();
    if (!result) throw new TypeError("A saved view needs a name");
    return result;
}

// Opt-in features default to `false` and must be enabled explicitly via
// `config.features`. Always-on basics (pagination, context menu, copy buttons)
// stay `true`. `multiSort` only takes effect when `sorting` is enabled.
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

// Pinned columns may cover at most this share of the visible width (the rest
// of the table must stay usable); beyond it, the oldest pins scroll along.
const MAX_PINNED_SHARE = 0.6;

class JwDataTable extends HTMLElement {
    constructor() {
        super();
        this.shadow = this.attachShadow({ mode: "open" });
        this._configured = false;
        this._sourceData = [];
        this._columns = [];
        this._state = null;
        this._viewData = [];
        this._pageData = [];
        this._viewStore = null;
        // { name, signature } of the saved view last saved or loaded.
        this._activeView = null;
        this._instanceId = uid("kdt");
        // Responsive / touch state
        this._mql = null;
        this._mqlHandler = null;
        this._mobileMatches = false;
        this._layoutUserSet = false;
        this._lpTimer = null;
        this._lpCleanup = null;
        this._suppressClickUntil = 0;
        this._suppressContextUntil = 0;
        this._resizeObserver = null;
        this._overlay = new Overlay(this.shadow, { restoreFocus: (key) => this._restoreFocus(key) });
        // While a modal panel is open, everything outside it is hidden from
        // assistive tech, so the panel's own live region is used.
        this._announcer = new Announcer(() => this._overlay.liveRegion() || getAnnouncer());
        // Rebuilds body/footer only, so the focused search field is preserved.
        this._debouncedSearch = debounce((value) => this._commit({ globalSearch: value, page: 1 }, {
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

    // ---- Public API ------------------------------------------------------

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
        this._pageSizeOptions = pagination.pageSizeOptions || [10, 25, 50, 100];

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

    // ---- Responsive (Mobile First) --------------------------------------

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

    // ---- Layouts: table, cards ("grid"), compact table + details -----------

    _availableLayouts() {
        return ["table", this._features.grid && "grid", this._features.compact && "compact"].filter(Boolean);
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

    set data(rows) {
        this.setData(rows);
    }

    get data() {
        return this._sourceData;
    }

    // Replace data at runtime; sort/filter state is preserved.
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

    getState() {
        return serializeState(this._state);
    }

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
    exportData(options = {}) {
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
            this._copyText(content, null, null, this._t.exportedClipboard(count));
        } else {
            downloadFile(content, filename, opts.format);
            this._announce(this._t.exported(count, filename));
        }
        return detail;
    }

    openExportDialog() {
        this._openExportDialog(this.shadow.querySelector('[data-fk="tb:export"]'));
    }

    // Saved views: the state without the current page, stored through the
    // adapter. The methods reject when the adapter fails (or the feature is
    // off); the `view*` events fire after success.

    async listViews() {
        return this._requireViewStore().list();
    }

    async saveView(name) {
        const store = this._requireViewStore();
        name = viewName(name);
        const state = this._viewState();
        await store.save(name, state);
        this._activeView = { name, signature: this._viewSignature() };
        this._emit("viewsave", { name, state });
    }

    // Resolves to false when there is no view with this name.
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

    // ---- Normalization & derivation --------------------------------------

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

    _isPinned(column) {
        return !!column && this._features.columnPinning && this._state.pinnedColumns.includes(column.key);
    }

    _deriveView() {
        const rows = deriveRows(this._sourceData, this._state, this._columns, {
            locale: this._config.locale,
            globalSearch: this._features.globalSearch,
            pagination: this._features.pagination
        });
        this._viewData = rows.viewData;
        this._pageData = rows.pageData;
        this._pageCount = rows.pageCount;
        this._state.page = rows.page;
    }

    // ---- State changes ---------------------------------------------------

    // Every change from the UI or the API goes through here: apply `patch`,
    // re-derive the rows, update the DOM no more than `update` needs, emit
    // `jw-datatable:change`, then call `announce` (rows are up to date by then).
    //   "full"    – re-render the table
    //   "body"    – rows and footer only; the toolbar (e.g. a focused search field) stays
    //   "sort"    – header sort state in place, rows and footer
    //   "columns" – header cells reused and reordered, rows; syncs an open column chooser
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

    // Replaces table body and footer only (toolbar/search field unchanged).
    _refreshBody() {
        const root = this.shadow.querySelector(".k-dt");
        if (!root) { this._render(); return; }
        const focusKey = this._focusKey();

        root.querySelector(".k-dt-body").replaceWith(this._renderBody());

        if (this._features.pagination) {
            const newFooter = this._renderFooter();
            const oldFooter = root.querySelector(".k-dt-footer");
            if (oldFooter) oldFooter.replaceWith(newFooter);
            else root.appendChild(newFooter);
        }
        this._observeLayout();
        if (focusIsLost()) this._restoreFocus(focusKey);
    }

    // ---- Rendering -------------------------------------------------------

    _render() {
        if (!this._configured) return;
        const focusKey = this._focusKey();
        // Replace only the table root; open panels and the context menu stay in place.
        const previous = this.shadow.querySelector(".k-dt");

        const root = el("div", { class: "k-dt", part: "root" });
        // Suppress the browser's native context menu anywhere in the table (incl.
        // long-press on touch) so only our custom menu shows. Form fields keep
        // their native menu (paste, spell-check, …).
        if (this._features.contextMenu) {
            root.addEventListener("contextmenu", (e) => {
                const target = e.composedPath ? e.composedPath()[0] : e.target;
                const tag = target && target.tagName ? target.tagName.toLowerCase() : "";
                if (tag === "input" || tag === "textarea" || tag === "select") return;
                e.preventDefault();
            });
        }
        root.appendChild(this._renderToolbar());
        // The viewport stays put while the body inside is replaced; it draws
        // the horizontal scroll shadows.
        root.appendChild(el("div", { class: "k-dt-viewport" }, [this._renderBody()]));

        if (this._features.pagination) root.appendChild(this._renderFooter());
        if (previous) previous.replaceWith(root);
        else this.shadow.prepend(root);
        this._observeLayout();
        this._restoreFocus(focusKey);
    }

    _renderBody() {
        const body = el("div", { class: "k-dt-body", part: "body", onscroll: () => this._updateScrollShadows() });
        if (this._config.maxHeight) body.style.maxHeight = this._config.maxHeight;
        body.appendChild(this._currentLayout() === "grid" ? this._renderGrid() : this._renderTable());
        return body;
    }

    // ---- Layout: pinned columns & scroll shadows ---------------------------

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

    // Pinned cells are `position: sticky`; each one's `left` is the summed
    // width of the sticky columns before it (`--k-dt-pin-<index>` on the table).
    // When they don't all fit, the most recently pinned ones (the last ones)
    // stay sticky and older ones are paused (`left: auto`, they scroll along).
    _layoutPinned() {
        const viewport = this.shadow.querySelector(".k-dt-viewport");
        if (!viewport) return;
        const body = viewport.querySelector(".k-dt-body");
        const table = viewport.querySelector(".k-dt-table");
        let sticky = 0;
        this._pausedPins = [];
        if (table) {
            const pinned = Array.from(table.tHead.rows[0].cells).filter((th) => th.classList.contains("k-dt-pinned"));
            const widths = pinned.map((th) => th.getBoundingClientRect().width);
            const limit = body.clientWidth * MAX_PINNED_SHARE;
            let first = pinned.length;
            let used = 0;
            while (first > 0 && used + widths[first - 1] <= limit) used += widths[--first];
            let offset = 0;
            pinned.forEach((th, i) => {
                if (i < first) {
                    table.style.setProperty(`--k-dt-pin-${i}`, "auto");
                    this._pausedPins.push(th.dataset.key);
                } else {
                    table.style.setProperty(`--k-dt-pin-${i}`, `${offset}px`);
                    offset += widths[i];
                }
            });
            sticky = pinned.length - first;
        }
        viewport.classList.toggle("has-pins", sticky > 0);
        this._updateScrollShadows();
    }

    // Shadows on the edges that have more content to scroll to.
    _updateScrollShadows() {
        const viewport = this.shadow.querySelector(".k-dt-viewport");
        const body = viewport?.querySelector(".k-dt-body");
        if (!body) return;
        const max = body.scrollWidth - body.clientWidth;
        viewport.classList.toggle("is-overflow-left", body.scrollLeft > 1);
        viewport.classList.toggle("is-overflow-right", body.scrollLeft < max - 1);
    }

    // Marks the cell at `index` as pinned (sticky offset + last-pinned edge).
    _pinCell(cell, index, columns) {
        if (!this._isPinned(columns[index])) return cell;
        cell.classList.add("k-dt-pinned");
        cell.style.setProperty("--k-dt-pin-left", `var(--k-dt-pin-${index})`);
        if (!this._isPinned(columns[index + 1])) cell.classList.add("k-dt-pinned-last");
        return cell;
    }

    _togglePin(key, pinned) {
        const pinnedColumns = this._state.pinnedColumns.filter((k) => k !== key);
        if (pinned) pinnedColumns.push(key);
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

    _renderToolbar() {
        const bar = el("div", { class: "k-dt-toolbar", part: "toolbar" });
        const left = el("div", { class: "k-dt-toolbar-left" });
        const right = el("div", { class: "k-dt-toolbar-right" });

        if (this._config.title) left.appendChild(el("div", { class: "k-dt-title", id: this._hintId("title"), text: this._config.title }));

        if (this._features.globalSearch) {
            const search = el("div", { class: "k-dt-search" }, [
                iconEl("search", "k-dt-search-ic"),
                el("input", {
                    type: "search",
                    class: "k-dt-search-input",
                    "data-fk": "search",
                    placeholder: this._config.searchPlaceholder || this._t.searchPlaceholder,
                    value: this._state.globalSearch,
                    "aria-label": this._t.searchAriaLabel,
                    oninput: (e) => this._debouncedSearch(e.target.value)
                })
            ]);
            left.appendChild(search);
        }

        const activeFilters = activeFilterCount(this._state, { globalSearch: this._features.globalSearch });
        if (this._features.filtering && activeFilters > 0) {
            right.appendChild(el("button", {
                type: "button",
                class: "k-dt-btn",
                "data-fk": "tb:clear",
                title: this._t.clearFilters,
                onclick: () => this.clearFilters()
            }, [iconEl("x"), el("span", { text: this._t.filterCount(activeFilters) })]));
        }

        const layouts = this._availableLayouts();
        if (layouts.length > 1) {
            // One toggle button per layout; the current one is pressed.
            const current = this._currentLayout();
            const meta = {
                table: { icon: "table", label: this._t.layoutTable },
                grid: { icon: "layout-grid", label: this._t.layoutGrid },
                compact: { icon: "rows-3", label: this._t.layoutCompact }
            };
            right.appendChild(el("div", { class: "k-dt-layout-switch", role: "group", "aria-label": this._t.layoutSwitch },
                layouts.map((layout) => el("button", {
                    type: "button",
                    class: "k-dt-btn",
                    "data-fk": `tb:layout:${layout}`,
                    title: meta[layout].label,
                    "aria-label": meta[layout].label,
                    "aria-pressed": String(layout === current),
                    onclick: () => {
                        if (layout === this._currentLayout()) return;
                        this._layoutUserSet = true;
                        this._commit({ layout });
                    }
                }, [iconEl(meta[layout].icon)]))));
        }

        if (this._features.columnVisibility) {
            right.appendChild(el("button", {
                type: "button",
                class: "k-dt-btn",
                "data-fk": "tb:columns",
                "aria-haspopup": "dialog",
                "aria-expanded": String(this._overlay.openerKey === "tb:columns"),
                title: this._t.showHideColumns,
                "aria-label": this._t.showHideColumns,
                onclick: (e) => this._openColumnChooser(e.currentTarget)
            }, [iconEl("columns-3")]));
        }

        if (this._viewStore) {
            right.appendChild(el("button", {
                type: "button",
                class: "k-dt-btn",
                "data-fk": "tb:saved-views",
                "aria-haspopup": "dialog",
                "aria-expanded": String(this._overlay.openerKey === "tb:saved-views"),
                title: this._t.savedViews,
                "aria-label": this._t.savedViews,
                onclick: (e) => this._openViewsPanel(e.currentTarget)
            }, [iconEl("bookmark")]));
        }

        if (this._features.export) {
            right.appendChild(el("button", {
                type: "button",
                class: "k-dt-btn",
                "data-fk": "tb:export",
                "aria-haspopup": "dialog",
                "aria-expanded": String(this._overlay.openerKey === "tb:export"),
                title: this._t.exportData,
                "aria-label": this._t.exportData,
                onclick: (e) => this._openExportDialog(e.currentTarget)
            }, [iconEl("download")]));
        }

        bar.appendChild(left);
        bar.appendChild(right);
        return bar;
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

    _renderTbody(columns) {
        const tbody = el("tbody");
        if (this._pageData.length === 0) {
            tbody.appendChild(el("tr", {}, [
                el("td", { class: "k-dt-empty", colSpan: (columns.length + (this._isCompact() ? 1 : 0)) || 1 }, [this._emptyMessage()])
            ]));
        } else {
            this._pageData.forEach((row, index) => tbody.appendChild(this._renderRow(row, index, columns)));
            this._initRoving(tbody, ".k-dt-td", (event, cell) => this._onCellKey(event, cell, tbody));
        }
        return tbody;
    }

    // Sorting updates the existing table in place (header state + body + footer)
    // instead of a full re-render: the focused header button stays the same
    // element, so screen readers don't re-announce the whole table context.
    _refreshSort() {
        const table = this.shadow.querySelector(".k-dt-table");
        if (!table) { this._render(); return; }   // cards: no header to keep
        const focusKey = this._focusKey();
        const columns = this._tableColumns();
        for (const th of table.tHead.rows[0].cells) {
            const column = columns.find((c) => c.key === th.dataset.key);
            if (!column) continue;
            th.setAttribute("aria-sort", this._ariaSort(column));
            th.querySelector(".k-dt-sort-ind")?.replaceWith(this._sortIndicator(column));
        }
        table.tBodies[0].replaceWith(this._renderTbody(columns));
        if (this._features.pagination) this.shadow.querySelector(".k-dt-footer")?.replaceWith(this._renderFooter());
        this._layoutPinned();
        if (focusIsLost()) this._restoreFocus(focusKey);
    }

    // Column changes (pin, show/hide) also update the existing table in place:
    // header cells are reused and reordered around the focused one (moving a
    // focused element would drop focus), so the table and the focused control
    // stay the same elements and screen readers don't re-announce the table.
    _refreshColumns() {
        this._syncColumnChooser();
        const table = this.shadow.querySelector(".k-dt-table");
        if (!table) { this._render(); return; }   // cards: rebuilt as a whole
        const focusKey = this._focusKey();
        const columns = this._tableColumns();
        const headRow = table.tHead.rows[0];
        const existing = new Map(Array.from(headRow.cells).filter((th) => th.dataset.key).map((th) => [th.dataset.key, th]));
        const cells = columns.map((column, i) => {
            const th = existing.get(column.key) || this._renderHeaderCell(column);
            existing.delete(column.key);
            this._setHeaderPin(th, column, i, columns);
            return th;
        });
        const detailsTh = headRow.querySelector(".k-dt-details-col");
        if (detailsTh) cells.push(detailsTh);
        existing.forEach((th) => th.remove());

        const active = deepActiveElement();
        const anchor = cells.find((th) => th.contains(active));
        const at = cells.indexOf(anchor);
        cells.forEach((th, i) => {
            if (i < at) headRow.insertBefore(th, anchor);
            else if (i > at) headRow.appendChild(th);
        });

        table.tBodies[0].replaceWith(this._renderTbody(columns));
        this._layoutPinned();
        if (focusIsLost()) this._restoreFocus(focusKey);
    }

    // Brings a reused header cell's pinned state (sticky offset, unpin button) up to date.
    _setHeaderPin(th, column, index, columns) {
        th.classList.remove("k-dt-pinned", "k-dt-pinned-last");
        th.style.removeProperty("--k-dt-pin-left");
        this._pinCell(th, index, columns);
        const button = th.querySelector(".k-dt-pin-btn");
        if (this._isPinned(column)) {
            if (!button) th.querySelector(".k-dt-th-inner").appendChild(this._unpinButton(column));
        } else {
            button?.remove();
        }
    }

    _ariaSort(column) {
        const sort = this._state.sort.find((s) => s.key === column.key);
        return sort ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
    }

    // Sort icon, plus rank (visual) and priority (screen readers) for multi-sort.
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
                : null
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

        this._bindContextTrigger(th, () => ({ column, row: null, value: null }));
        if (this._features.columnReorder) this._bindColumnMove(th, column);
        return th;
    }

    // Shown in the header of pinned columns.
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
                event.currentTarget.closest("th").querySelector("button.k-dt-th-label, .k-dt-filter-btn")?.focus();
                this._togglePin(column.key, false);
            }
        }, [iconEl("pin")]);
    }

    _renderRow(row, index, columns) {
        const tr = el("tr", { class: "k-dt-tr" });
        if (typeof this._config.rowClass === "function") {
            const cls = this._config.rowClass(row, index);
            if (cls) tr.classList.add(...String(cls).split(/\s+/));
        }
        const compact = this._isCompact();
        if (compact) {
            // Compact layout: the whole row opens the details (links and buttons
            // inside keep their own action); onRowClick moves into the dialog.
            tr.classList.add("k-dt-clickable");
            tr.addEventListener("click", (event) => {
                if (this._shouldSuppressClick() || event.target.closest("a, button")) return;
                this._openDetails(row);
            });
        } else if (typeof this._config.onRowClick === "function") {
            tr.classList.add("k-dt-clickable");
            tr.addEventListener("click", () => {
                if (this._shouldSuppressClick()) return;
                this._config.onRowClick(row, index);
            });
        }
        columns.forEach((column, i) => tr.appendChild(this._pinCell(this._renderCell(column, row, index), i, columns)));
        if (compact) tr.appendChild(this._renderDetailsCell(row, index));
        return tr;
    }

    // Last cell of a compact row: the button that opens the record's details.
    _renderDetailsCell(row, index) {
        const td = el("td", { class: "k-dt-td k-dt-details-col", tabIndex: -1, "data-fk": `cell:${index}:#details` });
        const button = el("button", {
            type: "button",
            class: "k-dt-details-btn",
            "data-fk": `details:${index}`,
            "aria-haspopup": "dialog",
            "aria-expanded": "false",
            title: this._t.showDetails,
            "aria-label": this._t.showDetailsFor(this._recordTitle(row)),
            onclick: (event) => this._openDetails(row, { anchor: event.currentTarget })
        }, [iconEl("maximize-2")]);
        td.appendChild(button);
        this._bindContextTrigger(td, () => {
            const column = this._tableColumns()[0];
            return { column, row, value: getCellValue(row, column) };
        });
        return td;
    }

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
        if (column.copyable) content.appendChild(this._copyButton(column, row, value, fk));
        td.appendChild(content);
        if ((column.overflow || this._config.cellOverflow) === "ellipsis") this._truncateCell(td, column, row, value);

        this._bindContextTrigger(td, () => ({ column, row, value }));
        if (typeof this._config.onCellClick === "function" && !this._isCompact()) {
            td.addEventListener("click", () => {
                if (this._shouldSuppressClick()) return;
                this._config.onCellClick(value, row, column);
            });
        }
        return td;
    }

    // Single-line cell with an ellipsis. Mouse users get the full text as a
    // tooltip (only when it is actually cut off); keyboard and touch users see
    // it in full while the cell has focus (CSS `:focus-within`).
    _truncateCell(td, column, row, value) {
        td.classList.add("k-dt-truncate");
        if (column.maxWidth) td.style.setProperty("--k-dt-cell-max-width", column.maxWidth);
        td.addEventListener("pointerenter", () => {
            const node = td.querySelector(".k-dt-cell > :first-child");
            if (!node) return;
            if (node.scrollWidth > node.clientWidth) node.title = toText(value, column, this._config.locale, row);
            else node.removeAttribute("title");
        });
    }

    // Builds the display node including link logic (href / SPA / custom handler).
    // `fk`: focus-key prefix of the containing cell/card (keeps focus across re-renders).
    _valueNode(column, row, value, fk) {
        const display = formatValue(value, column, this._config.locale, row);
        const content = display instanceof Node ? display : document.createTextNode(display);
        // An empty value gets no link or button: it would be a focus stop without a name.
        if (typeof display === "string" && !display.trim()) return el("span", { class: "k-dt-value" }, [content]);

        const link = column.link;
        if (link && (link.url || link.spa || typeof link.handler === "function")) {
            const href = typeof link.url === "function" ? link.url(row, value) : (typeof link.url === "string" ? link.url : null);
            const anchor = el("a", { class: "k-dt-link", href: href || "#", "data-fk": fk ? `${fk}:link` : null });
            anchor.appendChild(content);
            anchor.addEventListener("click", (e) => {
                if (this._shouldSuppressClick()) { e.preventDefault(); return; }
                if (typeof link.handler === "function") {
                    e.preventDefault();
                    link.handler(row, value, e);
                } else if (link.spa) {
                    e.preventDefault();
                    this._emit("navigate", { href, row, column, value });
                }
            });
            return anchor;
        }

        if (typeof column.action === "function") {
            const btn = el("button", { type: "button", class: "k-dt-cell-action", "data-fk": fk ? `${fk}:action` : null });
            btn.appendChild(content);
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (this._shouldSuppressClick()) { e.preventDefault(); return; }
                column.action(row, value, e);
            });
            return btn;
        }
        return el("span", { class: "k-dt-value" }, [content]);
    }

    _copyButton(column, row, value, fk) {
        return el("button", {
            type: "button",
            class: "k-dt-copy",
            "data-fk": fk ? `${fk}:copy` : null,
            title: this._t.copyValue,
            "aria-label": `${this._t.copyValue}: ${column.label}`,
            // Clicking must not move focus into the cell: screen readers would
            // read the whole table context instead of just the copy message.
            onmousedown: (e) => e.preventDefault(),
            onclick: (e) => {
                e.stopPropagation();
                const text = toText(value, column, this._config.locale, row);
                this._copyText(neutralizeFormula(text), e.currentTarget, text);
            }
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
            if (typeof this._config.onRowClick === "function") {
                card.classList.add("k-dt-clickable");
                card.addEventListener("click", () => {
                    if (this._shouldSuppressClick()) return;
                    this._config.onRowClick(row, index);
                });
            }
            const titleColumn = titleKey ? columns.find((c) => c.key === titleKey) : null;
            if (titleColumn) {
                card.appendChild(el("div", { class: "k-dt-card-title" }, [
                    this._valueNode(titleColumn, row, getCellValue(row, titleColumn), `${fk}:${titleColumn.key}`)
                ]));
            }
            card.appendChild(this._renderFields(columns.filter((c) => c !== titleColumn), row, fk));
            this._bindContextTrigger(card, () => ({ column: columns[0], row, value: getCellValue(row, columns[0]) }));
            grid.appendChild(card);
        });
        this._initRoving(grid, ".k-dt-card", (event, card) => this._onCardKey(event, card, grid));
        grid.setAttribute("aria-describedby", this._hintId("grid"));
        // The hint sits next to the list (a list may only contain list items).
        const fragment = document.createDocumentFragment();
        fragment.append(grid, el("p", { id: this._hintId("grid"), class: "k-dt-sr-only", text: this._t.gridKeyboardHint }));
        return fragment;
    }

    // Label/value pairs of one record as a description list (cards, detail dialog).
    // `fk`: focus-key prefix, or null where focus keys are not needed.
    _renderFields(columns, row, fk) {
        const list = el("dl", { class: "k-dt-fields" });
        columns.forEach((column) => {
            const value = getCellValue(row, column);
            const key = fk ? `${fk}:${column.key}` : null;
            const val = el("dd", { class: "k-dt-pair-value k-dt-card-val" }, [this._valueNode(column, row, value, key)]);
            if (column.copyable) val.appendChild(this._copyButton(column, row, value, key));
            list.appendChild(el("div", { class: "k-dt-pair k-dt-card-row" }, [
                el("dt", { class: "k-dt-pair-label k-dt-card-label", text: column.label }),
                val
            ]));
        });
        return list;
    }

    _pageRange() {
        return pageRange(this._state.page, this._state.pageSize, this._viewData.length);
    }

    _renderFooter() {
        const { start, end, total } = this._pageRange();
        const pageSize = this._state.pageSize;

        const footer = el("div", { class: "k-dt-footer", part: "footer" });

        const info = el("div", { class: "k-dt-info" }, [
            el("span", { text: this._t.pageInfo(start, end, total) })
        ]);

        const sizer = el("label", { class: "k-dt-pagesize" }, [
            el("span", { text: this._t.perPage }),
            el("select", {
                class: "k-dt-select",
                "data-fk": "pagesize",
                "aria-label": this._t.rowsPerPage,
                onchange: (e) => this._commit({ pageSize: Number(e.target.value), page: 1 }, {
                    announce: () => this._announcePage()
                })
            }, this._pageSizeOptions.map((size) =>
                el("option", { value: String(size), text: String(size), selected: size === pageSize })
            ))
        ]);
        info.appendChild(sizer);

        const nav = el("div", { class: "k-dt-pager", role: "navigation", "aria-label": this._t.paginationAriaLabel });
        const page = this._state.page;
        const pageCount = this._pageCount;

        const navBtn = (icon, label, target, disabled) => el("button", {
            type: "button",
            class: "k-dt-page-btn",
            "data-fk": `page:${icon}`,
            title: label,
            "aria-label": label,
            disabled,
            onclick: () => this._goToPage(target)
        }, [iconEl(icon)]);

        nav.appendChild(navBtn("chevrons-left", this._t.firstPage, 1, page <= 1));
        nav.appendChild(navBtn("chevron-left", this._t.prevPage, page - 1, page <= 1));

        pageItems(page, pageCount).forEach((item) => {
            if (item === "…") {
                nav.appendChild(el("span", { class: "k-dt-page-gap", text: "…" }));
            } else {
                nav.appendChild(el("button", {
                    type: "button",
                    class: "k-dt-page-btn k-dt-page-num" + (item === page ? " is-active" : ""),
                    "data-fk": `page:n:${item}`,
                    "aria-label": this._t.pageN(item),
                    "aria-current": item === page ? "page" : null,
                    text: String(item),
                    onclick: () => this._goToPage(item)
                }));
            }
        });

        nav.appendChild(navBtn("chevron-right", this._t.nextPage, page + 1, page >= pageCount));
        nav.appendChild(navBtn("chevrons-right", this._t.lastPage, pageCount, page >= pageCount));

        footer.appendChild(info);
        footer.appendChild(nav);
        return footer;
    }

    _goToPage(page) {
        this._commit({ page: clamp(page, 1, this._pageCount) }, { announce: () => this._announcePage() });
    }

    // ---- Sorting ---------------------------------------------------------

    _applySort(key, options) {
        this._setSort(toggleSort(this._state.sort, key, options));
    }

    _setSortDirection(key, direction, additive = false) {
        const rest = additive ? this._state.sort.filter((s) => s.key !== key) : [];
        this._setSort(direction ? [...rest, { key, direction }] : rest);
    }

    _setSort(sort) {
        this._commit({ sort, page: 1 }, { update: "sort", announce: () => this._announceSort() });
    }

    // ---- Focus & keyboard ------------------------------------------------

    // Interactive elements carry a stable `data-fk` key, so focus survives the
    // re-render that follows most interactions (sort, filter, page, …).
    _focusKey() {
        const active = deepActiveElement();
        if (!active || active.getRootNode() !== this.shadow) return null;
        return active.closest("[data-fk]")?.dataset.fk ?? null;
    }

    // Focuses the element with `key`. Fallbacks: the enclosing item
    // ("cell:3:name:link" → "cell:3:name"), the current page for pager keys,
    // any element of the same kind (a removed header → first header), and
    // finally the body's roving tab stop.
    _restoreFocus(key) {
        if (!key) return false;
        const usable = (node) => node && node.isConnected && !node.disabled && node.getClientRects().length > 0;
        const find = (selector) => Array.from(this.shadow.querySelectorAll(selector)).find(usable);
        const parts = key.split(":");
        let target = null;
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

    _hintId(kind) {
        return `${this._instanceId}-${kind}-hint`;
    }

    // Roving tabindex: the container is a single tab stop; arrow keys move
    // between items. The last focused item is remembered across re-renders.
    _initRoving(container, selector, onKey) {
        const items = Array.from(container.querySelectorAll(selector));
        if (!items.length) return;
        const remembered = this._rovingKey && items.find((i) => i.dataset.fk === this._rovingKey);
        (remembered || items[0]).tabIndex = 0;

        container.addEventListener("focusin", (event) => {
            const item = event.target.closest(selector);
            if (!item || !container.contains(item)) return;
            items.forEach((i) => { i.tabIndex = i === item ? 0 : -1; });
            this._rovingKey = item.dataset.fk;
        });
        container.addEventListener("keydown", (event) => {
            const item = event.target.closest(selector);
            // Only when the item itself has focus — links/buttons inside keep their keys.
            if (item && event.target === item) onKey(event, item);
        });
    }

    _onCellKey(event, cell, tbody) {
        const rows = Array.from(tbody.rows);
        const rowIndex = rows.indexOf(cell.parentElement);
        const colCount = cell.parentElement.cells.length;
        let r = rowIndex;
        let c = cell.cellIndex;
        switch (event.key) {
            case "ArrowRight": c += 1; break;
            case "ArrowLeft": c -= 1; break;
            case "ArrowDown": r += 1; break;
            case "ArrowUp": r -= 1; break;
            case "Home": c = 0; if (event.ctrlKey) r = 0; break;
            case "End": c = colCount - 1; if (event.ctrlKey) r = rows.length - 1; break;
            case "Enter": {
                // Activate the cell's link/action/details button, else the row's click.
                const inner = cell.querySelector(".k-dt-link, .k-dt-cell-action, .k-dt-details-btn");
                if (inner) inner.click();
                else if (this._isCompact() || this._config.onCellClick || this._config.onRowClick) cell.click();
                else return;
                event.preventDefault();
                return;
            }
            default: return;
        }
        event.preventDefault();
        r = clamp(r, 0, rows.length - 1);
        c = clamp(c, 0, colCount - 1);
        rows[r].cells[c].focus();
    }

    _onCardKey(event, card, grid) {
        const cards = Array.from(grid.querySelectorAll(".k-dt-card"));
        let i = cards.indexOf(card);
        switch (event.key) {
            case "ArrowRight": case "ArrowDown": i += 1; break;
            case "ArrowLeft": case "ArrowUp": i -= 1; break;
            case "Home": i = 0; break;
            case "End": i = cards.length - 1; break;
            case "Enter":
                if (!this._config.onRowClick) return;
                event.preventDefault();
                card.click();
                return;
            default: return;
        }
        event.preventDefault();
        cards[clamp(i, 0, cards.length - 1)].focus();
    }

    // Polite screen-reader announcement (status messages, WCAG 4.1.3).
    _announce(message) {
        this._announcer.announce(message);
    }

    _announceResults() {
        const total = this._viewData.length;
        this._announce(total === 0 ? this._config.noResultsText : this._t.resultsCount(total));
    }

    _announcePage() {
        const { start, end, total } = this._pageRange();
        this._announce(this._t.pageInfo(start, end, total));
    }

    _announceSort() {
        const parts = this._state.sort.map((spec) => {
            const column = this._columns.find((c) => c.key === spec.key);
            return `${column?.label ?? spec.key} ${spec.direction === "asc" ? this._t.ascending : this._t.descending}`;
        });
        this._announce(parts.length ? this._t.sortedBy(parts.join(", ")) : this._t.sortCleared);
    }

    // ---- Context menu ----------------------------------------------------

    // Opens the context menu via right-click (desktop) or long-press (touch).
    // `getArgs` returns { column, row, value } lazily so cells share one binder.
    _bindContextTrigger(node, getArgs) {
        if (!this._features.contextMenu) return;

        // Keyboard: Shift+F10 or the context-menu key on a focused cell, card,
        // or header control. Browsers may follow up with a native `contextmenu`
        // event, which is suppressed below.
        node.addEventListener("keydown", (event) => {
            if (!(event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))) return;
            const target = event.composedPath()[0];
            if (target?.matches?.("input, textarea, select")) return;
            event.preventDefault();
            event.stopPropagation();
            this._suppressContextUntil = Date.now() + 500;
            const rect = (target instanceof Element ? target : node).getBoundingClientRect();
            const args = getArgs();
            this._openContextMenu({ clientX: rect.left + 4, clientY: rect.bottom, target: node }, args.column, args.row, args.value);
        });

        node.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            this._cancelLongPress();
            // A long-press already opened the menu; don't reopen on the native
            // contextmenu event that follows the same gesture.
            if (this._suppressContextUntil && Date.now() < this._suppressContextUntil) return;
            const args = getArgs();
            this._openContextMenu(event, args.column, args.row, args.value);
        });

        node.addEventListener("pointerdown", (event) => {
            if (event.pointerType !== "touch") return;
            this._cancelLongPress();
            const startX = event.clientX;
            const startY = event.clientY;

            const onMove = (ev) => {
                if (Math.abs(ev.clientX - startX) > 10 || Math.abs(ev.clientY - startY) > 10) {
                    this._cancelLongPress();
                }
            };
            const onEnd = () => this._cancelLongPress();
            this._lpCleanup = () => {
                node.removeEventListener("pointermove", onMove);
                node.removeEventListener("pointerup", onEnd);
                node.removeEventListener("pointercancel", onEnd);
                node.removeEventListener("pointerleave", onEnd);
            };
            node.addEventListener("pointermove", onMove);
            node.addEventListener("pointerup", onEnd);
            node.addEventListener("pointercancel", onEnd);
            node.addEventListener("pointerleave", onEnd);

            this._lpTimer = setTimeout(() => {
                this._lpTimer = null;
                if (this._lpCleanup) { this._lpCleanup(); this._lpCleanup = null; }
                // Swallow the click and the native contextmenu that follow the
                // long-press release.
                this._suppressClickUntil = Date.now() + 700;
                this._suppressContextUntil = Date.now() + 700;
                const args = getArgs();
                this._openContextMenu({ clientX: startX, clientY: startY, target: node }, args.column, args.row, args.value);
            }, 500);
        });
    }

    _cancelLongPress() {
        if (this._lpTimer) { clearTimeout(this._lpTimer); this._lpTimer = null; }
        if (this._lpCleanup) { this._lpCleanup(); this._lpCleanup = null; }
    }

    // True briefly after a long-press so the synthetic click does not also
    // trigger row/cell/link handlers. Non-consuming so every nested handler in
    // the same click sees it.
    _shouldSuppressClick() {
        return !!this._suppressClickUntil && Date.now() < this._suppressClickUntil;
    }

    _openContextMenu(event, column, row, value) {
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

    // ---- Filter panel ----------------------------------------------------

    _openFilterPanel(column, anchor, returnKey) {
        closeContextMenu();
        const panel = buildFilterPanel({
            t: this._t,
            column,
            filter: this._state.filters[column.key] || null,
            values: distinctValues(this._sourceData, column, this._config.locale),
            onApply: (filter) => {
                this._setFilter(column.key, filter);
                this._closeOverlay();
            }
        });
        this._showOverlay(panel, anchor, returnKey);
    }

    // `filter`: the column's new filter, or null to remove it.
    _setFilter(key, filter) {
        const filters = { ...this._state.filters };
        if (filter) filters[key] = filter;
        else delete filters[key];
        this._commit({ filters, page: 1 }, { announce: () => this._announceResults() });
    }

    // ---- Column order ------------------------------------------------------

    // Moves column `key` to index `target` among the columns shown in the table
    // (`all`: among all columns incl. hidden ones, as listed in the column
    // chooser). Pinned columns form a block at the front: a column moved into
    // it gets pinned, a pinned one moved out of it gets unpinned; right at the
    // boundary it keeps its state.
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
                this._announce(message(column.label, position, list.length));
            }
        });
    }

    _moveMenuItems(column) {
        const keys = this._tableColumns().map((c) => c.key);
        const i = keys.indexOf(column.key);
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
        this._commit({ columnOrder: normalizeOrder(null, this._columns.map((c) => c.key)) }, {
            update: "columns",
            announce: () => this._announce(this._t.columnOrderReset)
        });
    }

    // Header: Ctrl+Shift+←/→ moves the column (Ctrl+Alt+arrows belong to screen
    // reader table navigation and the Windows Magnifier, Alt+Shift switches the
    // Windows keyboard layout); drag and drop on the desktop layout.
    _bindColumnMove(th, column) {
        th.addEventListener("keydown", (event) => {
            if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return;
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const keys = this._tableColumns().map((c) => c.key);
            this._moveColumn(column.key, keys.indexOf(column.key) + (event.key === "ArrowLeft" ? -1 : 1));
        });

        // Not on touch: a long-press there opens the context menu.
        const canDrag = () => !this._isMobile() && !window.matchMedia?.("(pointer: coarse)").matches;
        th.draggable = canDrag();
        const clearMarks = () => this.shadow.querySelectorAll(".is-drop-before, .is-drop-after")
            .forEach((n) => n.classList.remove("is-drop-before", "is-drop-after"));
        // Drop before or after `th`, depending on the half the pointer is over.
        const dropAfter = (event) => {
            const rect = th.getBoundingClientRect();
            return event.clientX > rect.left + rect.width / 2;
        };
        th.addEventListener("dragstart", (event) => {
            if (!canDrag()) { event.preventDefault(); return; }
            this._dragKey = column.key;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", column.label);
            th.classList.add("is-dragging");
        });
        th.addEventListener("dragover", (event) => {
            if (!this._dragKey) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            clearMarks();
            if (this._dragKey !== column.key) th.classList.add(dropAfter(event) ? "is-drop-after" : "is-drop-before");
        });
        th.addEventListener("dragleave", (event) => {
            if (!th.contains(event.relatedTarget)) th.classList.remove("is-drop-before", "is-drop-after");
        });
        th.addEventListener("drop", (event) => {
            if (!this._dragKey) return;
            event.preventDefault();
            const key = this._dragKey;
            const keys = this._tableColumns().map((c) => c.key);
            const from = keys.indexOf(key);
            const point = keys.indexOf(column.key) + (dropAfter(event) ? 1 : 0);
            clearMarks();
            this._moveColumn(key, point > from ? point - 1 : point);
        });
        th.addEventListener("dragend", () => {
            this._dragKey = null;
            clearMarks();
            this.shadow.querySelectorAll(".is-dragging").forEach((n) => n.classList.remove("is-dragging"));
        });
    }

    // ---- Record details ------------------------------------------------------

    _detailsEnabled() {
        return !!(this._features.rowDetails || this._features.compact);
    }

    // All columns of a record: visible ones in display order, then hidden ones.
    _detailColumns() {
        const visible = this._visibleColumns();
        return [...visible, ...this._columns.filter((c) => !visible.includes(c))];
    }

    // Short name of a record: the card title column, else the first visible column.
    _recordTitle(row) {
        const key = this._config.grid?.titleColumn;
        const column = (key && this._columns.find((c) => c.key === key)) || this._visibleColumns()[0];
        return column ? toText(getCellValue(row, column), column, this._config.locale, row) : "";
    }

    // Modal dialog with every field of `row` (see panels/detailsDialog.js).
    // The table follows previous/next along, so focus returns to the right
    // row when the dialog closes.
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
    _followDetails(record) {
        if (this._features.pagination) {
            const page = Math.floor(this._viewData.indexOf(record) / this._state.pageSize) + 1;
            if (page !== this._state.page) this._commit({ page }, { update: "body" });
        }
        const pageIndex = this._pageData.indexOf(record);
        const retarget = (key) => key?.replace(/^(cell|card|details):\d+/, (_, kind) => `${kind}:${pageIndex}`);
        this._overlay.returnKey = retarget(this._overlay.returnKey);
        this._rovingKey = retarget(this._rovingKey);
    }

    // ---- Column visibility -----------------------------------------------

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

    // ---- Export dialog -----------------------------------------------------

    _exportDefaults() {
        return { ...EXPORT_DEFAULTS, ...(this._config.exportDefaults || {}) };
    }

    // Rows in display order; "page" without pagination is the same as "filtered".
    _exportRows(scope) {
        if (scope === "page" && this._features.pagination) return this._pageData;
        if (scope === "all") return sortData(this._sourceData, this._state.sort, this._columns, this._config.locale);
        return this._viewData;
    }

    _exportBaseName() {
        return this._config.exportFilename || this._config.title || "export";
    }

    _openExportDialog(anchor, returnKey = this._focusKey()) {
        const t = this._t;
        const scopes = [
            this._features.pagination && ["page", t.exportScopePage, this._pageData.length],
            ["filtered", t.exportScopeFiltered, this._viewData.length],
            ["all", t.exportScopeAll, this._sourceData.length]
        ].filter(Boolean);
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

    // ---- Overlay (Panels) ------------------------------------------------

    // Opens `panel` as a modal dialog (see ui/overlay.js); focus returns to
    // `returnKey` (default: the element focused now). `centered`: a dialog in
    // the middle of the screen instead of a popover at `anchor`.
    _showOverlay(panel, anchor, returnKey = this._focusKey(), { centered = false } = {}) {
        this._overlay.show(panel, { anchor, returnKey, centered, sheet: this._isMobile() });
    }

    _closeOverlay(options) {
        this._overlay.close(options);
    }

    // ---- Copy ------------------------------------------------------------

    // `button`: the copy button that was used, if any. `shownValue`: optional
    // value to include in the announcement; `message` replaces it altogether.
    _copyText(text, button, shownValue, message) {
        // Decided at click time: a keyboard user has focus on the button.
        const buttonFocused = !!button && deepActiveElement() === button;
        writeClipboard(text).then(() => {
            message ??= shownValue ? this._t.copiedValue(truncate(shownValue, 60)) : this._t.copied;
            // Name + check icon stay until the button loses focus.
            if (buttonFocused && button.isConnected) {
                confirmOnButton(button, message);
                return;
            }
            this._announce(message);
            if (button) flashCopied(button);
        });
    }

    // Copied text may be pasted into a spreadsheet, which would run cells
    // starting with "=", "+", … as formulas (see `neutralizeFormula`).
    _copyRow(row) {
        const text = this._visibleColumns()
            .map((column) => neutralizeFormula(toText(getCellValue(row, column), column, this._config.locale, row)))
            .join("\t");
        this._copyText(text);
    }

    _copyColumn(column) {
        const text = this._viewData
            .map((row) => neutralizeFormula(toText(getCellValue(row, column), column, this._config.locale, row)))
            .join("\n");
        this._copyText(text);
    }

    // ---- State serialization & events ------------------------------------

    // Returns false when a listener cancelled a `cancelable` event.
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
