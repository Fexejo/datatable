// <jw-datatable> — configurable, reusable data table (Vanilla JS).
//
// Features: pagination, sorting (including multi-column), value and pattern filters,
// quick filters and actions via context menu, CSV export, grid/card view,
// links (href / SPA routing / custom handlers), per-column copy buttons,
// runtime data updates, and localStorage view templates.
//
// The convenient public API lives in `datatable.js`. This file is the Web Component itself.

import { createIcon } from "./icons.js";
import { getTranslations } from "./i18n.js";
import {
    getCellValue,
    clamp,
    debounce,
    uid,
    typeGroup
} from "./util.js";
import { formatValue, toText } from "./formatters.js";
import { sortData, toggleSort } from "./comparators.js";
import {
    applyFilters,
    distinctValues,
    operatorsForType,
    operatorMeta,
    isActiveFilter
} from "./filtering.js";
import { buildCSV, downloadCSV } from "./csv.js";
import { openContextMenu, closeContextMenu, deepActiveElement } from "./contextMenu.js";
import { TemplateStore, LocalStorageAdapter } from "./templateStore.js";
import { datatableStyles } from "./styles.js";

// Small DOM helper.
function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value == null || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "html") node.innerHTML = value;
        else if (key === "text") node.textContent = value;
        else if (key === "dataset") Object.assign(node.dataset, value);
        else if (key.startsWith("on") && typeof value === "function") {
            node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === "for" || key.includes("-") || key === "role") {
            node.setAttribute(key, value);
        } else {
            try { node[key] = value; } catch { node.setAttribute(key, value); }
        }
    }
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
        if (child == null || child === false) continue;
        node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
}

// Visually hidden but exposed to assistive tech (inline styles: used outside the shadow root).
const SR_ONLY_STYLE = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;"
    + "overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;";

// One shared live region in the light DOM (document.body) for all tables.
// Live regions inside shadow roots are not reliably announced by screen
// readers (observed with NVDA + Chrome). It must exist before the first
// message, so tables create it when they connect.
function getAnnouncer() {
    let node = document.querySelector("body > [data-jw-datatable-announcer]");
    if (!node) {
        node = document.createElement("div");
        node.setAttribute("data-jw-datatable-announcer", "");
        node.setAttribute("aria-live", "polite");
        node.setAttribute("aria-atomic", "true");
        node.style.cssText = SR_ONLY_STYLE;
        document.body.appendChild(node);
    }
    return node;
}

function iconEl(name, className = "k-dt-ic") {
    return el("span", { class: className }, [createIcon(name)]);
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
    csvExport: false,
    grid: false,
    compactView: false,
    columnVisibility: false,
    columnPinning: false,
    rowDetails: false,
    templates: false,
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
        this._templateStore = null;
        this._instanceId = uid("kdt");
        // Responsive / touch state
        this._mql = null;
        this._mqlHandler = null;
        this._isMobileView = false;
        this._viewModeUserSet = false;
        this._lpTimer = null;
        this._lpCleanup = null;
        this._suppressClickUntil = 0;
        this._suppressContextUntil = 0;
        this._resizeObserver = null;
        this._debouncedSearch = debounce((value) => {
            this._state.globalSearch = value;
            this._state.page = 1;
            // Rebuild body/footer only so the focused search field is preserved.
            this._updateView();
            this._debouncedSearchAnnounce();
            this._emitChange();
        }, 200);
        // Announce the result count only once typing pauses, not after every letter.
        this._debouncedSearchAnnounce = debounce(() => this._announceResults(), 1000);
    }

    connectedCallback() {
        getAnnouncer();
        if (!this._configured) return;
        if (!this._mql) this._setupResponsive();
        if (!this.shadow.firstChild) this._render();
    }

    disconnectedCallback() {
        this._debouncedSearch.cancel();
        this._debouncedSearchAnnounce.cancel();
        clearTimeout(this._announceTimer);
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
        // Derive text defaults from translation bundle; allow explicit config override.
        this._config.emptyText ??= this._t.emptyData;
        this._config.noResultsText ??= this._t.noResults;
        this._features = { ...DEFAULT_FEATURES, ...(config.features || {}) };
        this._columns = this._normalizeColumns(config.columns || []);
        this._sourceData = Array.isArray(config.data) ? config.data.slice() : [];

        const pagination = config.pagination || {};
        this._pageSizeOptions = pagination.pageSizeOptions || [10, 25, 50, 100];

        const storage = config.storage || {};
        if (this._features.templates) {
            const storageKey = storage.key || config.id || "default";
            const namespace = (storage.namespace || "jw-datatable") + "::" + storageKey;
            this._templateStore = new TemplateStore(storage.adapter || new LocalStorageAdapter(namespace));
        }

        const initial = config.initial || {};
        this._state = {
            sort: initial.sort ? initial.sort.slice() : [],
            filters: this._deserializeFilters(initial.filters || {}),
            globalSearch: initial.globalSearch || "",
            page: initial.page || 1,
            pageSize: initial.pageSize || pagination.pageSize || this._pageSizeOptions[0] || 25,
            viewMode: initial.viewMode || config.defaultView || "table",
            hiddenColumns: new Set(
                initial.hiddenColumns || this._columns.filter((c) => c.hidden).map((c) => c.key)
            ),
            pinnedColumns: (initial.pinnedColumns || this._columns.filter((c) => c.pinned).map((c) => c.key)).slice()
        };

        // An explicit view choice (config or initial state) pins the view and
        // opts out of the automatic breakpoint-driven switching.
        this._viewModeUserSet = !!(initial.viewMode || config.defaultView);

        this._configured = true;
        this._setupResponsive();
        this._deriveView();
        this._render();
        return this;
    }

    // ---- Responsive (Mobile First) --------------------------------------

    // Sets up a matchMedia listener that, when `responsive.autoGridView` is on,
    // switches to `responsive.mobileView` (cards by default) below the
    // breakpoint and back to the table on desktop — unless the developer/user
    // chose a view explicitly.
    _setupResponsive() {
        this._teardownResponsive();
        const r = this._config.responsive || {};
        this._responsive = {
            enabled: r.enabled !== false,
            breakpoint: typeof r.breakpoint === "number" ? r.breakpoint : 640,
            autoGridView: r.autoGridView !== false,
            mobileView: r.mobileView || "grid"
        };

        if (!this._responsive.enabled || typeof window.matchMedia !== "function") {
            this._isMobileView = false;
            return;
        }

        this._mql = window.matchMedia(`(max-width: ${this._responsive.breakpoint - 0.02}px)`);
        this._isMobileView = this._mql.matches;
        this._mqlHandler = (event) => this._onBreakpointChange(event.matches);
        this._mql.addEventListener("change", this._mqlHandler);
        this._applyAutoView();
    }

    _teardownResponsive() {
        if (this._mql && this._mqlHandler) this._mql.removeEventListener("change", this._mqlHandler);
        this._mql = null;
        this._mqlHandler = null;
    }

    _applyAutoView() {
        if (!this._responsive || !this._responsive.enabled || !this._responsive.autoGridView) return;
        if (this._viewModeUserSet || !this._availableViews().includes(this._responsive.mobileView)) return;
        this._state.viewMode = this._isMobileView ? this._responsive.mobileView : "table";
    }

    _onBreakpointChange(matches) {
        this._isMobileView = matches;
        // Transient popups computed for the previous layout are no longer valid.
        this._closeOverlay();
        closeContextMenu();

        const mobileView = this._responsive.mobileView;
        if (!this._responsive.autoGridView || this._viewModeUserSet || !this._availableViews().includes(mobileView)) return;
        const next = matches ? mobileView : "table";
        if (next !== this._state.viewMode) {
            this._state.viewMode = next;
            this._render();
            this._emitChange();
        }
    }

    _isMobile() {
        return !!this._isMobileView;
    }

    // ---- Views: table, cards ("grid"), compact table + details -------------

    _availableViews() {
        return ["table", this._features.grid && "grid", this._features.compactView && "compact"].filter(Boolean);
    }

    // The view to render: the chosen one if its feature is on, else the table.
    _currentView() {
        return this._availableViews().includes(this._state.viewMode) ? this._state.viewMode : "table";
    }

    _isCompact() {
        return this._currentView() === "compact";
    }

    // Columns of the table view; the compact view shows only the columns
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
        return this._serializeState();
    }

    setState(partial = {}) {
        if (partial.sort) this._state.sort = partial.sort.slice();
        if (partial.filters) this._state.filters = this._deserializeFilters(partial.filters);
        if (partial.globalSearch != null) this._state.globalSearch = partial.globalSearch;
        if (partial.pageSize) this._state.pageSize = partial.pageSize;
        if (partial.page) this._state.page = partial.page;
        if (partial.viewMode) { this._state.viewMode = partial.viewMode; this._viewModeUserSet = true; }
        if (partial.hiddenColumns) this._state.hiddenColumns = new Set(partial.hiddenColumns);
        if (partial.pinnedColumns) this._state.pinnedColumns = partial.pinnedColumns.slice();
        this._deriveView();
        this._render();
        this._emitChange();
    }

    clearFilters() {
        this._state.filters = {};
        this._state.globalSearch = "";
        this._state.page = 1;
        this._deriveView();
        this._render();
        this._announceResults();
        this._emitChange();
    }

    exportCSV(filename) {
        const csv = buildCSV(this._viewData, this._visibleColumns(), {
            locale: this._config.locale,
            delimiter: this._config.csvDelimiter || ";"
        });
        downloadCSV(csv, filename || (this._config.exportFilename || "export") + ".csv");
    }

    listTemplates() {
        return this._templateStore ? this._templateStore.list() : Promise.resolve([]);
    }

    async saveTemplate(name) {
        if (!this._templateStore || !name) return;
        await this._templateStore.save(name, this._serializeState({ includePage: false }));
    }

    async loadTemplate(name) {
        if (!this._templateStore) return;
        const data = await this._templateStore.get(name);
        // A loaded view starts on page 1; templates do not store the page.
        if (data) this.setState({ ...data, page: 1 });
    }

    removeTemplate(name) {
        if (!this._templateStore) return Promise.resolve();
        return this._templateStore.remove(name);
    }

    // ---- Normalization & derivation --------------------------------------

    _normalizeColumns(columns) {
        return columns.map((col) => {
            const type = col.type || "string";
            const group = typeGroup(type);
            let link = col.link;
            if (typeof link === "function") link = { url: link };
            const optionsMap = col.optionsMap
                || (Array.isArray(col.options)
                    ? Object.fromEntries(col.options.map((o) => [o.value, o.label ?? o.value]))
                    : null);
            return {
                ...col,
                key: col.key,
                label: col.label ?? col.key,
                type,
                align: col.align || (group === "number" ? "right" : group === "boolean" ? "center" : "left"),
                sortable: this._featureColumn("sorting", col.sortable),
                filterable: this._featureColumn("filtering", col.filterable),
                copyable: this._features?.copyButtons !== false && !!col.copyable,
                hidden: !!col.hidden,
                pinned: !!col.pinned,
                link,
                optionsMap
            };
        });
    }

    _featureColumn(feature, columnFlag) {
        const enabled = (this._features ? this._features[feature] : DEFAULT_FEATURES[feature]) !== false;
        return enabled && columnFlag !== false;
    }

    // Visible columns in display order: pinned columns first (in pin order).
    _visibleColumns() {
        const visible = this._columns.filter((c) => !this._state.hiddenColumns.has(c.key));
        if (!this._features.columnPinning) return visible;
        const pinned = this._state.pinnedColumns.map((key) => visible.find((c) => c.key === key)).filter(Boolean);
        return pinned.length ? [...pinned, ...visible.filter((c) => !pinned.includes(c))] : visible;
    }

    _isPinned(column) {
        return !!column && this._features.columnPinning && this._state.pinnedColumns.includes(column.key);
    }

    _deriveView() {
        this._viewData = applyFilters(this._sourceData, this._state.filters, this._columns, {
            locale: this._config.locale,
            globalSearch: this._features.globalSearch ? this._state.globalSearch : ""
        });
        this._viewData = sortData(this._viewData, this._state.sort, this._columns, this._config.locale);

        const total = this._viewData.length;
        const pageSize = this._features.pagination ? this._state.pageSize : total || 1;
        this._pageCount = Math.max(1, Math.ceil(total / pageSize));
        this._state.page = clamp(this._state.page, 1, this._pageCount);
        const start = (this._state.page - 1) * pageSize;
        this._pageData = this._features.pagination ? this._viewData.slice(start, start + pageSize) : this._viewData;
    }

    _deriveAndRenderBody() {
        this._deriveView();
        this._render();
        this._emitChange();
    }

    // Replaces table body and footer only (toolbar/search field unchanged).
    _updateView() {
        this._deriveView();
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
        if (this._focusIsLost()) this._restoreFocus(focusKey);
    }

    // ---- Rendering -------------------------------------------------------

    _render() {
        if (!this._configured) return;
        const focusKey = this._focusKey();
        // Replace only style + table root; open panels, the context menu and the
        // live region stay in place.
        for (const child of Array.from(this.shadow.children)) {
            if (child.tagName === "STYLE" || child.classList.contains("k-dt")) child.remove();
        }
        const style = el("style", { html: datatableStyles + (this._config.styles || "") });
        this.shadow.prepend(style);

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
        style.after(root);
        this._observeLayout();
        this._restoreFocus(focusKey);
    }

    _renderBody() {
        const body = el("div", { class: "k-dt-body", part: "body", onscroll: () => this._updateScrollShadows() });
        if (this._config.maxHeight) body.style.maxHeight = this._config.maxHeight;
        body.appendChild(this._currentView() === "grid" ? this._renderGrid() : this._renderTable());
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
        this._state.pinnedColumns = this._state.pinnedColumns.filter((k) => k !== key);
        if (pinned) this._state.pinnedColumns.push(key);
        this._render();
        this._emitChange();
        const labelOf = (k) => this._columns.find((c) => c.key === k)?.label ?? k;
        const label = labelOf(key);
        // The chooser's toggle button announces its own state; everything else needs a message.
        if (pinned && this._pausedPins.length) this._announce(this._t.pinsPaused(label, this._pausedPins.map(labelOf).join(", ")));
        else if (!this._overlay) this._announce(pinned ? this._t.columnPinned(label) : this._t.columnUnpinned(label));
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

        const activeFilters = this._activeFilterCount();
        if (this._features.filtering && activeFilters > 0) {
            right.appendChild(el("button", {
                type: "button",
                class: "k-dt-btn",
                "data-fk": "tb:clear",
                title: this._t.clearFilters,
                onclick: () => this.clearFilters()
            }, [iconEl("x"), el("span", { text: this._t.filterCount(activeFilters) })]));
        }

        const views = this._availableViews();
        if (views.length > 1) {
            // One toggle button per view; the current one is pressed.
            const current = this._currentView();
            const meta = {
                table: { icon: "table", label: this._t.tableView },
                grid: { icon: "layout-grid", label: this._t.gridView },
                compact: { icon: "rows-3", label: this._t.compactView }
            };
            right.appendChild(el("div", { class: "k-dt-view-switch", role: "group", "aria-label": this._t.viewSwitch },
                views.map((view) => el("button", {
                    type: "button",
                    class: "k-dt-btn",
                    "data-fk": `tb:view:${view}`,
                    title: meta[view].label,
                    "aria-label": meta[view].label,
                    "aria-pressed": String(view === current),
                    onclick: () => {
                        if (view === this._currentView()) return;
                        this._state.viewMode = view;
                        this._viewModeUserSet = true;
                        this._render();
                        this._emitChange();
                    }
                }, [iconEl(meta[view].icon)]))));
        }

        if (this._features.columnVisibility) {
            right.appendChild(el("button", {
                type: "button",
                class: "k-dt-btn",
                "data-fk": "tb:columns",
                "aria-haspopup": "dialog",
                "aria-expanded": String(this._overlayFk === "tb:columns"),
                title: this._t.showHideColumns,
                "aria-label": this._t.showHideColumns,
                onclick: (e) => this._openColumnChooser(e.currentTarget)
            }, [iconEl("columns-3")]));
        }

        if (this._features.templates && this._templateStore) {
            right.appendChild(el("button", {
                type: "button",
                class: "k-dt-btn",
                "data-fk": "tb:templates",
                "aria-haspopup": "dialog",
                "aria-expanded": String(this._overlayFk === "tb:templates"),
                title: this._t.viewTemplates,
                "aria-label": this._t.viewTemplates,
                onclick: (e) => this._openTemplatesMenu(e.currentTarget)
            }, [iconEl("save")]));
        }

        if (this._features.csvExport) {
            right.appendChild(el("button", {
                type: "button",
                class: "k-dt-btn",
                "data-fk": "tb:export",
                title: this._t.exportCsv,
                "aria-label": this._t.exportCsv,
                onclick: () => this.exportCSV()
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

    _renderTbody(columns) {
        const tbody = el("tbody");
        if (this._pageData.length === 0) {
            const message = this._sourceData.length === 0 ? this._config.emptyText : this._config.noResultsText;
            tbody.appendChild(el("tr", {}, [
                el("td", { class: "k-dt-empty", colSpan: (columns.length + (this._isCompact() ? 1 : 0)) || 1 }, [message])
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
    _updateSortView() {
        this._deriveView();
        const table = this.shadow.querySelector(".k-dt-table");
        if (!table) { this._render(); return; }   // card view: no header to keep
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
        if (this._focusIsLost()) this._restoreFocus(focusKey);
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
            class: "k-dt-th k-dt-align-" + column.align,
            scope: "col",
            "data-key": column.key,
            "aria-sort": this._ariaSort(column),
            style: column.width ? `width:${column.width};` : null
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
                "aria-expanded": String(this._overlayFk === `filter:${column.key}`),
                title: active ? this._t.filterActive : this._t.filter,
                "aria-label": this._t.filterPanelTitle(column.label),
                onclick: (e) => this._openFilterPanel(column, e.currentTarget)
            }, [iconEl("list-filter")]));
        }

        if (this._isPinned(column)) {
            inner.appendChild(el("button", {
                type: "button",
                class: "k-dt-pin-btn",
                "data-fk": `pin:${column.key}`,
                title: this._t.unpinColumn,
                "aria-label": this._t.unpinColumnNamed(column.label),
                onclick: () => {
                    this._togglePin(column.key, false);
                    // The column moves; keep focus on its header.
                    this._restoreFocus(this.shadow.querySelector(`[data-fk="sort:${CSS.escape(column.key)}"]`)
                        ? `sort:${column.key}` : `filter:${column.key}`);
                }
            }, [iconEl("pin")]));
        }

        th.appendChild(inner);

        this._bindContextTrigger(th, () => ({ column, row: null, value: null }));
        return th;
    }

    _renderRow(row, index, columns) {
        const tr = el("tr", { class: "k-dt-tr" });
        if (typeof this._config.rowClass === "function") {
            const cls = this._config.rowClass(row, index);
            if (cls) tr.classList.add(...String(cls).split(/\s+/));
        }
        const compact = this._isCompact();
        if (compact) {
            // Compact view: the whole row opens the details (links and buttons
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
                this._copyText(text, e.currentTarget, text);
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
            const message = this._sourceData.length === 0 ? this._config.emptyText : this._config.noResultsText;
            grid.appendChild(el("div", { class: "k-dt-empty", text: message }));
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

    _renderFooter() {
        const total = this._viewData.length;
        const pageSize = this._state.pageSize;
        const start = total === 0 ? 0 : (this._state.page - 1) * pageSize + 1;
        const end = Math.min(this._state.page * pageSize, total);

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
                onchange: (e) => {
                    this._state.pageSize = Number(e.target.value);
                    this._state.page = 1;
                    this._deriveAndRenderBody();
                    this._announcePage();
                }
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

        this._pageItems(page, pageCount).forEach((item) => {
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

    _pageItems(current, total) {
        if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
        const items = [1];
        if (current > 3) items.push("…");
        for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) items.push(p);
        if (current < total - 2) items.push("…");
        items.push(total);
        return items;
    }

    _goToPage(page) {
        this._state.page = clamp(page, 1, this._pageCount);
        this._deriveAndRenderBody();
        this._announcePage();
    }

    // ---- Sorting ---------------------------------------------------------

    _applySort(key, options) {
        this._state.sort = toggleSort(this._state.sort, key, options);
        this._state.page = 1;
        this._updateSortView();
        this._emitChange();
        this._announceSort();
    }

    _setSortDirection(key, direction, additive = false) {
        const rest = additive ? this._state.sort.filter((s) => s.key !== key) : [];
        this._state.sort = direction ? [...rest, { key, direction }] : rest;
        this._state.page = 1;
        this._updateSortView();
        this._emitChange();
        this._announceSort();
    }

    // ---- Focus & keyboard ------------------------------------------------

    // Interactive elements carry a stable `data-fk` key, so focus survives the
    // re-render that follows most interactions (sort, filter, page, …).
    _focusKey() {
        const active = deepActiveElement();
        if (!active || active.getRootNode() !== this.shadow) return null;
        return active.closest("[data-fk]")?.dataset.fk ?? null;
    }

    _focusIsLost() {
        const active = deepActiveElement();
        return !active || active === document.body || !active.isConnected;
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
    // While a modal panel is open, everything outside it is hidden from assistive
    // tech, so the panel's own live region is used. The target is chosen when the
    // text is written (an action may close the panel right after announcing).
    _announce(message) {
        if (!message) return;
        const target = () => this._overlay?.querySelector("[data-live]") || getAnnouncer();
        clearTimeout(this._announceTimer);
        target().textContent = "";
        // Browsers may merge "clear + set" into one update and then see no
        // change for a repeated message. An alternating invisible suffix makes
        // every announcement a real text change.
        this._announceToggle = !this._announceToggle;
        const text = message + (this._announceToggle ? "\u00a0" : "");
        this._announceTimer = setTimeout(() => { target().textContent = text; }, 100);
    }

    _announceResults() {
        const total = this._viewData.length;
        this._announce(total === 0 ? this._config.noResultsText : this._t.resultsCount(total));
    }

    _announcePage() {
        const total = this._viewData.length;
        const start = total === 0 ? 0 : (this._state.page - 1) * this._state.pageSize + 1;
        const end = Math.min(this._state.page * this._state.pageSize, total);
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
                    label: this._t.filterByValue(this._truncate(label)),
                    icon: "list-filter",
                    onSelect: () => this._setFilter(column.key, { kind: "value", values: [value] })
                });
                if (group === "text" || group === "number") {
                    items.push({
                        label: this._t.excludeValue(this._truncate(label)),
                        icon: "x",
                        onSelect: () => this._setFilter(column.key, { kind: "pattern", operator: "notEquals", operand: label, arity: 1 })
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
                this._copyText(text, null, text);
            } });
            items.push({ label: this._t.copyRow, icon: "copy", onSelect: () => this._copyRow(row) });
        }
        if (this._features.csvExport) {
            items.push({ label: this._t.copyColumn, icon: "copy", onSelect: () => this._copyColumn(column) });
        }

        if (this._features.columnVisibility || this._features.columnPinning) items.push({ separator: true });
        if (this._features.columnPinning) {
            items.push(this._isPinned(column)
                ? { label: this._t.unpinColumn, icon: "pin-off", onSelect: () => this._togglePin(column.key, false) }
                : { label: this._t.pinColumn, icon: "pin", onSelect: () => this._togglePin(column.key, true) });
        }
        if (this._features.columnVisibility) {
            items.push({ label: this._t.hideColumn, icon: "eye-off", onSelect: () => this._toggleColumn(column.key, false) });
        }

        if (this._features.csvExport) {
            items.push({ separator: true });
            items.push({ label: this._t.exportCsv, icon: "download", onSelect: () => this.exportCSV() });
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
        const panel = this._buildFilterPanel(column);
        this._showOverlay(panel, anchor, returnKey);
    }

    _buildFilterPanel(column) {
        const existing = this._state.filters[column.key] || null;
        const group = typeGroup(column.type);
        let mode = existing ? existing.kind : (group === "text" ? "value" : "pattern");

        const panel = el("div", { class: "k-dt-panel" });
        panel.appendChild(el("div", { class: "k-dt-panel-head", text: this._t.filterPanelTitle(column.label) }));

        // Tabs (WAI-ARIA tabs pattern): Left/Right/Home/End switch, one tab stop.
        const id = uid("kdt-flt");
        const tabs = el("div", { class: "k-dt-tabs", role: "tablist", "aria-label": this._t.filterMode });
        const makeTab = (name, text) => el("button", {
            type: "button", class: "k-dt-tab", role: "tab", id: `${id}-${name}-tab`,
            "aria-controls": `${id}-${name}`, text
        });
        const valueTab = makeTab("value", this._t.valuesTab);
        const patternTab = makeTab("pattern", this._t.patternTab);
        tabs.appendChild(valueTab);
        tabs.appendChild(patternTab);
        panel.appendChild(tabs);

        const bodyValue = this._buildValueFilter(column, existing);
        const bodyPattern = this._buildPatternFilter(column, existing);
        for (const [name, body] of [["value", bodyValue], ["pattern", bodyPattern]]) {
            body.el.id = `${id}-${name}`;
            body.el.setAttribute("role", "tabpanel");
            body.el.setAttribute("aria-labelledby", `${id}-${name}-tab`);
            panel.appendChild(body.el);
        }

        const setMode = (next, focusTab = false) => {
            mode = next;
            for (const [tab, body, name] of [[valueTab, bodyValue, "value"], [patternTab, bodyPattern, "pattern"]]) {
                const selected = next === name;
                tab.classList.toggle("is-active", selected);
                tab.setAttribute("aria-selected", String(selected));
                tab.tabIndex = selected ? 0 : -1;
                body.el.hidden = !selected;
                body.focusTarget.toggleAttribute("data-autofocus", selected);
                if (selected && focusTab) tab.focus();
            }
        };
        valueTab.addEventListener("click", () => setMode("value"));
        patternTab.addEventListener("click", () => setMode("pattern"));
        tabs.addEventListener("keydown", (event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home" ? "value"
                : event.key === "End" ? "pattern"
                : mode === "value" ? "pattern" : "value";
            setMode(next, true);
        });
        setMode(mode);

        const applyButton = el("button", {
            type: "button",
            class: "k-dt-btn k-dt-btn-primary",
            text: this._t.apply,
            onclick: () => {
                const filter = mode === "value" ? bodyValue.collect() : bodyPattern.collect();
                this._setFilter(column.key, filter);
                this._closeOverlay();
            }
        });
        const actions = el("div", { class: "k-dt-panel-actions" }, [
            el("button", {
                type: "button",
                class: "k-dt-btn",
                text: this._t.reset,
                onclick: () => { this._setFilter(column.key, null); this._closeOverlay(); }
            }),
            applyButton
        ]);
        panel.appendChild(actions);

        // Enter in the value search or on a search-result option applies, like a click on "Apply".
        bodyValue.el.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" || e.isComposing) return;
            if (e.target !== bodyValue.focusTarget && e.target.type !== "radio") return;
            e.preventDefault();
            applyButton.click();
        });
        return panel;
    }

    _buildValueFilter(column, existing) {
        const container = el("div", { class: "k-dt-filter-body" });
        const values = distinctValues(this._sourceData, column, this._config.locale);
        const selected = new Set(
            existing && existing.kind === "value" ? existing.values.map((v) => String(v)) : values.map((v) => String(v.value))
        );

        // Searching works like Excel: the matches start out checked, and the
        // filter becomes either only the checked matches or (with "add") the
        // checked matches plus the selection from before the search. Clearing
        // the search restores that earlier selection.
        let baseline = null;   // Map<label element, checked> captured when a search starts
        const checkboxes = () => Array.from(list.querySelectorAll(".k-dt-check"));
        const isVisible = (label) => label.style.display !== "none";
        const boxOf = (label) => label.querySelector('input[type="checkbox"]');
        const syncToggleAll = () => {
            const visible = checkboxes().filter(isVisible);
            toggleAllBox.checked = visible.length > 0 && visible.every((label) => boxOf(label).checked);
        };

        const search = el("input", {
            type: "search",
            class: "k-dt-input",
            placeholder: this._t.searchValues,
            "aria-label": this._t.searchValues,
            oninput: (e) => {
                const q = e.target.value.trim().toLowerCase();
                if (q && !baseline) baseline = new Map(checkboxes().map((label) => [label, boxOf(label).checked]));
                checkboxes().forEach((label) => {
                    const match = !q || label.dataset.label.includes(q);
                    label.style.display = match ? "" : "none";
                    // Matches start checked; everything else keeps the earlier selection.
                    if (baseline) boxOf(label).checked = (q && match) || baseline.get(label);
                });
                if (!q) baseline = null;
                toggleAllText.textContent = q ? this._t.selectAllResults : this._t.selectAll;
                searchMode.hidden = !q;
                syncToggleAll();
            }
        });
        container.appendChild(search);

        const toggleAllBox = el("input", {
            type: "checkbox",
            checked: selected.size === values.length,
            onchange: (e) => {
                checkboxes().forEach((label) => {
                    if (isVisible(label)) boxOf(label).checked = e.target.checked;
                });
            }
        });
        const toggleAllText = el("span", { text: this._t.selectAll });
        container.appendChild(el("label", { class: "k-dt-check k-dt-check-all" }, [toggleAllBox, toggleAllText]));

        const list = el("div", { class: "k-dt-check-list", onchange: () => syncToggleAll() });
        values.forEach((entry) => {
            const labelText = String(entry.label || this._t.emptyValue);
            const label = el("label", { class: "k-dt-check", dataset: { label: labelText.toLowerCase(), value: String(entry.value) } }, [
                el("input", { type: "checkbox", checked: selected.has(String(entry.value)) }),
                el("span", { class: "k-dt-check-label", text: labelText }),
                el("span", { class: "k-dt-check-count", text: String(entry.count) })
            ]);
            list.appendChild(label);
        });
        container.appendChild(list);

        // Only shown while searching.
        const modeName = uid("kdt-smode");
        const radio = (value, text, checked) => el("label", { class: "k-dt-check" }, [
            el("input", { type: "radio", name: modeName, value, checked }),
            el("span", { class: "k-dt-check-label", text })
        ]);
        const searchMode = el("fieldset", { class: "k-dt-search-mode", hidden: true }, [
            el("legend", { class: "k-dt-field-label", text: this._t.searchResultsMode }),
            radio("replace", this._t.searchResultsOnly, true),
            radio("add", this._t.searchResultsAdd, false)
        ]);
        container.appendChild(searchMode);

        return {
            el: container,
            focusTarget: search,
            collect: () => {
                const add = !searchMode.hidden && searchMode.querySelector('input[value="add"]').checked;
                const chosen = [];
                checkboxes().forEach((label) => {
                    const take = searchMode.hidden
                        ? boxOf(label).checked
                        : isVisible(label)
                            ? boxOf(label).checked || (add && baseline.get(label))
                            : add && boxOf(label).checked;
                    if (take) {
                        const original = values.find((v) => String(v.value) === label.dataset.value);
                        chosen.push(original ? original.value : label.dataset.value);
                    }
                });
                // All selected = no filter.
                if (chosen.length === values.length || chosen.length === 0) return null;
                return { kind: "value", values: chosen };
            }
        };
    }

    _buildPatternFilter(column, existing) {
        const container = el("div", { class: "k-dt-filter-body" });
        const operators = operatorsForType(column.type);
        const current = existing && existing.kind === "pattern" ? existing : null;
        const inputType = typeGroup(column.type) === "number" ? "number"
            : typeGroup(column.type) === "date" ? (column.type === "datetime" ? "datetime-local" : column.type === "time" ? "time" : "date")
            : "text";

        const operandWrap = el("div", { class: "k-dt-operands" });
        const operand1 = el("input", { type: inputType, class: "k-dt-input", value: current ? (current.operand ?? "") : "" });
        const operand2 = el("input", { type: inputType, class: "k-dt-input", value: current ? (current.operand2 ?? "") : "" });
        const selectId = uid("kdt-op");

        const select = el("select", {
            class: "k-dt-select",
            id: selectId,
            onchange: () => renderOperands()
        }, operators.map((op) => el("option", { value: op.id, text: this._t.operators[op.id] ?? op.label, selected: current && current.operator === op.id })));

        const renderOperands = () => {
            const meta = operatorMeta(column.type, select.value);
            const arity = meta ? meta.arity : 1;
            operandWrap.innerHTML = "";
            operand1.setAttribute("aria-label", arity >= 2 ? this._t.operandFrom : this._t.operandValue);
            operand2.setAttribute("aria-label", this._t.operandTo);
            if (arity >= 1) operandWrap.appendChild(operand1);
            if (arity >= 2) operandWrap.appendChild(operand2);
        };
        renderOperands();

        container.appendChild(el("label", { class: "k-dt-field-label", for: selectId, text: this._t.condition }));
        container.appendChild(select);
        container.appendChild(operandWrap);

        return {
            el: container,
            focusTarget: select,
            collect: () => {
                const meta = operatorMeta(column.type, select.value);
                const arity = meta ? meta.arity : 1;
                const filter = { kind: "pattern", operator: select.value, arity };
                if (arity >= 1) filter.operand = operand1.value;
                if (arity >= 2) filter.operand2 = operand2.value;
                return isActiveFilter(filter) ? filter : null;
            }
        };
    }

    _setFilter(key, filter) {
        if (!filter) {
            delete this._state.filters[key];
        } else {
            this._state.filters[key] = filter;
        }
        this._state.page = 1;
        this._deriveAndRenderBody();
        this._announceResults();
    }

    // ---- Record details ------------------------------------------------------

    _detailsEnabled() {
        return !!(this._features.rowDetails || this._features.compactView);
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

    // Modal dialog with every field of `row`. Previous/next walk through all
    // filtered and sorted rows (across pages; the table follows along so focus
    // returns to the right row when the dialog closes).
    _openDetails(row, { returnKey = this._focusKey(), anchor = null } = {}) {
        closeContextMenu();
        let current = this._viewData.indexOf(row);
        if (current < 0) return;

        const head = el("h2", { class: "k-dt-panel-head", tabIndex: -1, "data-autofocus": "" });
        const position = el("p", { class: "k-dt-details-pos" });
        const body = el("div", { class: "k-dt-details-body" });
        const navButton = (icon, text, label, step) => el("button", {
            type: "button",
            class: "k-dt-btn",
            "aria-label": label,
            onclick: () => show(current + step, true)
        }, icon === "chevron-left" ? [iconEl(icon), el("span", { text })] : [el("span", { text }), iconEl(icon)]);
        const prev = navButton("chevron-left", this._t.previous, this._t.prevRecord, -1);
        const next = navButton("chevron-right", this._t.next, this._t.nextRecord, 1);
        const actions = el("div", { class: "k-dt-panel-actions k-dt-details-actions" }, [prev, next]);
        if (typeof this._config.onRowClick === "function") {
            actions.prepend(el("button", {
                type: "button",
                class: "k-dt-btn k-dt-btn-primary k-dt-details-open",
                text: this._t.openRecord,
                onclick: () => {
                    const record = this._viewData[current];
                    const pageIndex = this._pageData.indexOf(record);
                    this._closeOverlay();
                    this._config.onRowClick(record, pageIndex);
                }
            }));
        }

        const show = (index, navigated) => {
            const total = this._viewData.length;
            current = clamp(index, 0, total - 1);
            const record = this._viewData[current];
            const title = this._recordTitle(record);
            head.textContent = title ? this._t.detailsTitle(title) : this._t.details;
            position.textContent = this._t.recordPosition(current + 1, total);
            body.replaceChildren(this._renderFields(this._detailColumns(), record, null));
            prev.disabled = current <= 0;
            next.disabled = current >= total - 1;
            if (!navigated) return;
            // Focus stays on the pressed button, or moves to the other one at an end.
            if (deepActiveElement()?.disabled || !deepActiveElement()) (prev.disabled ? next : prev).focus();
            this._followDetails(record);
            this._announce(title ? `${position.textContent}: ${title}` : position.textContent);
        };

        const panel = el("div", { class: "k-dt-panel k-dt-details" }, [
            el("div", { class: "k-dt-details-head" }, [
                head,
                el("button", {
                    type: "button",
                    class: "k-dt-icon-btn",
                    title: this._t.close,
                    "aria-label": this._t.close,
                    onclick: () => this._closeOverlay()
                }, [iconEl("x")])
            ]),
            position,
            body,
            actions
        ]);
        show(current, false);
        this._showOverlay(panel, anchor, returnKey, { centered: true });
    }

    // Shows the page that contains `record` and points the dialog's focus
    // return at that record's row/card.
    _followDetails(record) {
        if (this._features.pagination) {
            const page = Math.floor(this._viewData.indexOf(record) / this._state.pageSize) + 1;
            if (page !== this._state.page) {
                this._state.page = page;
                this._updateView();
                this._emitChange();
            }
        }
        const pageIndex = this._pageData.indexOf(record);
        const retarget = (key) => key?.replace(/^(cell|card|details):\d+/, (_, kind) => `${kind}:${pageIndex}`);
        this._overlayReturnKey = retarget(this._overlayReturnKey);
        this._rovingKey = retarget(this._rovingKey);
    }

    // ---- Column visibility & templates -----------------------------------

    _openColumnChooser(anchor) {
        const panel = el("div", { class: "k-dt-panel" });
        panel.appendChild(el("div", { class: "k-dt-panel-head", text: this._t.columnsPanel }));
        const list = el("div", { class: "k-dt-check-list" });
        this._columns.forEach((column) => {
            const visible = !this._state.hiddenColumns.has(column.key);
            const check = el("label", { class: "k-dt-check" }, [
                el("input", {
                    type: "checkbox",
                    checked: visible,
                    onchange: (e) => this._toggleColumn(column.key, e.target.checked)
                }),
                el("span", { class: "k-dt-check-label", text: column.label })
            ]);
            if (!this._features.columnPinning) { list.appendChild(check); return; }
            // Toggle button: constant name, state in aria-pressed.
            const pin = el("button", {
                type: "button",
                class: "k-dt-pin-toggle",
                title: this._t.pinColumn,
                "aria-label": this._t.pinColumnNamed(column.label),
                "aria-pressed": String(this._isPinned(column)),
                onclick: () => {
                    this._togglePin(column.key, !this._isPinned(column));
                    pin.setAttribute("aria-pressed", String(this._isPinned(column)));
                }
            }, [iconEl("pin")]);
            list.appendChild(el("div", { class: "k-dt-col-row" }, [check, pin]));
        });
        panel.appendChild(list);
        this._showOverlay(panel, anchor);
    }

    _toggleColumn(key, visible) {
        if (visible) this._state.hiddenColumns.delete(key);
        else this._state.hiddenColumns.add(key);
        this._render();
        this._emitChange();
        // The chooser's checkbox announces itself; the context menu needs a message.
        if (!visible && !this._overlay) {
            const column = this._columns.find((c) => c.key === key);
            this._announce(this._t.columnHidden(column?.label ?? key));
        }
    }

    async _openTemplatesMenu(anchor) {
        const panel = el("div", { class: "k-dt-panel" });
        panel.appendChild(el("div", { class: "k-dt-panel-head", text: this._t.templatesPanel }));

        const nameInput = el("input", {
            type: "text",
            class: "k-dt-input",
            placeholder: this._t.templateNamePlaceholder,
            "aria-label": this._t.templateNamePlaceholder,
            // Enter in the name field saves.
            onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); saveRow.querySelector("button").click(); } }
        });
        const saveRow = el("div", { class: "k-dt-tpl-save" }, [
            nameInput,
            el("button", {
                type: "button",
                class: "k-dt-btn k-dt-btn-primary",
                text: this._t.save,
                onclick: async () => {
                    const name = nameInput.value.trim();
                    if (!name) return;
                    await this.saveTemplate(name);
                    this._closeOverlay();
                    // Announce in the reopened panel (the old one is gone).
                    await this._openTemplatesMenu(anchor);
                    this._announce(this._t.templateSaved(name));
                }
            })
        ]);
        panel.appendChild(saveRow);

        const names = await this.listTemplates();
        const list = el("div", { class: "k-dt-tpl-list" });
        if (names.length === 0) {
            list.appendChild(el("div", { class: "k-dt-tpl-empty", text: this._t.noTemplates }));
        }
        names.forEach((name) => {
            list.appendChild(el("div", { class: "k-dt-tpl-item" }, [
                el("button", {
                    type: "button",
                    class: "k-dt-tpl-load",
                    text: name,
                    title: this._t.loadTemplate,
                    onclick: async () => {
                        await this.loadTemplate(name);
                        this._closeOverlay();
                        this._announce(this._t.templateLoaded(name));
                    }
                }),
                el("button", {
                    type: "button",
                    class: "k-dt-icon-btn",
                    title: this._t.deleteTemplate,
                    "aria-label": `${this._t.deleteTemplate}: ${name}`,
                    onclick: async () => { await this.removeTemplate(name); this._closeOverlay(); this._openTemplatesMenu(anchor); }
                }, [iconEl("trash")])
            ]));
        });
        panel.appendChild(list);
        this._showOverlay(panel, anchor);
    }

    // ---- Overlay (Panels) ------------------------------------------------

    // Panels are modal dialogs: focus moves in (to `[data-autofocus]` or the
    // first control), Tab cycles inside, Escape closes, and focus returns to
    // the opener (`returnKey`, default: the element focused at open time).
    // `centered`: a dialog in the middle of the screen (desktop) instead of a
    // popover at the anchor; on mobile every panel is a bottom sheet.
    _showOverlay(panel, anchor, returnKey = this._focusKey(), { centered = false } = {}) {
        this._closeOverlay();
        closeContextMenu();
        panel.classList.add("k-dt-overlay");
        panel.appendChild(el("div", { "data-live": "", "aria-live": "polite", "aria-atomic": "true", class: "k-dt-sr-only" }));
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-modal", "true");
        const head = panel.querySelector(".k-dt-panel-head");
        if (head) {
            head.id = uid("kdt-dlg");
            panel.setAttribute("aria-labelledby", head.id);
        }

        if (this._isMobile()) {
            // Bottom sheet: CSS handles positioning, no anchoring needed.
            panel.classList.add("k-dt-overlay--sheet");
            this.shadow.appendChild(panel);
        } else if (centered) {
            panel.classList.add("k-dt-overlay--dialog");
            this.shadow.appendChild(panel);
        } else {
            // Position synchronously so the panel can take focus right away.
            this.shadow.appendChild(panel);
            const rect = panel.getBoundingClientRect();
            const aRect = anchor && anchor.isConnected ? anchor.getBoundingClientRect() : { left: 0, top: 0, bottom: 0 };
            let left = aRect.left;
            let top = aRect.bottom + 4;
            if (left + rect.width > window.innerWidth) left = Math.max(4, window.innerWidth - rect.width - 4);
            if (top + rect.height > window.innerHeight) top = Math.max(4, aRect.top - rect.height - 4);
            panel.style.left = `${Math.max(4, left)}px`;
            panel.style.top = `${Math.max(4, top)}px`;
        }

        this._overlay = panel;
        this._overlayReturnKey = returnKey;
        this._overlayFk = anchor?.dataset?.fk ?? null;
        if (this._overlayFk) anchor.setAttribute("aria-expanded", "true");

        panel.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                this._closeOverlay();
            } else if (event.key === "Tab") {
                const focusables = this._focusables(panel);
                if (!focusables.length) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                const active = deepActiveElement();
                if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
            }
        });
        const initial = panel.querySelector("[data-autofocus]") || this._focusables(panel)[0];
        if (initial) initial.focus();
        else { panel.tabIndex = -1; panel.focus(); }

        this._overlayOutside = (event) => {
            const path = event.composedPath ? event.composedPath() : [event.target];
            if (!path.includes(panel) && !path.includes(anchor)) this._closeOverlay({ restoreFocus: false });
        };
        this._overlayKey = (event) => { if (event.key === "Escape") this._closeOverlay(); };
        setTimeout(() => {
            if (this._overlay !== panel) return;
            document.addEventListener("pointerdown", this._overlayOutside, true);
            document.addEventListener("keydown", this._overlayKey, true);
        }, 0);
    }

    _focusables(container) {
        return Array.from(container.querySelectorAll(
            'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'
        )).filter((n) => !n.disabled && n.getClientRects().length > 0);
    }

    // restoreFocus: return focus to the opener if it was inside the panel or got
    // lost (not when the user clicked elsewhere).
    _closeOverlay({ restoreFocus = true } = {}) {
        if (!this._overlay) return;
        const panel = this._overlay;
        const hadFocus = panel.contains(deepActiveElement());
        this._overlay = null;
        panel.remove();
        document.removeEventListener("pointerdown", this._overlayOutside, true);
        document.removeEventListener("keydown", this._overlayKey, true);
        if (this._overlayFk) {
            this.shadow.querySelector(`[data-fk="${CSS.escape(this._overlayFk)}"]`)?.setAttribute("aria-expanded", "false");
        }
        this._overlayFk = null;
        if (restoreFocus && (hadFocus || this._focusIsLost())) this._restoreFocus(this._overlayReturnKey);
    }

    // ---- Copy ------------------------------------------------------------

    // `shownValue`: optional value to include in the announcement.
    _copyText(text, button, shownValue) {
        // Decided at click time: a keyboard user has focus on the button.
        const buttonFocused = !!button && deepActiveElement() === button;
        const done = () => {
            const message = shownValue ? this._t.copiedValue(this._truncate(shownValue, 60)) : this._t.copied;
            if (buttonFocused && button.isConnected) {
                // Name + check icon stay until the button loses focus.
                this._confirmOnButton(button, message);
                this._setCopied(button, true);
            } else {
                this._announce(message);
                if (!button) return;
                this._setCopied(button, true);
                clearTimeout(button._copiedTimer);
                button._copiedTimer = setTimeout(() => {
                    if (button.dataset.label == null) this._setCopied(button, false);
                }, 1200);
            }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => this._fallbackCopy(text, done));
        } else {
            this._fallbackCopy(text, done);
        }
    }

    // Confirms on the focused button itself by renaming it until it loses focus.
    // Screen readers announce name changes of the focused element; unlike live
    // regions this does not depend on settings (NVDA "report dynamic content
    // changes"). Used instead of — not in addition to — the live region.
    _confirmOnButton(button, message) {
        if (button.dataset.label == null) {
            button.dataset.label = button.getAttribute("aria-label") || "";
            const onBlur = () => {
                if (this._inFallbackCopy) return;   // helper textarea took focus briefly
                button.removeEventListener("blur", onBlur);
                button.setAttribute("aria-label", button.dataset.label);
                delete button.dataset.label;
                this._setCopied(button, false);
            };
            button.addEventListener("blur", onBlur);
        }
        // A repeated copy must still change the name; a trailing period is
        // not spoken at default punctuation levels.
        const current = button.getAttribute("aria-label");
        button.setAttribute("aria-label", current === message ? `${message}.` : message);
    }

    // Visual copy confirmation: check icon + accent color.
    _setCopied(button, copied) {
        button.classList.toggle("is-copied", copied);
        button.replaceChildren(iconEl(copied ? "check" : "copy"));
    }

    // Fallback for contexts without the async Clipboard API (e.g. plain HTTP).
    // The helper textarea needs focus for execCommand; focus is put back
    // afterwards so keyboard and screen-reader users stay where they were.
    _fallbackCopy(text, done) {
        const previous = deepActiveElement();
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.readOnly = true;
        ta.setAttribute("aria-hidden", "true");
        ta.tabIndex = -1;
        ta.style.position = "fixed";
        ta.style.top = "0";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        this._inFallbackCopy = true;
        try {
            ta.focus({ preventScroll: true });
            ta.select();
            try { document.execCommand("copy"); } catch { /* ignore */ }
            ta.remove();
            if (previous && previous.isConnected && previous !== document.body) previous.focus({ preventScroll: true });
        } finally {
            this._inFallbackCopy = false;
        }
        done?.();
    }

    _copyRow(row) {
        const text = this._visibleColumns()
            .map((column) => toText(getCellValue(row, column), column, this._config.locale, row))
            .join("\t");
        this._copyText(text);
    }

    _copyColumn(column) {
        const text = this._viewData
            .map((row) => toText(getCellValue(row, column), column, this._config.locale, row))
            .join("\n");
        this._copyText(text);
    }

    // ---- State serialization & events ------------------------------------

    // Templates omit `page` (a saved view should open on page 1).
    _serializeState({ includePage = true } = {}) {
        const filters = {};
        for (const [key, filter] of Object.entries(this._state.filters)) {
            if (!isActiveFilter(filter)) continue;
            filters[key] = filter.kind === "value"
                ? { kind: "value", values: filter.values.slice() }
                : { kind: "pattern", operator: filter.operator, operand: filter.operand, operand2: filter.operand2, arity: filter.arity };
        }
        const state = {
            sort: this._state.sort.slice(),
            filters,
            globalSearch: this._state.globalSearch,
            pageSize: this._state.pageSize,
            viewMode: this._state.viewMode,
            hiddenColumns: Array.from(this._state.hiddenColumns),
            pinnedColumns: this._state.pinnedColumns.slice()
        };
        if (includePage) state.page = this._state.page;
        return state;
    }

    _deserializeFilters(filters) {
        const result = {};
        for (const [key, filter] of Object.entries(filters || {})) {
            if (filter && filter.kind) result[key] = { ...filter };
        }
        return result;
    }

    _activeFilterCount() {
        let count = Object.values(this._state.filters).filter(isActiveFilter).length;
        if (this._features.globalSearch && this._state.globalSearch) count += 1;
        return count;
    }

    _emit(name, detail) {
        this.dispatchEvent(new CustomEvent("jw-datatable:" + name, { detail, bubbles: true, composed: true }));
    }

    _emitChange() {
        this._emit("change", { state: this._serializeState() });
    }

    _truncate(text, max = 30) {
        const str = String(text);
        return str.length > max ? str.slice(0, max - 1) + "…" : str;
    }
}

if (!customElements.get("jw-datatable")) {
    customElements.define("jw-datatable", JwDataTable);
}

export { JwDataTable };
