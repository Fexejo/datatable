// jw-datatable styles as a string (injected into the shadow root).
//
// Mobile First: the base rules target small / touch screens (compact spacing,
// 44px touch targets, always-visible copy buttons, stacked toolbar & footer).
// The `@media (min-width: 640px)` block then layers on the roomier desktop
// experience (more padding, hover-reveal copy buttons, inline pagination).
// Overlays and the context menu use explicit `--sheet` modifiers (toggled from
// JS via matchMedia) so they turn into bottom sheets on phones.
//
// Uses global design tokens (--k-*) with fallbacks so the component works without main.css.
// Extra CSS via `config.styles`; style elements via `part` (root, toolbar, table, grid, card, footer).

export const datatableStyles = `
:host {
    display: block;
    /* As a flex/grid item, shrink to the track and scroll inside instead of
       stretching the layout to the table's width. */
    min-width: 0;
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

/* Toolbar — base: stacked, full-width search */
.k-dt-toolbar {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--k-space-s, 8px);
    padding: var(--k-space-s, 8px);
    background: var(--k-dt-surface-muted);
    border-bottom: 1px solid var(--k-dt-border);
}
.k-dt-toolbar-left, .k-dt-toolbar-right {
    display: flex;
    align-items: center;
    gap: var(--k-space-s, 8px);
    flex-wrap: wrap;
    width: 100%;
}
.k-dt-toolbar-right { justify-content: flex-end; }
.k-dt-title { font-weight: 700; font-size: 1rem; margin-right: auto; }

.k-dt-search {
    display: flex;
    align-items: center;
    gap: var(--k-space-2xs, 4px);
    width: 100%;
    background: var(--k-color-page, #fff);
    border: 1px solid var(--k-dt-border);
    border-radius: var(--k-radius-s, 8px);
    padding: 0 var(--k-space-s, 8px);
}
.k-dt-search-ic { color: var(--k-color-text-muted, #666); display: inline-flex; }
.k-dt-search-input {
    font: inherit;
    color: inherit;
    border: none;
    background: transparent;
    padding: var(--k-space-s, 8px) var(--k-space-2xs, 4px);
    flex: 1;
    min-width: 0;
    width: 100%;
    outline: none;
}

/* Buttons — base: 44px touch targets */
.k-dt-btn, .k-dt-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--k-space-2xs, 4px);
    font: inherit;
    cursor: pointer;
    color: var(--k-color-text, #222);
    background: var(--k-color-page, #fff);
    border: 1px solid var(--k-dt-border);
    border-radius: var(--k-radius-s, 8px);
    padding: var(--k-space-s, 8px);
    min-height: 44px;
    min-width: 44px;
}
.k-dt-btn:hover, .k-dt-icon-btn:hover { background: var(--k-dt-hover); }
.k-dt-btn:active, .k-dt-icon-btn:active { background: var(--k-dt-hover); }
.k-dt-btn:focus-visible, .k-dt-icon-btn:focus-visible,
.k-dt-page-btn:focus-visible, .k-dt-th-label:focus-visible,
.k-dt-filter-btn:focus-visible, .k-dt-pin-btn:focus-visible,
.k-dt-pin-toggle:focus-visible, .k-dt-details-btn:focus-visible, .k-dt-copy:focus-visible {
    outline: 2px solid var(--k-color-text, #222);
    outline-offset: 1px;
}
/* View switch: joined toggle buttons, the current view is filled. */
.k-dt-view-switch { display: inline-flex; }
.k-dt-view-switch .k-dt-btn { border-radius: 0; }
.k-dt-view-switch .k-dt-btn + .k-dt-btn { margin-left: -1px; }
.k-dt-view-switch .k-dt-btn:first-child { border-radius: var(--k-radius-s, 8px) 0 0 var(--k-radius-s, 8px); }
.k-dt-view-switch .k-dt-btn:last-child { border-radius: 0 var(--k-radius-s, 8px) var(--k-radius-s, 8px) 0; }
.k-dt-view-switch .k-dt-btn:focus-visible { position: relative; z-index: 1; }
.k-dt-view-switch .k-dt-btn[aria-pressed="true"] {
    background: var(--k-dt-accent);
    border-color: var(--k-dt-accent);
    color: var(--k-dt-accent-text);
}
.k-dt-btn-primary {
    background: var(--k-dt-accent);
    border-color: var(--k-dt-accent);
    color: var(--k-dt-accent-text);
}
.k-dt-ic { display: inline-flex; line-height: 0; }
.k-dt-ic svg, .k-dt-search-ic svg {
    width: 1.2em; height: 1.2em;
    fill: none; stroke: currentColor;
    stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
}

/* Table */
.k-dt-viewport { position: relative; display: flex; flex-direction: column; min-height: 0; }
.k-dt-body { overflow: auto; -webkit-overflow-scrolling: touch; }
.k-dt-scroll { min-width: 100%; }
/* Separate borders: with border-collapse, sticky cells leave their borders behind. */
.k-dt-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 0.85rem;
}

/* Horizontal scroll shadows (classes set from JS on scroll/resize). With pinned
   columns the left shadow sits on the edge of the last pinned column instead. */
.k-dt-viewport::before, .k-dt-viewport::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    width: 12px;
    z-index: 4;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
}
.k-dt-viewport::before { left: 0; background: linear-gradient(to right, rgba(0,0,0,0.16), transparent); }
.k-dt-viewport::after { right: 0; background: linear-gradient(to left, rgba(0,0,0,0.16), transparent); }
.k-dt-viewport.is-overflow-left:not(.has-pins)::before,
.k-dt-viewport.is-overflow-right::after { opacity: 1; }

/* Pinned columns: sticky, offset = width of the pinned columns before them. */
.k-dt-pinned {
    position: sticky;
    left: var(--k-dt-pin-left, 0px);
    z-index: 1;
    background: var(--k-color-page, #fff);
}
.k-dt-th.k-dt-pinned { z-index: 3; background: var(--k-dt-surface); }
.has-pins .k-dt-pinned-last { box-shadow: inset -1px 0 0 var(--k-dt-border); }
.k-dt-viewport.has-pins.is-overflow-left .k-dt-pinned-last::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: -1px;
    right: -12px;
    width: 12px;
    pointer-events: none;
    background: linear-gradient(to right, rgba(0,0,0,0.16), transparent);
}
.k-dt-th, .k-dt-td {
    text-align: left;
    --k-dt-cell-px: var(--k-space-s, 8px);
    padding: var(--k-space-xs, 6px) var(--k-dt-cell-px);
    border-bottom: 1px solid var(--k-dt-border);
    vertical-align: top;
}
.k-dt-align-right { text-align: right; }
.k-dt-align-center { text-align: center; }
.k-dt-th {
    position: sticky;
    top: 0;
    background: var(--k-dt-surface);
    z-index: 2;
    white-space: nowrap;
    font-weight: 700;
}
/* Column drag and drop (desktop): dragged header dimmed, drop position as an accent bar. */
.k-dt-th[draggable="true"] { cursor: grab; }
.k-dt-th.is-dragging { opacity: 0.5; }
.k-dt-th.is-drop-before { box-shadow: inset 3px 0 0 var(--k-dt-accent); }
.k-dt-th.is-drop-after { box-shadow: inset -3px 0 0 var(--k-dt-accent); }
.k-dt-th-inner { display: flex; align-items: center; gap: var(--k-space-2xs, 4px); justify-content: inherit; }
/* Column floor (minWidth / width / columnMinWidth). Set on the header content
   rather than on the cell, because min-width on table cells is not reliable
   across browsers; the value includes the cell padding, like width. */
.k-dt-has-min .k-dt-th-inner {
    min-width: calc(var(--k-dt-col-min) - 2 * var(--k-dt-cell-px));
}
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
.k-dt-sort-ind { display: contents; }
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
.k-dt-filter-btn, .k-dt-pin-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--k-color-text-muted, #666);
    padding: var(--k-space-xs, 6px);
    border-radius: var(--k-radius-s, 8px);
}
.k-dt-filter-btn:hover, .k-dt-pin-btn:hover { background: var(--k-dt-hover); color: var(--k-color-text, #222); }
.k-dt-filter-btn.is-active, .k-dt-pin-btn { color: var(--k-dt-accent); }

.k-dt-tr:hover .k-dt-td { background: var(--k-dt-surface-muted); }

/* Compact view: last column holds the details button. It sets the row height
   (no padding above/below), so compact rows are as high as the button: 44px
   on touch layouts (the whole row is the tap target), else like table rows. */
.k-dt-details-col { width: 1%; padding-left: 0; padding-right: var(--k-space-2xs, 4px); text-align: right; vertical-align: middle; }
.k-dt-td.k-dt-details-col { padding-top: 0; padding-bottom: 0; }
.k-dt-details-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    vertical-align: middle;
    cursor: pointer;
    color: var(--k-color-text-muted, #666);
    background: none;
    border: none;
    border-radius: var(--k-radius-s, 8px);
}
.k-dt-details-btn:hover { background: var(--k-dt-hover); color: var(--k-color-text, #222); }
.k-dt-table--compact .k-dt-td:not(.k-dt-details-col) { vertical-align: middle; }
.k-dt-clickable { cursor: pointer; }
.k-dt-cell { display: flex; align-items: center; gap: var(--k-space-xs, 6px); justify-content: inherit; }
.k-dt-align-right .k-dt-cell { flex-direction: row-reverse; }
.k-dt-value { overflow-wrap: break-word; }
/* Numbers, dates and booleans never wrap. */
.k-dt-nowrap .k-dt-value { white-space: nowrap; }
/* Opt-in single-line cells (cellOverflow / column.overflow = "ellipsis").
   The focused cell shows its full content. */
.k-dt-truncate .k-dt-cell { max-width: var(--k-dt-cell-max-width, 16rem); }
.k-dt-truncate .k-dt-cell > :first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow-wrap: normal;
}
.k-dt-truncate:focus-within .k-dt-cell > :first-child { white-space: normal; overflow-wrap: break-word; }
.k-dt-link { color: var(--k-dt-accent); text-decoration: none; }
.k-dt-link:hover { text-decoration: underline; }
.k-dt-cell-action {
    font: inherit; color: var(--k-dt-accent);
    background: none; border: none; cursor: pointer; padding: 0; text-align: inherit;
}
.k-dt-cell-action:hover { text-decoration: underline; }

/* Copy button — base: visible (touch has no hover) */
.k-dt-copy {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--k-color-text-muted, #666);
    flex: none;
    width: 28px;
    height: 28px;
    padding: 0;
    /* Overlaps the cell padding instead of making the row taller, so text
       next to it sits at the same height as in cells without a button. */
    margin-block: -6px;
    border-radius: var(--k-radius-s, 8px);
    transition: opacity 0.1s;
}
.k-dt-copy:active { opacity: 1; background: var(--k-dt-hover); }
.k-dt-copy.is-copied { color: var(--k-dt-accent); opacity: 1; }

.k-dt-empty {
    text-align: center;
    color: var(--k-color-text-muted, #666);
    padding: var(--k-space-4xl, 24px);
}

/* Grid / card view */
.k-dt-grid {
    display: grid;
    gap: var(--k-space-s, 8px);
    padding: var(--k-space-s, 8px);
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
.k-dt-card { container-type: inline-size; }
.k-dt-card-title { font-weight: 700; font-size: 1.05rem; margin-bottom: var(--k-space-2xs, 4px); overflow-wrap: break-word; }

/* Label/value list (cards, detail dialog): one grid for all pairs, so the
   label column is as wide as the longest label (max. 45%); stacked only on
   very narrow cards. */
.k-dt-fields {
    margin: 0;
    display: grid;
    grid-template-columns: fit-content(45%) minmax(0, 1fr);
    gap: var(--k-space-2xs, 4px) var(--k-space-l, 12px);
    align-items: baseline;
    font-size: 0.9rem;
}
.k-dt-pair { display: contents; }
.k-dt-pair-label { color: var(--k-color-text-muted, #666); overflow-wrap: break-word; min-width: 0; }
.k-dt-pair-value { margin: 0; display: flex; align-items: center; gap: var(--k-space-2xs, 4px); min-width: 0; min-height: 1.6em; }
.k-dt-pair-value > :first-child { min-width: 0; overflow-wrap: anywhere; }
@container (max-width: 11rem) {
    .k-dt-fields { grid-template-columns: minmax(0, 1fr); row-gap: 0; }
    .k-dt-pair-value { margin-bottom: var(--k-space-2xs, 4px); }
}

/* Footer / Pagination — base: stacked & trimmed for small screens */
.k-dt-footer {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--k-space-s, 8px);
    padding: var(--k-space-s, 8px);
    border-top: 1px solid var(--k-dt-border);
    background: var(--k-dt-surface-muted);
    font-size: 0.85rem;
}
.k-dt-info { display: flex; align-items: center; justify-content: center; gap: var(--k-space-l, 12px); color: var(--k-color-text-muted, #666); }
.k-dt-pagesize { display: none; align-items: center; gap: var(--k-space-2xs, 4px); }
.k-dt-select {
    font: inherit;
    color: inherit;
    background: var(--k-color-page, #fff);
    border: 1px solid var(--k-dt-border);
    border-radius: var(--k-radius-s, 8px);
    padding: var(--k-space-2xs, 4px) var(--k-space-xs, 6px);
}
.k-dt-pager { display: flex; align-items: center; justify-content: center; gap: var(--k-space-2xs, 4px); width: 100%; }
.k-dt-page-btn {
    min-width: 40px;
    min-height: 40px;
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
/* On phones the pager keeps only first/prev/active/next/last. */
.k-dt-page-num:not(.is-active) { display: none; }
.k-dt-page-gap { display: none; padding: 0 var(--k-space-2xs, 4px); color: var(--k-color-text-muted, #666); }

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
    padding: var(--k-space-s, 8px) var(--k-space-s, 8px);
    cursor: pointer;
}
.k-ctx-item:hover, .k-ctx-item:focus-visible, .k-ctx-item:active { background: var(--k-dt-hover); }
.k-ctx-item:focus-visible { outline: 2px solid var(--k-color-text, #222); outline-offset: -2px; }
.k-ctx-item[aria-disabled="true"] { opacity: 0.4; cursor: default; }
.k-ctx-danger { color: var(--k-color-schicht-vertretung-bg, #c0392b); }
.k-ctx-icon { display: inline-flex; width: 1.1em; }
.k-ctx-icon svg { width: 1.1em; height: 1.1em; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.k-ctx-label { flex: 1; }
.k-ctx-arrow { color: var(--k-color-text-muted, #666); }
.k-ctx-sep { height: 1px; background: var(--k-dt-border); margin: var(--k-space-2xs, 4px) 0; }
.k-ctx-haschild { position: relative; }
.k-ctx-haschild > .k-ctx-submenu {
    position: absolute;
    left: 100%;
    top: 0;
    display: none;
}
.k-ctx-haschild:hover > .k-ctx-submenu,
.k-ctx-haschild.is-open > .k-ctx-submenu { display: flex; }

/* Context menu as a bottom sheet (mobile, toggled from JS) */
.k-ctx-menu--sheet {
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    width: 100%;
    min-width: 0;
    max-height: 70vh;
    overflow: auto;
    border-radius: var(--k-radius-l, 12px) var(--k-radius-l, 12px) 0 0;
    box-shadow: 0 -8px 30px rgba(0,0,0,0.25);
    padding: var(--k-space-2xs, 4px) var(--k-space-2xs, 4px) max(var(--k-space-s, 8px), env(safe-area-inset-bottom));
}
.k-ctx-menu--sheet::before {
    content: "";
    display: block;
    width: 40px;
    height: 4px;
    border-radius: 999px;
    background: var(--k-dt-border);
    margin: var(--k-space-2xs, 4px) auto var(--k-space-s, 8px);
}
.k-ctx-menu--sheet .k-ctx-item { padding: var(--k-space-l, 12px) var(--k-space-l, 12px); }

/* Filter / columns / templates panel (overlay) */
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
/* Overlay as a bottom sheet (mobile, toggled from JS) */
.k-dt-overlay--sheet {
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    width: 100%;
    max-height: 85vh;
    border-radius: var(--k-radius-l, 12px) var(--k-radius-l, 12px) 0 0;
    box-shadow: 0 -8px 30px rgba(0,0,0,0.25);
    padding-bottom: max(var(--k-space-l, 12px), env(safe-area-inset-bottom));
}
.k-dt-overlay--sheet::before {
    content: "";
    display: block;
    width: 40px;
    height: 4px;
    border-radius: 999px;
    background: var(--k-dt-border);
    margin: 0 auto var(--k-space-s, 8px);
}
.k-dt-panel-head { font-weight: 700; font-size: 1rem; margin: 0; }
.k-dt-panel-head:focus { outline: none; }

/* Record details dialog: centered on desktop, bottom sheet on mobile; dims the page. */
.k-dt-overlay--dialog {
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(36rem, calc(100vw - 32px));
    max-height: 85vh;
}
.k-dt-details { padding-top: 0; padding-bottom: 0; gap: var(--k-space-s, 8px); }
.k-dt-details.k-dt-overlay--dialog, .k-dt-details.k-dt-overlay--sheet,
.k-dt-export.k-dt-overlay--dialog, .k-dt-export.k-dt-overlay--sheet {
    box-shadow: 0 0 0 100vmax rgba(0,0,0,0.4), 0 10px 30px rgba(0,0,0,0.25);
}
.k-dt-details-head, .k-dt-details-actions {
    position: sticky;
    z-index: 1;
    background: var(--k-color-page, #fff);
}
.k-dt-details-head {
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--k-space-s, 8px);
    padding-top: var(--k-space-s, 8px);
}
.k-dt-details-head .k-dt-icon-btn { border-color: transparent; flex: none; }
.k-dt-details .k-dt-fields { row-gap: var(--k-space-s, 8px); }
.k-dt-details-pos { margin: 0; color: var(--k-color-text-muted, #666); font-size: 0.85rem; }
.k-dt-details-actions {
    bottom: 0;
    padding: var(--k-space-s, 8px) 0 max(var(--k-space-l, 12px), env(safe-area-inset-bottom));
    border-top: 1px solid var(--k-dt-border);
}
.k-dt-details-open { margin-right: auto; }
.k-dt-btn:disabled { opacity: 0.4; cursor: default; }

/* Export dialog */
.k-dt-export.k-dt-overlay--dialog { width: min(28rem, calc(100vw - 32px)); }
.k-dt-export-form, .k-dt-export-more { display: flex; flex-direction: column; gap: var(--k-space-s, 8px); }
.k-dt-export-more { border-top: 1px solid var(--k-dt-border); padding-top: var(--k-space-s, 8px); }
/* Actions stay in view when the options make the dialog scroll. */
.k-dt-export { padding-bottom: 0; }
.k-dt-export .k-dt-panel-actions {
    position: sticky;
    bottom: 0;
    background: var(--k-color-page, #fff);
    border-top: 1px solid var(--k-dt-border);
    padding: var(--k-space-s, 8px) 0 max(var(--k-space-l, 12px), env(safe-area-inset-bottom));
}
.k-dt-field { display: flex; flex-direction: column; gap: var(--k-space-2xs, 4px); }
.k-dt-fieldset { border: none; margin: 0; padding: 0; min-width: 0; }
.k-dt-fieldset legend { padding: 0; margin-bottom: var(--k-space-2xs, 4px); }

/* Segmented control: native radios laid over adjacent options in one track.
   Selected = filled accent (not color alone: fill + contrast change). */
.k-dt-segmented {
    display: flex;
    gap: 2px;
    padding: 2px;
    background: var(--k-dt-surface-muted);
    border: 1px solid var(--k-dt-border);
    border-radius: var(--k-radius-s, 8px);
}
.k-dt-segment { position: relative; flex: 1 1 0; min-width: 0; }
.k-dt-segment input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
}
.k-dt-segment-text {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    height: 100%;
    padding: var(--k-space-2xs, 4px) var(--k-space-s, 8px);
    border-radius: calc(var(--k-radius-s, 8px) - 2px);
    text-align: center;
    line-height: 1.2;
}
.k-dt-segment-detail { font-size: 0.8rem; color: var(--k-color-text-muted, #666); }
.k-dt-segment:hover input:not(:checked) + .k-dt-segment-text { background: var(--k-dt-hover); }
.k-dt-segment input:checked + .k-dt-segment-text {
    background: var(--k-dt-accent);
    color: var(--k-dt-accent-text);
    font-weight: 600;
}
.k-dt-segment input:checked + .k-dt-segment-text .k-dt-segment-detail { color: inherit; }
.k-dt-segment input:focus-visible + .k-dt-segment-text {
    outline: 2px solid var(--k-color-text, #222);
    outline-offset: 1px;
}

/* Switch: native checkbox (role="switch"). Off = outlined track, knob left;
   on = filled track, knob right (position carries the state, not color). */
.k-dt-switch {
    display: flex;
    align-items: center;
    gap: var(--k-space-s, 8px);
    min-height: 44px;
    padding: 0 var(--k-space-2xs, 4px);
    border-radius: var(--k-radius-s, 8px);
    cursor: pointer;
}
.k-dt-switch:hover { background: var(--k-dt-hover); }
.k-dt-switch-label { flex: 1; min-width: 0; }
.k-dt-switch input {
    -webkit-appearance: none;
    appearance: none;
    position: relative;
    flex: none;
    width: 40px;
    height: 24px;
    margin: 0;
    border: 2px solid var(--k-color-text-muted, #666);
    border-radius: 999px;
    background: var(--k-color-page, #fff);
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s;
}
.k-dt-switch input::before {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--k-color-text-muted, #666);
    transition: transform 0.15s;
}
.k-dt-switch input:checked { background: var(--k-dt-accent); border-color: var(--k-dt-accent); }
.k-dt-switch input:checked::before { transform: translateX(16px); background: var(--k-dt-accent-text); }
.k-dt-switch input:focus-visible { outline: 2px solid var(--k-color-text, #222); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
    .k-dt-switch input, .k-dt-switch input::before { transition: none; }
}
@media (forced-colors: active) {
    .k-dt-switch input { border-color: CanvasText; background: Canvas; }
    .k-dt-switch input::before { background: CanvasText; }
    .k-dt-switch input:checked { border-color: Highlight; background: Highlight; }
    .k-dt-switch input:checked::before { background: HighlightText; }
    .k-dt-segment input:checked + .k-dt-segment-text { forced-color-adjust: none; background: Highlight; color: HighlightText; }
}
.k-dt-disclosure { align-self: flex-start; border-color: transparent; padding-left: var(--k-space-2xs, 4px); }
.k-dt-disclosure:hover { background: var(--k-dt-hover); }
.k-dt-disclosure .k-dt-ic { transition: transform 0.15s; }
.k-dt-disclosure[aria-expanded="true"] .k-dt-ic { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) { .k-dt-disclosure .k-dt-ic { transition: none; } }
.k-dt-tabs { display: flex; gap: var(--k-space-2xs, 4px); }
.k-dt-tab {
    flex: 1;
    font: inherit;
    cursor: pointer;
    background: var(--k-dt-surface-muted);
    color: inherit;
    border: 1px solid var(--k-dt-border);
    border-radius: var(--k-radius-s, 8px);
    padding: var(--k-space-s, 8px);
    min-height: 40px;
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
    padding: var(--k-space-s, 8px) var(--k-space-2xs, 4px);
    border-radius: var(--k-radius-s, 8px);
    cursor: pointer;
}
.k-dt-check:hover { background: var(--k-dt-hover); }
.k-dt-check input[type="checkbox"], .k-dt-check input[type="radio"] { width: 18px; height: 18px; flex: none; }
.k-dt-search-mode { border: none; border-top: 1px solid var(--k-dt-border); margin: 0; padding: var(--k-space-s, 8px) 0 0; min-width: 0; }
/* Floated legend: keeps the top border from running through it. */
.k-dt-search-mode legend { float: left; width: 100%; }
.k-dt-search-mode .k-dt-segmented { clear: both; }
.k-dt-col-row { display: flex; align-items: center; gap: var(--k-space-2xs, 4px); }
.k-dt-col-row .k-dt-switch { flex: 1; min-width: 0; }
.k-dt-move-btn { border-color: transparent; flex: none; }
.k-dt-move-btn:disabled { opacity: 0.35; cursor: default; background: none; }
/* Pressed = filled accent (not color alone: background + border change). */
.k-dt-pin-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    min-width: 44px;
    min-height: 44px;
    cursor: pointer;
    color: var(--k-color-text-muted, #666);
    background: none;
    border: 1px solid transparent;
    border-radius: var(--k-radius-s, 8px);
}
.k-dt-pin-toggle:hover { background: var(--k-dt-hover); color: var(--k-color-text, #222); }
.k-dt-pin-toggle[aria-pressed="true"] { background: var(--k-dt-accent); border-color: var(--k-dt-accent); color: var(--k-dt-accent-text); }
.k-dt-check-all { font-weight: 600; border-bottom: 1px solid var(--k-dt-border); }
.k-dt-check-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.k-dt-check-count { color: var(--k-color-text-muted, #666); font-size: 0.8rem; }
.k-dt-panel-actions { display: flex; justify-content: flex-end; gap: var(--k-space-s, 8px); }
.k-dt-tpl-save { display: flex; gap: var(--k-space-2xs, 4px); }
.k-dt-tpl-list { display: flex; flex-direction: column; gap: 2px; }
.k-dt-tpl-item { display: flex; align-items: center; gap: var(--k-space-2xs, 4px); }
.k-dt-tpl-load {
    flex: 1; text-align: left; font: inherit; cursor: pointer;
    background: none; border: none; color: inherit;
    padding: var(--k-space-s, 8px); border-radius: var(--k-radius-s, 8px);
}
.k-dt-tpl-load:hover { background: var(--k-dt-hover); }
.k-dt-tpl-empty { color: var(--k-color-text-muted, #666); font-size: 0.88rem; }

/* Suppress the long-press text selection / callout on touch so our context menu wins. */
/* Accessibility */
[hidden] { display: none !important; }
.k-dt-sr-only {
    position: absolute !important;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
}
.k-dt-search:focus-within,
.k-dt-td:focus-visible, .k-dt-card:focus-visible,
.k-dt-link:focus-visible, .k-dt-cell-action:focus-visible,
.k-dt-tab:focus-visible, .k-dt-tpl-load:focus-visible,
.k-dt-input:focus-visible, .k-dt-select:focus-visible,
.k-dt-check input:focus-visible {
    outline: 2px solid var(--k-color-text, #222);
    outline-offset: 1px;
}
.k-dt-td:focus-visible, .k-dt-card:focus-visible { outline-offset: -2px; }
.k-dt-overlay:focus { outline: none; }

@media (pointer: coarse) {
    .k-dt-th, .k-dt-td, .k-dt-card {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
    }
}

/* ===================================================================== */
/* Desktop enhancements (>= 640px): roomier spacing, hover affordances,  */
/* inline toolbar/footer, full pagination.                               */
/* ===================================================================== */
@media (min-width: 640px) {
    .k-dt-toolbar {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: var(--k-space-s, 8px);
        padding: var(--k-space-s, 8px) var(--k-space-l, 12px);
        flex-wrap: wrap;
    }
    .k-dt-toolbar-left, .k-dt-toolbar-right { width: auto; }
    .k-dt-toolbar-left { flex: 1 1 auto; }
    .k-dt-title { font-size: 1.05rem; margin-right: 0; }

    .k-dt-search { width: auto; }
    .k-dt-search-input { min-width: 200px; width: auto; flex: 0 1 auto; padding: var(--k-space-xs, 6px) var(--k-space-2xs, 4px); }

    .k-dt-btn, .k-dt-icon-btn {
        min-height: 36px;
        min-width: 0;
        padding: var(--k-space-xs, 6px) var(--k-space-s, 8px);
    }
    .k-dt-icon-btn { padding: var(--k-space-xs, 6px); }
    .k-dt-ic svg, .k-dt-search-ic svg { width: 1.1em; height: 1.1em; }

    .k-dt-table { font-size: 0.92rem; }
    .k-dt-th, .k-dt-td { --k-dt-cell-px: var(--k-space-l, 12px); padding: var(--k-space-s, 8px) var(--k-dt-cell-px); }
    .k-dt-filter-btn, .k-dt-pin-btn { padding: 2px; }
    .k-dt-pin-toggle { min-width: 32px; min-height: 32px; }
    .k-dt-details-btn { width: 32px; height: 32px; }

    /* Copy button: hidden until row/cell hover */
    .k-dt-copy { opacity: 0; width: 22px; height: 22px; margin-block: -3px; }
    /* Also revealed for keyboard users (focused cell/card or the button itself). */
    .k-dt-td:hover .k-dt-copy, .k-dt-pair:hover .k-dt-copy,
    .k-dt-td:focus-within .k-dt-copy, .k-dt-card:focus-within .k-dt-copy,
    .k-dt-copy:focus-visible { opacity: 1; }
    .k-dt-copy:hover { opacity: 1; background: var(--k-dt-hover); }

    .k-dt-grid { gap: var(--k-space-l, 12px); padding: var(--k-space-l, 12px); }

    .k-dt-footer {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        padding: var(--k-space-s, 8px) var(--k-space-l, 12px);
        font-size: 0.88rem;
        flex-wrap: wrap;
    }
    .k-dt-info { justify-content: flex-start; }
    .k-dt-pagesize { display: flex; }
    .k-dt-pager { width: auto; gap: 2px; }
    .k-dt-page-btn { min-width: 34px; min-height: 34px; }
    .k-dt-page-num:not(.is-active) { display: inline-flex; }
    .k-dt-page-gap { display: inline; }

    .k-dt-tab { min-height: 0; padding: var(--k-space-2xs, 4px) var(--k-space-s, 8px); }
    .k-dt-input, .k-dt-overlay .k-dt-select { padding: var(--k-space-s, 8px); }
    .k-dt-check { padding: var(--k-space-2xs, 4px); }
    .k-dt-segment-text { min-height: 36px; }
    .k-dt-switch { min-height: 36px; }
    .k-dt-tpl-load { padding: var(--k-space-xs, 6px) var(--k-space-s, 8px); }
}
`;
