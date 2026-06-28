// <jw-datatable> — configurable, reusable data table (Vanilla JS).
//
// Features: pagination, sorting (including multi-column), value and pattern filters,
// quick filters and actions via context menu, CSV export, grid/card view,
// links (href / SPA routing / custom handlers), per-column copy buttons,
// runtime data updates, and localStorage view templates.
//
// The convenient public API lives in `datatable.js`. This file is the Web Component itself.

import { iconSvg } from "./icons.js";
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
import { openContextMenu, closeContextMenu } from "./contextMenu.js";
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

function iconEl(name, className = "k-dt-ic") {
    return el("span", { class: className, html: iconSvg(name, name) });
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
    columnVisibility: false,
    templates: false,
    copyButtons: true
};

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
        this._debouncedSearch = debounce((value) => {
            this._state.globalSearch = value;
            this._state.page = 1;
            // Rebuild body/footer only so the focused search field is preserved.
            this._updateView();
            this._emitChange();
        }, 200);
    }

    connectedCallback() {
        if (!this._configured) return;
        if (!this._mql) this._setupResponsive();
        if (!this.shadow.firstChild) this._render();
    }

    disconnectedCallback() {
        closeContextMenu();
        this._closeOverlay();
        this._cancelLongPress();
        this._teardownResponsive();
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
            viewMode: initial.viewMode || (this._features.grid ? config.defaultView || "table" : "table"),
            hiddenColumns: new Set(
                initial.hiddenColumns || this._columns.filter((c) => c.hidden).map((c) => c.key)
            )
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
    // switches to the card/grid view below the breakpoint and back on desktop —
    // unless the developer/user pinned a view explicitly.
    _setupResponsive() {
        this._teardownResponsive();
        const r = this._config.responsive || {};
        this._responsive = {
            enabled: r.enabled !== false,
            breakpoint: typeof r.breakpoint === "number" ? r.breakpoint : 640,
            autoGridView: r.autoGridView !== false
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
        if (this._viewModeUserSet || !this._features.grid) return;
        this._state.viewMode = this._isMobileView ? "grid" : "table";
    }

    _onBreakpointChange(matches) {
        this._isMobileView = matches;
        // Transient popups computed for the previous layout are no longer valid.
        this._closeOverlay();
        closeContextMenu();

        if (!this._responsive.autoGridView || this._viewModeUserSet || !this._features.grid) return;
        const next = matches ? "grid" : "table";
        if (next !== this._state.viewMode) {
            this._state.viewMode = next;
            this._render();
            this._emitChange();
        }
    }

    _isMobile() {
        return !!this._isMobileView;
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
        await this._templateStore.save(name, this._serializeState());
    }

    async loadTemplate(name) {
        if (!this._templateStore) return;
        const data = await this._templateStore.get(name);
        if (data) this.setState(data);
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
                link,
                optionsMap
            };
        });
    }

    _featureColumn(feature, columnFlag) {
        const enabled = (this._features ? this._features[feature] : DEFAULT_FEATURES[feature]) !== false;
        return enabled && columnFlag !== false;
    }

    _visibleColumns() {
        return this._columns.filter((c) => !this._state.hiddenColumns.has(c.key));
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

        const newBody = el("div", { class: "k-dt-body", part: "body" });
        if (this._config.maxHeight) newBody.style.maxHeight = this._config.maxHeight;
        newBody.appendChild(
            this._state.viewMode === "grid" && this._features.grid ? this._renderGrid() : this._renderTable()
        );
        root.querySelector(".k-dt-body").replaceWith(newBody);

        if (this._features.pagination) {
            const newFooter = this._renderFooter();
            const oldFooter = root.querySelector(".k-dt-footer");
            if (oldFooter) oldFooter.replaceWith(newFooter);
            else root.appendChild(newFooter);
        }
    }

    // ---- Rendering -------------------------------------------------------

    _render() {
        if (!this._configured) return;
        this.shadow.innerHTML = "";
        this.shadow.appendChild(el("style", { html: datatableStyles + (this._config.styles || "") }));

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

        const body = el("div", { class: "k-dt-body", part: "body" });
        if (this._config.maxHeight) body.style.maxHeight = this._config.maxHeight;
        if (this._state.viewMode === "grid" && this._features.grid) {
            body.appendChild(this._renderGrid());
        } else {
            body.appendChild(this._renderTable());
        }
        root.appendChild(body);

        if (this._features.pagination) root.appendChild(this._renderFooter());
        this.shadow.appendChild(root);
    }

    _renderToolbar() {
        const bar = el("div", { class: "k-dt-toolbar", part: "toolbar" });
        const left = el("div", { class: "k-dt-toolbar-left" });
        const right = el("div", { class: "k-dt-toolbar-right" });

        if (this._config.title) left.appendChild(el("div", { class: "k-dt-title", text: this._config.title }));

        if (this._features.globalSearch) {
            const search = el("div", { class: "k-dt-search" }, [
                iconEl("search", "k-dt-search-ic"),
                el("input", {
                    type: "search",
                    class: "k-dt-search-input",
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
                title: this._t.clearFilters,
                onclick: () => this.clearFilters()
            }, [iconEl("x"), el("span", { text: this._t.filterCount(activeFilters) })]));
        }

        if (this._features.grid) {
            const isGrid = this._state.viewMode === "grid";
            right.appendChild(el("button", {
                type: "button",
                class: "k-dt-btn",
                title: isGrid ? this._t.tableView : this._t.gridView,
                "aria-pressed": String(isGrid),
                onclick: () => {
                    this._state.viewMode = isGrid ? "table" : "grid";
                    this._viewModeUserSet = true;
                    this._render();
                    this._emitChange();
                }
            }, [iconEl(isGrid ? "table" : "grid")]));
        }

        if (this._features.columnVisibility) {
            right.appendChild(el("button", {
                type: "button",
                class: "k-dt-btn",
                title: this._t.showHideColumns,
                onclick: (e) => this._openColumnChooser(e.currentTarget)
            }, [iconEl("columns")]));
        }

        if (this._features.templates && this._templateStore) {
            right.appendChild(el("button", {
                type: "button",
                class: "k-dt-btn",
                title: this._t.viewTemplates,
                onclick: (e) => this._openTemplatesMenu(e.currentTarget)
            }, [iconEl("save")]));
        }

        if (this._features.csvExport) {
            right.appendChild(el("button", {
                type: "button",
                class: "k-dt-btn",
                title: this._t.exportCsv,
                onclick: () => this.exportCSV()
            }, [iconEl("download")]));
        }

        bar.appendChild(left);
        bar.appendChild(right);
        return bar;
    }

    _renderTable() {
        const wrap = el("div", { class: "k-dt-scroll" });
        const table = el("table", { class: "k-dt-table", part: "table" });
        const columns = this._visibleColumns();

        // Header
        const thead = el("thead");
        const headRow = el("tr");
        columns.forEach((column) => headRow.appendChild(this._renderHeaderCell(column)));
        thead.appendChild(headRow);
        table.appendChild(thead);

        // Body
        const tbody = el("tbody");
        if (this._pageData.length === 0) {
            const message = this._sourceData.length === 0 ? this._config.emptyText : this._config.noResultsText;
            tbody.appendChild(el("tr", {}, [
                el("td", { class: "k-dt-empty", colspan: String(columns.length || 1) }, [message])
            ]));
        } else {
            this._pageData.forEach((row, index) => tbody.appendChild(this._renderRow(row, index, columns)));
        }
        table.appendChild(tbody);
        wrap.appendChild(table);
        return wrap;
    }

    _renderHeaderCell(column) {
        const sortIndex = this._state.sort.findIndex((s) => s.key === column.key);
        const sort = sortIndex >= 0 ? this._state.sort[sortIndex] : null;
        const ariaSort = sort ? (sort.direction === "asc" ? "ascending" : "descending") : "none";

        const th = el("th", {
            class: "k-dt-th k-dt-align-" + column.align,
            scope: "col",
            "aria-sort": ariaSort,
            style: column.width ? `width:${column.width};` : null
        });

        const inner = el("div", { class: "k-dt-th-inner" });
        const labelBtn = el(column.sortable ? "button" : "span", {
            class: "k-dt-th-label",
            type: column.sortable ? "button" : null,
            title: column.sortable ? this._t.sortHint : null,
            onclick: column.sortable
                ? (e) => this._applySort(column.key, { additive: e.shiftKey && this._features.multiSort })
                : null
        }, [el("span", { text: column.label })]);

        if (column.sortable) {
            const icon = sort ? (sort.direction === "asc" ? "arrowUp" : "arrowDown") : "arrowUpDown";
            const ind = iconEl(icon, "k-dt-sort-ic" + (sort ? " is-active" : ""));
            labelBtn.appendChild(ind);
            if (sort && this._state.sort.length > 1) {
                labelBtn.appendChild(el("span", { class: "k-dt-sort-rank", text: String(sortIndex + 1) }));
            }
        }
        inner.appendChild(labelBtn);

        if (column.filterable) {
            const active = isActiveFilter(this._state.filters[column.key]);
            inner.appendChild(el("button", {
                type: "button",
                class: "k-dt-filter-btn" + (active ? " is-active" : ""),
                title: active ? this._t.filterActive : this._t.filter,
                "aria-label": this._t.filterAriaLabel,
                onclick: (e) => this._openFilterPanel(column, e.currentTarget)
            }, [iconEl("filter")]));
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
        if (typeof this._config.onRowClick === "function") {
            tr.classList.add("k-dt-clickable");
            tr.addEventListener("click", () => {
                if (this._shouldSuppressClick()) return;
                this._config.onRowClick(row, index);
            });
        }
        columns.forEach((column) => tr.appendChild(this._renderCell(column, row, index)));
        return tr;
    }

    _renderCell(column, row, index) {
        const value = getCellValue(row, column);
        const td = el("td", { class: "k-dt-td k-dt-align-" + column.align });
        if (typeof column.cellClass === "function") {
            const cls = column.cellClass(value, row);
            if (cls) td.classList.add(...String(cls).split(/\s+/));
        }

        const content = el("div", { class: "k-dt-cell" }, [this._valueNode(column, row, value)]);
        if (column.copyable) content.appendChild(this._copyButton(column, row, value));
        td.appendChild(content);

        this._bindContextTrigger(td, () => ({ column, row, value }));
        if (typeof this._config.onCellClick === "function") {
            td.addEventListener("click", () => {
                if (this._shouldSuppressClick()) return;
                this._config.onCellClick(value, row, column);
            });
        }
        return td;
    }

    // Builds the display node including link logic (href / SPA / custom handler).
    _valueNode(column, row, value) {
        const display = formatValue(value, column, this._config.locale, row);
        const content = display instanceof Node ? display : document.createTextNode(display);

        const link = column.link;
        if (link && (link.url || link.spa || typeof link.handler === "function")) {
            const href = typeof link.url === "function" ? link.url(row, value) : (typeof link.url === "string" ? link.url : null);
            const anchor = el("a", { class: "k-dt-link", href: href || "#" });
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
            const btn = el("button", { type: "button", class: "k-dt-cell-action" });
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

    _copyButton(column, row, value) {
        return el("button", {
            type: "button",
            class: "k-dt-copy",
            title: this._t.copyValue,
            "aria-label": this._t.copyValue,
            onclick: (e) => {
                e.stopPropagation();
                this._copyText(toText(value, column, this._config.locale, row), e.currentTarget);
            }
        }, [iconEl("copy")]);
    }

    _renderGrid() {
        const columns = this._visibleColumns();
        const grid = el("div", { class: "k-dt-grid", part: "grid" });
        const min = (this._config.grid && this._config.grid.minWidth) || "240px";
        grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${min}, 1fr))`;

        if (this._pageData.length === 0) {
            const message = this._sourceData.length === 0 ? this._config.emptyText : this._config.noResultsText;
            grid.appendChild(el("div", { class: "k-dt-empty", text: message }));
            return grid;
        }

        const titleKey = this._config.grid && this._config.grid.titleColumn;
        this._pageData.forEach((row, index) => {
            const card = el("div", { class: "k-dt-card", part: "card" });
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
                    this._valueNode(titleColumn, row, getCellValue(row, titleColumn))
                ]));
            }
            columns.forEach((column) => {
                if (titleColumn && column.key === titleColumn.key) return;
                const value = getCellValue(row, column);
                const valWrap = el("span", { class: "k-dt-card-val" }, [this._valueNode(column, row, value)]);
                if (column.copyable) valWrap.appendChild(this._copyButton(column, row, value));
                const cardRow = el("div", { class: "k-dt-card-row" }, [
                    el("span", { class: "k-dt-card-label", text: column.label }),
                    valWrap
                ]);
                card.appendChild(cardRow);
            });
            this._bindContextTrigger(card, () => ({ column: columns[0], row, value: getCellValue(row, columns[0]) }));
            grid.appendChild(card);
        });
        return grid;
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
                "aria-label": this._t.rowsPerPage,
                onchange: (e) => {
                    this._state.pageSize = Number(e.target.value);
                    this._state.page = 1;
                    this._deriveAndRenderBody();
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
            title: label,
            "aria-label": label,
            disabled,
            onclick: () => this._goToPage(target)
        }, [iconEl(icon)]);

        nav.appendChild(navBtn("chevronsLeft", this._t.firstPage, 1, page <= 1));
        nav.appendChild(navBtn("chevronLeft", this._t.prevPage, page - 1, page <= 1));

        this._pageItems(page, pageCount).forEach((item) => {
            if (item === "…") {
                nav.appendChild(el("span", { class: "k-dt-page-gap", text: "…" }));
            } else {
                nav.appendChild(el("button", {
                    type: "button",
                    class: "k-dt-page-btn k-dt-page-num" + (item === page ? " is-active" : ""),
                    "aria-current": item === page ? "page" : null,
                    text: String(item),
                    onclick: () => this._goToPage(item)
                }));
            }
        });

        nav.appendChild(navBtn("chevronRight", this._t.nextPage, page + 1, page >= pageCount));
        nav.appendChild(navBtn("chevronsRight", this._t.lastPage, pageCount, page >= pageCount));

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
    }

    // ---- Sorting ---------------------------------------------------------

    _applySort(key, options) {
        this._state.sort = toggleSort(this._state.sort, key, options);
        this._state.page = 1;
        this._deriveAndRenderBody();
    }

    _setSortDirection(key, direction, additive = false) {
        const rest = additive ? this._state.sort.filter((s) => s.key !== key) : [];
        this._state.sort = direction ? [...rest, { key, direction }] : rest;
        this._state.page = 1;
        this._deriveAndRenderBody();
    }

    // ---- Context menu ----------------------------------------------------

    // Opens the context menu via right-click (desktop) or long-press (touch).
    // `getArgs` returns { column, row, value } lazily so cells share one binder.
    _bindContextTrigger(node, getArgs) {
        if (!this._features.contextMenu) return;

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
        const group = typeGroup(column.type);

        if (column.sortable) {
            items.push({ label: this._t.sortAsc, icon: "arrowUp", onSelect: () => this._setSortDirection(column.key, "asc") });
            items.push({ label: this._t.sortDesc, icon: "arrowDown", onSelect: () => this._setSortDirection(column.key, "desc") });
            if (this._features.multiSort) {
                items.push({ label: this._t.addSortKey, icon: "arrowUpDown", onSelect: () => this._setSortDirection(column.key, "asc", true) });
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
                    label: `Filter by “${this._truncate(label)}”`,
                    icon: "filter",
                    onSelect: () => this._setFilter(column.key, { kind: "value", values: [value] })
                });
                if (group === "text" || group === "number") {
                    items.push({
                        label: `Exclude “${this._truncate(label)}”`,
                        icon: "x",
                        onSelect: () => this._setFilter(column.key, { kind: "pattern", operator: "notEquals", operand: label, arity: 1 })
                    });
                }
            }
            items.push({ label: this._t.openFilter, icon: "filter", onSelect: () => this._openFilterPanel(column, event.target) });
            if (isActiveFilter(this._state.filters[column.key])) {
                items.push({ label: this._t.clearColumnFilter, icon: "x", onSelect: () => this._setFilter(column.key, null) });
            }
            items.push({ separator: true });
        }

        if (row) {
            items.push({ label: this._t.copyCell, icon: "copy", onSelect: () => this._copyText(toText(value, column, this._config.locale, row)) });
            items.push({ label: this._t.copyRow, icon: "copy", onSelect: () => this._copyRow(row) });
        }
        if (this._features.csvExport) {
            items.push({ label: this._t.copyColumn, icon: "copy", onSelect: () => this._copyColumn(column) });
        }

        if (this._features.columnVisibility) {
            items.push({ separator: true });
            items.push({ label: this._t.hideColumn, icon: "columns", onSelect: () => this._toggleColumn(column.key, false) });
        }

        if (this._features.csvExport) {
            items.push({ separator: true });
            items.push({ label: this._t.exportCsv, icon: "download", onSelect: () => this.exportCSV() });
        }

        openContextMenu(this.shadow, { x: event.clientX, y: event.clientY, items, sheet: this._isMobile() });
    }

    // ---- Filter panel ----------------------------------------------------

    _openFilterPanel(column, anchor) {
        closeContextMenu();
        const panel = this._buildFilterPanel(column);
        this._showOverlay(panel, anchor);
    }

    _buildFilterPanel(column) {
        const existing = this._state.filters[column.key] || null;
        const group = typeGroup(column.type);
        let mode = existing ? existing.kind : (group === "text" ? "value" : "pattern");

        const panel = el("div", { class: "k-dt-panel" });
        panel.appendChild(el("div", { class: "k-dt-panel-head", text: this._t.filterPanelTitle(column.label) }));

        const tabs = el("div", { class: "k-dt-tabs" });
        const valueTab = el("button", { type: "button", class: "k-dt-tab", text: this._t.valuesTab });
        const patternTab = el("button", { type: "button", class: "k-dt-tab", text: this._t.patternTab });
        tabs.appendChild(valueTab);
        tabs.appendChild(patternTab);
        panel.appendChild(tabs);

        const bodyValue = this._buildValueFilter(column, existing);
        const bodyPattern = this._buildPatternFilter(column, existing);
        panel.appendChild(bodyValue.el);
        panel.appendChild(bodyPattern.el);

        const setMode = (next) => {
            mode = next;
            valueTab.classList.toggle("is-active", next === "value");
            patternTab.classList.toggle("is-active", next === "pattern");
            bodyValue.el.style.display = next === "value" ? "" : "none";
            bodyPattern.el.style.display = next === "pattern" ? "" : "none";
        };
        valueTab.addEventListener("click", () => setMode("value"));
        patternTab.addEventListener("click", () => setMode("pattern"));
        setMode(mode);

        const actions = el("div", { class: "k-dt-panel-actions" }, [
            el("button", {
                type: "button",
                class: "k-dt-btn",
                text: this._t.reset,
                onclick: () => { this._setFilter(column.key, null); this._closeOverlay(); }
            }),
            el("button", {
                type: "button",
                class: "k-dt-btn k-dt-btn-primary",
                text: this._t.apply,
                onclick: () => {
                    const filter = mode === "value" ? bodyValue.collect() : bodyPattern.collect();
                    this._setFilter(column.key, filter);
                    this._closeOverlay();
                }
            })
        ]);
        panel.appendChild(actions);
        return panel;
    }

    _buildValueFilter(column, existing) {
        const container = el("div", { class: "k-dt-filter-body" });
        const values = distinctValues(this._sourceData, column, this._config.locale);
        const selected = new Set(
            existing && existing.kind === "value" ? existing.values.map((v) => String(v)) : values.map((v) => String(v.value))
        );

        const search = el("input", {
            type: "search",
            class: "k-dt-input",
            placeholder: this._t.searchValues,
            oninput: (e) => {
                const q = e.target.value.toLowerCase();
                list.querySelectorAll(".k-dt-check").forEach((label) => {
                    label.style.display = label.dataset.label.includes(q) ? "" : "none";
                });
            }
        });
        container.appendChild(search);

        const toggleAll = el("label", { class: "k-dt-check k-dt-check-all" }, [
            el("input", {
                type: "checkbox",
                checked: selected.size === values.length,
                onchange: (e) => {
                    list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
                        if (cb.closest(".k-dt-check").style.display === "none") return;
                        cb.checked = e.target.checked;
                    });
                }
            }),
            el("span", { text: this._t.selectAll })
        ]);
        container.appendChild(toggleAll);

        const list = el("div", { class: "k-dt-check-list" });
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

        return {
            el: container,
            collect: () => {
                const chosen = [];
                list.querySelectorAll(".k-dt-check").forEach((label) => {
                    const cb = label.querySelector('input[type="checkbox"]');
                    if (cb.checked) {
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

        const select = el("select", {
            class: "k-dt-select",
            onchange: () => renderOperands()
        }, operators.map((op) => el("option", { value: op.id, text: this._t.operators[op.id] ?? op.label, selected: current && current.operator === op.id })));

        const renderOperands = () => {
            const meta = operatorMeta(column.type, select.value);
            const arity = meta ? meta.arity : 1;
            operandWrap.innerHTML = "";
            if (arity >= 1) operandWrap.appendChild(operand1);
            if (arity >= 2) operandWrap.appendChild(operand2);
        };
        renderOperands();

        container.appendChild(el("label", { class: "k-dt-field-label", text: this._t.condition }));
        container.appendChild(select);
        container.appendChild(operandWrap);

        return {
            el: container,
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
    }

    // ---- Column visibility & templates -----------------------------------

    _openColumnChooser(anchor) {
        const panel = el("div", { class: "k-dt-panel" });
        panel.appendChild(el("div", { class: "k-dt-panel-head", text: this._t.columnsPanel }));
        const list = el("div", { class: "k-dt-check-list" });
        this._columns.forEach((column) => {
            const visible = !this._state.hiddenColumns.has(column.key);
            list.appendChild(el("label", { class: "k-dt-check" }, [
                el("input", {
                    type: "checkbox",
                    checked: visible,
                    onchange: (e) => this._toggleColumn(column.key, e.target.checked)
                }),
                el("span", { class: "k-dt-check-label", text: column.label })
            ]));
        });
        panel.appendChild(list);
        this._showOverlay(panel, anchor);
    }

    _toggleColumn(key, visible) {
        if (visible) this._state.hiddenColumns.delete(key);
        else this._state.hiddenColumns.add(key);
        this._render();
        this._emitChange();
    }

    async _openTemplatesMenu(anchor) {
        const panel = el("div", { class: "k-dt-panel" });
        panel.appendChild(el("div", { class: "k-dt-panel-head", text: this._t.templatesPanel }));

        const nameInput = el("input", { type: "text", class: "k-dt-input", placeholder: this._t.templateNamePlaceholder });
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
                    this._openTemplatesMenu(anchor);
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
                    onclick: async () => { await this.loadTemplate(name); this._closeOverlay(); }
                }),
                el("button", {
                    type: "button",
                    class: "k-dt-icon-btn",
                    title: this._t.deleteTemplate,
                    "aria-label": this._t.deleteTemplate,
                    onclick: async () => { await this.removeTemplate(name); this._closeOverlay(); this._openTemplatesMenu(anchor); }
                }, [iconEl("trash")])
            ]));
        });
        panel.appendChild(list);
        this._showOverlay(panel, anchor);
    }

    // ---- Overlay (Panels) ------------------------------------------------

    _showOverlay(panel, anchor) {
        this._closeOverlay();
        closeContextMenu();
        panel.classList.add("k-dt-overlay");

        if (this._isMobile()) {
            // Bottom sheet: CSS handles positioning, no anchoring needed.
            panel.classList.add("k-dt-overlay--sheet");
            this.shadow.appendChild(panel);
        } else {
            panel.style.visibility = "hidden";
            this.shadow.appendChild(panel);
            requestAnimationFrame(() => {
                const rect = panel.getBoundingClientRect();
                const aRect = anchor ? anchor.getBoundingClientRect() : { left: 0, bottom: 0, right: 0 };
                let left = aRect.left;
                let top = aRect.bottom + 4;
                if (left + rect.width > window.innerWidth) left = Math.max(4, window.innerWidth - rect.width - 4);
                if (top + rect.height > window.innerHeight) top = Math.max(4, aRect.top - rect.height - 4);
                panel.style.left = `${Math.max(4, left)}px`;
                panel.style.top = `${Math.max(4, top)}px`;
                panel.style.visibility = "visible";
            });
        }

        this._overlay = panel;
        this._overlayOutside = (event) => {
            const path = event.composedPath ? event.composedPath() : [event.target];
            if (!path.includes(panel) && event.target !== anchor) this._closeOverlay();
        };
        this._overlayKey = (event) => { if (event.key === "Escape") this._closeOverlay(); };
        setTimeout(() => {
            document.addEventListener("pointerdown", this._overlayOutside, true);
            document.addEventListener("keydown", this._overlayKey, true);
        }, 0);
    }

    _closeOverlay() {
        if (!this._overlay) return;
        this._overlay.remove();
        this._overlay = null;
        document.removeEventListener("pointerdown", this._overlayOutside, true);
        document.removeEventListener("keydown", this._overlayKey, true);
    }

    // ---- Copy ------------------------------------------------------------

    _copyText(text, button) {
        const done = () => {
            if (!button) return;
            button.classList.add("is-copied");
            setTimeout(() => button.classList.remove("is-copied"), 900);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => this._fallbackCopy(text, done));
        } else {
            this._fallbackCopy(text, done);
        }
    }

    _fallbackCopy(text, done) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch { /* ignore */ }
        ta.remove();
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

    _serializeState() {
        const filters = {};
        for (const [key, filter] of Object.entries(this._state.filters)) {
            if (!isActiveFilter(filter)) continue;
            filters[key] = filter.kind === "value"
                ? { kind: "value", values: filter.values.slice() }
                : { kind: "pattern", operator: filter.operator, operand: filter.operand, operand2: filter.operand2, arity: filter.arity };
        }
        return {
            sort: this._state.sort.slice(),
            filters,
            globalSearch: this._state.globalSearch,
            pageSize: this._state.pageSize,
            viewMode: this._state.viewMode,
            hiddenColumns: Array.from(this._state.hiddenColumns)
        };
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
