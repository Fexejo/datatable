// jw-datatable styles as a string (injected into the shadow root).
// Uses global design tokens (--k-*) with fallbacks so the component works without main.css.
// Extra CSS via `config.styles`; style elements via `part` (root, toolbar, table, grid, card, footer).

export const datatableStyles = `
:host {
    display: block;
    font-family: var(--k-font-family-base, system-ui, sans-serif);
    color: var(--k-color-text, #222);
    --k-dt-border: var(--k-color-border, #d8d8d8);
    --k-dt-surface: var(--k-color-surface, #f0f0f0);
    --k-dt-surface-muted: var(--k-color-surface-muted, #f8f8f8);
    --k-dt-hover: var(--k-color-hover, #e8e8e8);
    --k-dt-accent: var(--k-color-schicht-meine-bg, #1f7a3a);
    --k-dt-accent-text: var(--k-color-schicht-meine-text, #fff);
}
* { box-sizing: border-box; }

.k-dt {
    border: 1px solid var(--k-dt-border);
    border-radius: var(--k-radius-l, 12px);
    background: var(--k-color-page, #fff);
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

/* Toolbar */
.k-dt-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--k-space-s, 8px);
    padding: var(--k-space-s, 8px) var(--k-space-l, 12px);
    background: var(--k-dt-surface-muted);
    border-bottom: 1px solid var(--k-dt-border);
    flex-wrap: wrap;
}
.k-dt-toolbar-left, .k-dt-toolbar-right {
    display: flex;
    align-items: center;
    gap: var(--k-space-s, 8px);
    flex-wrap: wrap;
}
.k-dt-title { font-weight: 700; font-size: 1.05rem; }

.k-dt-search {
    display: flex;
    align-items: center;
    gap: var(--k-space-2xs, 4px);
    background: var(--k-color-page, #fff);
    border: 1px solid var(--k-dt-border);
    border-radius: var(--k-radius-s, 8px);
    padding: 0 var(--k-space-s, 8px);
}
.k-dt-search-ic { color: var(--k-color-text-muted, #888); display: inline-flex; }
.k-dt-search-input {
    font: inherit;
    color: inherit;
    border: none;
    background: transparent;
    padding: var(--k-space-s, 8px) var(--k-space-2xs, 4px);
    min-width: 180px;
    outline: none;
}

/* Buttons */
.k-dt-btn, .k-dt-icon-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--k-space-2xs, 4px);
    font: inherit;
    cursor: pointer;
    color: var(--k-color-text, #222);
    background: var(--k-color-page, #fff);
    border: 1px solid var(--k-dt-border);
    border-radius: var(--k-radius-s, 8px);
    padding: var(--k-space-xs, 6px) var(--k-space-s, 8px);
    min-height: 36px;
}
.k-dt-btn:hover, .k-dt-icon-btn:hover { background: var(--k-dt-hover); }
.k-dt-btn:focus-visible, .k-dt-icon-btn:focus-visible,
.k-dt-page-btn:focus-visible, .k-dt-th-label:focus-visible,
.k-dt-filter-btn:focus-visible, .k-dt-copy:focus-visible {
    outline: 2px solid var(--k-color-text, #222);
    outline-offset: 1px;
}
.k-dt-btn-primary {
    background: var(--k-dt-accent);
    border-color: var(--k-dt-accent);
    color: var(--k-dt-accent-text);
}
.k-dt-icon-btn { padding: var(--k-space-xs, 6px); }
.k-dt-ic { display: inline-flex; line-height: 0; }
.k-dt-ic svg, .k-dt-search-ic svg {
    width: 1.1em; height: 1.1em;
    fill: none; stroke: currentColor;
    stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
}

/* Table */
.k-dt-body { overflow: auto; }
.k-dt-scroll { min-width: 100%; }
.k-dt-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92rem;
}
.k-dt-th, .k-dt-td {
    text-align: left;
    padding: var(--k-space-s, 8px) var(--k-space-l, 12px);
    border-bottom: 1px solid var(--k-dt-border);
    vertical-align: top;
}
.k-dt-align-right { text-align: right; }
.k-dt-align-center { text-align: center; }
.k-dt-th {
    position: sticky;
    top: 0;
    background: var(--k-dt-surface);
    z-index: 1;
    white-space: nowrap;
    font-weight: 700;
}
.k-dt-th-inner { display: flex; align-items: center; gap: var(--k-space-2xs, 4px); justify-content: inherit; }
.k-dt-align-right .k-dt-th-inner { flex-direction: row-reverse; }
.k-dt-th-label {
    display: inline-flex;
    align-items: center;
    gap: var(--k-space-2xs, 4px);
    font: inherit;
    font-weight: 700;
    color: inherit;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
}
span.k-dt-th-label { cursor: default; }
.k-dt-sort-ic { opacity: 0.35; }
.k-dt-sort-ic.is-active { opacity: 1; color: var(--k-dt-accent); }
.k-dt-sort-rank {
    font-size: 0.7rem;
    background: var(--k-dt-accent);
    color: var(--k-dt-accent-text);
    border-radius: 999px;
    padding: 0 5px;
    line-height: 1.4;
}
.k-dt-filter-btn {
    display: inline-flex;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--k-color-text-muted, #888);
    padding: 2px;
    border-radius: var(--k-radius-s, 8px);
}
.k-dt-filter-btn:hover { background: var(--k-dt-hover); color: var(--k-color-text, #222); }
.k-dt-filter-btn.is-active { color: var(--k-dt-accent); }

.k-dt-tr:hover .k-dt-td { background: var(--k-dt-surface-muted); }
.k-dt-clickable { cursor: pointer; }
.k-dt-cell { display: flex; align-items: center; gap: var(--k-space-xs, 6px); justify-content: inherit; }
.k-dt-align-right .k-dt-cell { flex-direction: row-reverse; }
.k-dt-value { overflow-wrap: anywhere; }
.k-dt-link { color: var(--k-dt-accent); text-decoration: none; }
.k-dt-link:hover { text-decoration: underline; }
.k-dt-cell-action {
    font: inherit; color: var(--k-dt-accent);
    background: none; border: none; cursor: pointer; padding: 0; text-align: inherit;
}
.k-dt-cell-action:hover { text-decoration: underline; }

.k-dt-copy {
    display: inline-flex;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--k-color-text-muted, #888);
    opacity: 0;
    padding: 2px;
    border-radius: var(--k-radius-s, 8px);
    transition: opacity 0.1s;
}
.k-dt-td:hover .k-dt-copy, .k-dt-card-row:hover .k-dt-copy { opacity: 0.7; }
.k-dt-copy:hover { opacity: 1; background: var(--k-dt-hover); }
.k-dt-copy.is-copied { color: var(--k-dt-accent); opacity: 1; }

.k-dt-empty {
    text-align: center;
    color: var(--k-color-text-muted, #888);
    padding: var(--k-space-4xl, 24px);
}

/* Grid / card view */
.k-dt-grid {
    display: grid;
    gap: var(--k-space-l, 12px);
    padding: var(--k-space-l, 12px);
}
.k-dt-card {
    border: 1px solid var(--k-dt-border);
    border-radius: var(--k-radius-m, 10px);
    padding: var(--k-space-l, 12px);
    background: var(--k-color-page, #fff);
    display: flex;
    flex-direction: column;
    gap: var(--k-space-2xs, 4px);
}
.k-dt-card-title { font-weight: 700; font-size: 1.05rem; margin-bottom: var(--k-space-2xs, 4px); }
.k-dt-card-row { display: flex; justify-content: space-between; gap: var(--k-space-s, 8px); font-size: 0.9rem; }
.k-dt-card-label { color: var(--k-color-text-muted, #888); }
.k-dt-card-val { display: inline-flex; align-items: center; gap: var(--k-space-2xs, 4px); text-align: right; }

/* Footer / Pagination */
.k-dt-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--k-space-s, 8px);
    padding: var(--k-space-s, 8px) var(--k-space-l, 12px);
    border-top: 1px solid var(--k-dt-border);
    background: var(--k-dt-surface-muted);
    flex-wrap: wrap;
    font-size: 0.88rem;
}
.k-dt-info { display: flex; align-items: center; gap: var(--k-space-l, 12px); color: var(--k-color-text-muted, #888); }
.k-dt-pagesize { display: flex; align-items: center; gap: var(--k-space-2xs, 4px); }
.k-dt-select {
    font: inherit;
    color: inherit;
    background: var(--k-color-page, #fff);
    border: 1px solid var(--k-dt-border);
    border-radius: var(--k-radius-s, 8px);
    padding: var(--k-space-2xs, 4px) var(--k-space-xs, 6px);
}
.k-dt-pager { display: flex; align-items: center; gap: 2px; }
.k-dt-page-btn {
    min-width: 34px;
    min-height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font: inherit;
    cursor: pointer;
    color: var(--k-color-text, #222);
    background: var(--k-color-page, #fff);
    border: 1px solid var(--k-dt-border);
    border-radius: var(--k-radius-s, 8px);
    padding: 0 var(--k-space-xs, 6px);
}
.k-dt-page-btn:hover:not(:disabled) { background: var(--k-dt-hover); }
.k-dt-page-btn:disabled { opacity: 0.4; cursor: default; }
.k-dt-page-btn.is-active {
    background: var(--k-dt-accent);
    border-color: var(--k-dt-accent);
    color: var(--k-dt-accent-text);
}
.k-dt-page-gap { padding: 0 var(--k-space-2xs, 4px); color: var(--k-color-text-muted, #888); }

/* Context menu */
.k-ctx-menu {
    position: fixed;
    z-index: 1000;
    min-width: 200px;
    background: var(--k-color-page, #fff);
    border: 1px solid var(--k-dt-border);
    border-radius: var(--k-radius-m, 10px);
    box-shadow: 0 10px 30px rgba(0,0,0,0.18);
    padding: var(--k-space-2xs, 4px);
    display: flex;
    flex-direction: column;
}
.k-ctx-item {
    display: flex;
    align-items: center;
    gap: var(--k-space-s, 8px);
    width: 100%;
    font: inherit;
    text-align: left;
    color: var(--k-color-text, #222);
    background: none;
    border: none;
    border-radius: var(--k-radius-s, 8px);
    padding: var(--k-space-xs, 6px) var(--k-space-s, 8px);
    cursor: pointer;
}
.k-ctx-item:hover, .k-ctx-item:focus-visible { background: var(--k-dt-hover); outline: none; }
.k-ctx-item[aria-disabled="true"] { opacity: 0.4; cursor: default; }
.k-ctx-danger { color: var(--k-color-schicht-vertretung-bg, #c0392b); }
.k-ctx-icon { display: inline-flex; width: 1.1em; }
.k-ctx-icon svg { width: 1.1em; height: 1.1em; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.k-ctx-label { flex: 1; }
.k-ctx-arrow { color: var(--k-color-text-muted, #888); }
.k-ctx-sep { height: 1px; background: var(--k-dt-border); margin: var(--k-space-2xs, 4px) 0; }
.k-ctx-haschild { position: relative; }
.k-ctx-haschild > .k-ctx-submenu {
    position: absolute;
    left: 100%;
    top: 0;
    display: none;
}
.k-ctx-haschild:hover > .k-ctx-submenu { display: flex; }

/* Filter / columns / templates panel */
.k-dt-overlay {
    position: fixed;
    z-index: 1000;
    width: 280px;
    max-height: 70vh;
    overflow: auto;
    background: var(--k-color-page, #fff);
    border: 1px solid var(--k-dt-border);
    border-radius: var(--k-radius-m, 10px);
    box-shadow: 0 10px 30px rgba(0,0,0,0.18);
    padding: var(--k-space-l, 12px);
    display: flex;
    flex-direction: column;
    gap: var(--k-space-s, 8px);
}
.k-dt-panel-head { font-weight: 700; }
.k-dt-tabs { display: flex; gap: var(--k-space-2xs, 4px); }
.k-dt-tab {
    flex: 1;
    font: inherit;
    cursor: pointer;
    background: var(--k-dt-surface-muted);
    color: inherit;
    border: 1px solid var(--k-dt-border);
    border-radius: var(--k-radius-s, 8px);
    padding: var(--k-space-2xs, 4px) var(--k-space-s, 8px);
}
.k-dt-tab.is-active { background: var(--k-dt-accent); border-color: var(--k-dt-accent); color: var(--k-dt-accent-text); }
.k-dt-filter-body { display: flex; flex-direction: column; gap: var(--k-space-s, 8px); }
.k-dt-field-label { font-size: 0.85rem; font-weight: 600; }
.k-dt-input, .k-dt-overlay .k-dt-select {
    font: inherit;
    color: inherit;
    width: 100%;
    background: var(--k-color-page, #fff);
    border: 1px solid var(--k-dt-border);
    border-radius: var(--k-radius-s, 8px);
    padding: var(--k-space-s, 8px);
}
.k-dt-operands { display: flex; flex-direction: column; gap: var(--k-space-xs, 6px); }
.k-dt-check-list { display: flex; flex-direction: column; max-height: 220px; overflow: auto; gap: 2px; }
.k-dt-check {
    display: flex;
    align-items: center;
    gap: var(--k-space-s, 8px);
    padding: var(--k-space-2xs, 4px) var(--k-space-2xs, 4px);
    border-radius: var(--k-radius-s, 8px);
    cursor: pointer;
}
.k-dt-check:hover { background: var(--k-dt-hover); }
.k-dt-check-all { font-weight: 600; border-bottom: 1px solid var(--k-dt-border); }
.k-dt-check-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.k-dt-check-count { color: var(--k-color-text-muted, #888); font-size: 0.8rem; }
.k-dt-panel-actions { display: flex; justify-content: flex-end; gap: var(--k-space-s, 8px); }
.k-dt-tpl-save { display: flex; gap: var(--k-space-2xs, 4px); }
.k-dt-tpl-list { display: flex; flex-direction: column; gap: 2px; }
.k-dt-tpl-item { display: flex; align-items: center; gap: var(--k-space-2xs, 4px); }
.k-dt-tpl-load {
    flex: 1; text-align: left; font: inherit; cursor: pointer;
    background: none; border: none; color: inherit;
    padding: var(--k-space-xs, 6px) var(--k-space-s, 8px); border-radius: var(--k-radius-s, 8px);
}
.k-dt-tpl-load:hover { background: var(--k-dt-hover); }
.k-dt-tpl-empty { color: var(--k-color-text-muted, #888); font-size: 0.88rem; }
`;
