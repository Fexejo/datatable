// jw-datatable styles as a string (injected into the shadow root).
//
// Mobile First: the base rules target small / touch screens (compact spacing,
// 44px touch targets, always-visible copy buttons, stacked toolbar & footer).
// The `@media (min-width: 640px)` block then layers on the roomier desktop
// experience (more padding, hover-reveal copy buttons, inline pagination).
// Overlays and the context menu use explicit `--sheet` modifiers (toggled from
// JS via matchMedia) so they turn into bottom sheets on phones.
//
// Theme variables `--jw-dt-*` are read with their default as fallback and never
// set here, so a page can set them on any ancestor (README "Theming"). Internal
// variables are `--dt-*`.
// Extra CSS via `config.styles`; style elements via `part` (root, toolbar, table, grid, card, footer).

export const datatableStyles = `
:host {
    display: block;
    /* As a flex/grid item, shrink to the track and scroll inside instead of
       stretching the layout to the table's width. */
    min-width: 0;
    font-family: var(--jw-dt-font-family, system-ui, sans-serif);
    color: var(--jw-dt-color-text, #222);
    --dt-border: var(--jw-dt-color-border, #d8d8d8);
    --dt-surface: var(--jw-dt-color-surface, #f0f0f0);
    --dt-surface-muted: var(--jw-dt-color-surface-muted, #f8f8f8);
    --dt-hover: var(--jw-dt-color-hover, #e8e8e8);
    --dt-accent: var(--jw-dt-color-accent, #1f7a3a);
    --dt-accent-text: var(--jw-dt-color-accent-text, #fff);
}
* { box-sizing: border-box; }

.jw-dt {
    border: 1px solid var(--dt-border);
    border-radius: var(--jw-dt-radius-l, 12px);
    background: var(--jw-dt-color-page, #fff);
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

/* Toolbar — base: stacked, full-width search */
.jw-dt-toolbar {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--jw-dt-space-s, 8px);
    padding: var(--jw-dt-space-s, 8px);
    background: var(--dt-surface-muted);
    border-bottom: 1px solid var(--dt-border);
}
.jw-dt-toolbar-left, .jw-dt-toolbar-right {
    display: flex;
    align-items: center;
    gap: var(--jw-dt-space-s, 8px);
    flex-wrap: wrap;
    width: 100%;
}
.jw-dt-toolbar-right { justify-content: flex-end; }
.jw-dt-title { font-weight: 700; font-size: 1rem; margin-right: auto; }

.jw-dt-search {
    display: flex;
    align-items: center;
    gap: var(--jw-dt-space-2xs, 4px);
    width: 100%;
    background: var(--jw-dt-color-page, #fff);
    border: 1px solid var(--dt-border);
    border-radius: var(--jw-dt-radius-s, 8px);
    padding: 0 var(--jw-dt-space-s, 8px);
}
.jw-dt-search-ic { color: var(--jw-dt-color-text-muted, #666); display: inline-flex; }
.jw-dt-search-input {
    font: inherit;
    color: inherit;
    border: none;
    background: transparent;
    padding: var(--jw-dt-space-s, 8px) var(--jw-dt-space-2xs, 4px);
    flex: 1;
    min-width: 0;
    width: 100%;
    outline: none;
}

/* Buttons — base: 44px touch targets */
.jw-dt-btn, .jw-dt-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--jw-dt-space-2xs, 4px);
    font: inherit;
    cursor: pointer;
    color: var(--jw-dt-color-text, #222);
    background: var(--jw-dt-color-page, #fff);
    border: 1px solid var(--dt-border);
    border-radius: var(--jw-dt-radius-s, 8px);
    padding: var(--jw-dt-space-s, 8px);
    min-height: 44px;
    min-width: 44px;
}
.jw-dt-btn:hover, .jw-dt-icon-btn:hover { background: var(--dt-hover); }
.jw-dt-btn:active, .jw-dt-icon-btn:active { background: var(--dt-hover); }
.jw-dt-btn:focus-visible, .jw-dt-icon-btn:focus-visible,
.jw-dt-page-btn:focus-visible, .jw-dt-th-label:focus-visible,
.jw-dt-filter-btn:focus-visible, .jw-dt-pin-btn:focus-visible,
.jw-dt-pin-toggle:focus-visible, .jw-dt-details-btn:focus-visible, .jw-dt-copy:focus-visible {
    outline: 2px solid var(--jw-dt-color-text, #222);
    outline-offset: 1px;
}
/* Joined buttons: the layout switch (the current layout is filled) and "Filter (n)" with its "x". */
.jw-dt-layout-switch, .jw-dt-btn-group { display: inline-flex; }
:is(.jw-dt-layout-switch, .jw-dt-btn-group) .jw-dt-btn { border-radius: 0; }
:is(.jw-dt-layout-switch, .jw-dt-btn-group) .jw-dt-btn + .jw-dt-btn { margin-left: -1px; }
:is(.jw-dt-layout-switch, .jw-dt-btn-group) .jw-dt-btn:first-child { border-radius: var(--jw-dt-radius-s, 8px) 0 0 var(--jw-dt-radius-s, 8px); }
:is(.jw-dt-layout-switch, .jw-dt-btn-group) .jw-dt-btn:last-child { border-radius: 0 var(--jw-dt-radius-s, 8px) var(--jw-dt-radius-s, 8px) 0; }
:is(.jw-dt-layout-switch, .jw-dt-btn-group) .jw-dt-btn:focus-visible { position: relative; z-index: 1; }
.jw-dt-layout-switch .jw-dt-btn[aria-pressed="true"] {
    background: var(--dt-accent);
    border-color: var(--dt-accent);
    color: var(--dt-accent-text);
}
.jw-dt-btn-primary {
    background: var(--dt-accent);
    border-color: var(--dt-accent);
    color: var(--dt-accent-text);
}
.jw-dt-ic { display: inline-flex; line-height: 0; }
.jw-dt-ic svg, .jw-dt-search-ic svg {
    width: 1.2em; height: 1.2em;
    fill: none; stroke: currentColor;
    stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
}

/* Table */
.jw-dt-viewport { position: relative; display: flex; flex-direction: column; min-height: 0; }
.jw-dt-body { overflow: auto; -webkit-overflow-scrolling: touch; }
.jw-dt-scroll { min-width: 100%; }
/* Separate borders: with border-collapse, sticky cells leave their borders behind. */
.jw-dt-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 0.85rem;
}

/* Horizontal scroll shadows (classes set from JS on scroll/resize). With pinned
   columns the left shadow sits on the edge of the last pinned column instead. */
.jw-dt-viewport::before, .jw-dt-viewport::after {
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
.jw-dt-viewport::before { left: 0; background: linear-gradient(to right, rgba(0,0,0,0.16), transparent); }
.jw-dt-viewport::after { right: 0; background: linear-gradient(to left, rgba(0,0,0,0.16), transparent); }
.jw-dt-viewport.is-overflow-left:not(.has-pins)::before,
.jw-dt-viewport.is-overflow-right::after { opacity: 1; }

/* Pinned columns: sticky, offset = width of the pinned columns before them. */
.jw-dt-pinned {
    position: sticky;
    left: var(--dt-pin-left, 0px);
    z-index: 1;
    background: var(--jw-dt-color-page, #fff);
}
.jw-dt-th.jw-dt-pinned { z-index: 3; background: var(--dt-surface); }
.has-pins .jw-dt-pinned-last { box-shadow: inset -1px 0 0 var(--dt-border); }
.jw-dt-viewport.has-pins.is-overflow-left .jw-dt-pinned-last::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: -1px;
    right: -12px;
    width: 12px;
    pointer-events: none;
    background: linear-gradient(to right, rgba(0,0,0,0.16), transparent);
}
.jw-dt-th, .jw-dt-td {
    text-align: left;
    --dt-cell-px: var(--jw-dt-space-s, 8px);
    padding: var(--jw-dt-space-xs, 6px) var(--dt-cell-px);
    border-bottom: 1px solid var(--dt-border);
    vertical-align: top;
}
.jw-dt-align-right { text-align: right; }
.jw-dt-align-center { text-align: center; }
.jw-dt-th {
    position: sticky;
    top: 0;
    background: var(--dt-surface);
    z-index: 2;
    white-space: nowrap;
    font-weight: 700;
}
/* Column drag and drop (desktop): dragged header dimmed, drop position as an accent bar. */
.jw-dt-th[draggable="true"] { cursor: grab; }
.jw-dt-th.is-dragging { opacity: 0.5; }
.jw-dt-th.is-drop-before { box-shadow: inset 3px 0 0 var(--dt-accent); }
.jw-dt-th.is-drop-after { box-shadow: inset -3px 0 0 var(--dt-accent); }
.jw-dt-th-inner { display: flex; align-items: center; gap: var(--jw-dt-space-2xs, 4px); justify-content: inherit; }
/* Column floor (minWidth / width / columnMinWidth). Set on the header content
   rather than on the cell, because min-width on table cells is not reliable
   across browsers; the value includes the cell padding, like width. */
.jw-dt-has-min .jw-dt-th-inner {
    min-width: calc(var(--dt-col-min) - 2 * var(--dt-cell-px));
}
.jw-dt-align-right .jw-dt-th-inner { flex-direction: row-reverse; }
.jw-dt-th-label {
    display: inline-flex;
    align-items: center;
    gap: var(--jw-dt-space-2xs, 4px);
    font: inherit;
    font-weight: 700;
    color: inherit;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
}
span.jw-dt-th-label { cursor: default; }
.jw-dt-sort-ind { display: contents; }
.jw-dt-sort-ic { opacity: 0.35; }
.jw-dt-sort-ic.is-active { opacity: 1; color: var(--dt-accent); }
.jw-dt-sort-rank {
    font-size: 0.7rem;
    background: var(--dt-accent);
    color: var(--dt-accent-text);
    border-radius: 999px;
    padding: 0 5px;
    line-height: 1.4;
}
.jw-dt-filter-btn, .jw-dt-pin-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--jw-dt-color-text-muted, #666);
    padding: var(--jw-dt-space-xs, 6px);
    border-radius: var(--jw-dt-radius-s, 8px);
}
.jw-dt-filter-btn:hover, .jw-dt-pin-btn:hover { background: var(--dt-hover); color: var(--jw-dt-color-text, #222); }
.jw-dt-filter-btn.is-active, .jw-dt-pin-btn { color: var(--dt-accent); }

.jw-dt-tr:hover .jw-dt-td { background: var(--dt-surface-muted); }

/* Compact layout: last column holds the details button. It sets the row height
   (no padding above/below), so compact rows are as high as the button: 44px
   on touch layouts (the whole row is the tap target), else like table rows. */
.jw-dt-details-col { width: 1%; padding-left: 0; padding-right: var(--jw-dt-space-2xs, 4px); text-align: right; vertical-align: middle; }
.jw-dt-td.jw-dt-details-col { padding-top: 0; padding-bottom: 0; }
.jw-dt-details-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    vertical-align: middle;
    cursor: pointer;
    color: var(--jw-dt-color-text-muted, #666);
    background: none;
    border: none;
    border-radius: var(--jw-dt-radius-s, 8px);
}
.jw-dt-details-btn:hover { background: var(--dt-hover); color: var(--jw-dt-color-text, #222); }
.jw-dt-table--compact .jw-dt-td:not(.jw-dt-details-col) { vertical-align: middle; }
.jw-dt-clickable { cursor: pointer; }
.jw-dt-cell { display: flex; align-items: center; gap: var(--jw-dt-space-xs, 6px); justify-content: inherit; }
.jw-dt-align-right .jw-dt-cell { flex-direction: row-reverse; }
.jw-dt-value { overflow-wrap: break-word; }
/* Numbers, dates and booleans never wrap. */
.jw-dt-nowrap .jw-dt-value { white-space: nowrap; }
/* Opt-in single-line cells (cellOverflow / column.overflow = "ellipsis").
   The focused cell shows its full content. */
.jw-dt-truncate .jw-dt-cell { max-width: var(--jw-dt-cell-max-width, 16rem); }
.jw-dt-truncate .jw-dt-cell > :first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow-wrap: normal;
}
.jw-dt-truncate:focus-within .jw-dt-cell > :first-child { white-space: normal; overflow-wrap: break-word; }
.jw-dt-link { color: var(--dt-accent); text-decoration: none; }
.jw-dt-link:hover { text-decoration: underline; }
.jw-dt-cell-action {
    font: inherit; color: var(--dt-accent);
    background: none; border: none; cursor: pointer; padding: 0; text-align: inherit;
}
.jw-dt-cell-action:hover { text-decoration: underline; }

/* Copy button — base: visible (touch has no hover) */
.jw-dt-copy {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--jw-dt-color-text-muted, #666);
    flex: none;
    width: 28px;
    height: 28px;
    padding: 0;
    /* Overlaps the cell padding instead of making the row taller, so text
       next to it sits at the same height as in cells without a button. */
    margin-block: -6px;
    border-radius: var(--jw-dt-radius-s, 8px);
    transition: opacity 0.1s;
}
.jw-dt-copy:active { opacity: 1; background: var(--dt-hover); }
.jw-dt-copy.is-copied { color: var(--dt-accent); opacity: 1; }

.jw-dt-empty {
    text-align: center;
    color: var(--jw-dt-color-text-muted, #666);
    padding: var(--jw-dt-space-4xl, 24px);
}

/* Grid / card layout */
.jw-dt-grid {
    display: grid;
    gap: var(--jw-dt-space-s, 8px);
    padding: var(--jw-dt-space-s, 8px);
}
.jw-dt-card {
    border: 1px solid var(--dt-border);
    border-radius: var(--jw-dt-radius-m, 10px);
    padding: var(--jw-dt-space-l, 12px);
    background: var(--jw-dt-color-page, #fff);
    display: flex;
    flex-direction: column;
    gap: var(--jw-dt-space-2xs, 4px);
}
.jw-dt-card { container-type: inline-size; }
.jw-dt-card-title { font-weight: 700; font-size: 1.05rem; margin-bottom: var(--jw-dt-space-2xs, 4px); overflow-wrap: break-word; }

/* Label/value list (cards, detail dialog): one grid for all pairs, so the
   label column is as wide as the longest label (max. 45%); stacked only on
   very narrow cards. */
.jw-dt-fields {
    margin: 0;
    display: grid;
    grid-template-columns: fit-content(45%) minmax(0, 1fr);
    gap: var(--jw-dt-space-2xs, 4px) var(--jw-dt-space-l, 12px);
    align-items: baseline;
    font-size: 0.9rem;
}
.jw-dt-pair { display: contents; }
.jw-dt-pair-label { color: var(--jw-dt-color-text-muted, #666); overflow-wrap: break-word; min-width: 0; }
.jw-dt-pair-value { margin: 0; display: flex; align-items: center; gap: var(--jw-dt-space-2xs, 4px); min-width: 0; min-height: 1.6em; }
.jw-dt-pair-value > :first-child { min-width: 0; overflow-wrap: anywhere; }
@container (max-width: 11rem) {
    .jw-dt-fields { grid-template-columns: minmax(0, 1fr); row-gap: 0; }
    .jw-dt-pair-value { margin-bottom: var(--jw-dt-space-2xs, 4px); }
}

/* Footer / Pagination — base: stacked & trimmed for small screens */
.jw-dt-footer {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--jw-dt-space-s, 8px);
    padding: var(--jw-dt-space-s, 8px);
    border-top: 1px solid var(--dt-border);
    background: var(--dt-surface-muted);
    font-size: 0.85rem;
}
.jw-dt-info { display: flex; align-items: center; justify-content: center; gap: var(--jw-dt-space-l, 12px); color: var(--jw-dt-color-text-muted, #666); }
.jw-dt-pagesize { display: none; align-items: center; gap: var(--jw-dt-space-2xs, 4px); }
.jw-dt-select {
    font: inherit;
    color: inherit;
    background: var(--jw-dt-color-page, #fff);
    border: 1px solid var(--dt-border);
    border-radius: var(--jw-dt-radius-s, 8px);
    padding: var(--jw-dt-space-2xs, 4px) var(--jw-dt-space-xs, 6px);
}
.jw-dt-pager { display: flex; align-items: center; justify-content: center; gap: var(--jw-dt-space-2xs, 4px); width: 100%; }
.jw-dt-page-btn {
    min-width: 40px;
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font: inherit;
    cursor: pointer;
    color: var(--jw-dt-color-text, #222);
    background: var(--jw-dt-color-page, #fff);
    border: 1px solid var(--dt-border);
    border-radius: var(--jw-dt-radius-s, 8px);
    padding: 0 var(--jw-dt-space-xs, 6px);
}
.jw-dt-page-btn:hover:not(:disabled) { background: var(--dt-hover); }
.jw-dt-page-btn:disabled { opacity: 0.4; cursor: default; }
.jw-dt-page-btn.is-active {
    background: var(--dt-accent);
    border-color: var(--dt-accent);
    color: var(--dt-accent-text);
}
/* On phones the pager keeps only first/prev/active/next/last. */
.jw-dt-page-num:not(.is-active) { display: none; }
.jw-dt-page-gap { display: none; padding: 0 var(--jw-dt-space-2xs, 4px); color: var(--jw-dt-color-text-muted, #666); }

/* Context menu */
.jw-ctx-menu {
    position: fixed;
    z-index: 1000;
    min-width: 200px;
    background: var(--jw-dt-color-page, #fff);
    border: 1px solid var(--dt-border);
    border-radius: var(--jw-dt-radius-m, 10px);
    box-shadow: 0 10px 30px rgba(0,0,0,0.18);
    padding: var(--jw-dt-space-2xs, 4px);
    display: flex;
    flex-direction: column;
}
.jw-ctx-item {
    display: flex;
    align-items: center;
    gap: var(--jw-dt-space-s, 8px);
    width: 100%;
    font: inherit;
    text-align: left;
    color: var(--jw-dt-color-text, #222);
    background: none;
    border: none;
    border-radius: var(--jw-dt-radius-s, 8px);
    padding: var(--jw-dt-space-s, 8px) var(--jw-dt-space-s, 8px);
    cursor: pointer;
}
.jw-ctx-item:hover, .jw-ctx-item:focus-visible, .jw-ctx-item:active { background: var(--dt-hover); }
.jw-ctx-item:focus-visible { outline: 2px solid var(--jw-dt-color-text, #222); outline-offset: -2px; }
.jw-ctx-icon { display: inline-flex; width: 1.1em; }
.jw-ctx-icon svg { width: 1.1em; height: 1.1em; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.jw-ctx-label { flex: 1; }
.jw-ctx-sep { height: 1px; background: var(--dt-border); margin: var(--jw-dt-space-2xs, 4px) 0; }

/* Context menu as a bottom sheet (mobile, toggled from JS) */
.jw-ctx-menu--sheet {
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    width: 100%;
    min-width: 0;
    max-height: 70vh;
    overflow: auto;
    border-radius: var(--jw-dt-radius-l, 12px) var(--jw-dt-radius-l, 12px) 0 0;
    box-shadow: 0 -8px 30px rgba(0,0,0,0.25);
    padding: var(--jw-dt-space-2xs, 4px) var(--jw-dt-space-2xs, 4px) max(var(--jw-dt-space-s, 8px), env(safe-area-inset-bottom));
}
.jw-ctx-menu--sheet::before {
    content: "";
    display: block;
    width: 40px;
    height: 4px;
    border-radius: 999px;
    background: var(--dt-border);
    margin: var(--jw-dt-space-2xs, 4px) auto var(--jw-dt-space-s, 8px);
}
.jw-ctx-menu--sheet .jw-ctx-item { padding: var(--jw-dt-space-l, 12px) var(--jw-dt-space-l, 12px); }

/* Under every overlay: takes the pointer, so the page behind gets no hover
   and no click (a click here only closes the overlay). Dialogs dim the page. */
.jw-dt-backdrop { position: fixed; inset: 0; z-index: 999; }
.jw-dt-backdrop--dim { background: rgba(0,0,0,0.4); }

/* Filter / columns / saved views panel (overlay) */
.jw-dt-overlay {
    position: fixed;
    z-index: 1000;
    width: 280px;
    max-height: 70vh;
    overflow: auto;
    background: var(--jw-dt-color-page, #fff);
    border: 1px solid var(--dt-border);
    border-radius: var(--jw-dt-radius-m, 10px);
    box-shadow: 0 10px 30px rgba(0,0,0,0.18);
    padding: var(--jw-dt-space-l, 12px);
    display: flex;
    flex-direction: column;
    gap: var(--jw-dt-space-s, 8px);
}
/* Overlay as a bottom sheet (mobile, toggled from JS) */
.jw-dt-overlay--sheet {
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    width: 100%;
    max-height: 85vh;
    border-radius: var(--jw-dt-radius-l, 12px) var(--jw-dt-radius-l, 12px) 0 0;
    box-shadow: 0 -8px 30px rgba(0,0,0,0.25);
    padding-bottom: max(var(--jw-dt-space-l, 12px), env(safe-area-inset-bottom));
}
.jw-dt-overlay--sheet::before {
    content: "";
    display: block;
    width: 40px;
    height: 4px;
    border-radius: 999px;
    background: var(--dt-border);
    margin: 0 auto var(--jw-dt-space-s, 8px);
}
.jw-dt-panel-head { font-weight: 700; font-size: 1rem; margin: 0; }
.jw-dt-panel-head:focus { outline: none; }

/* Record details dialog: centered on desktop, bottom sheet on mobile (the backdrop dims the page). */
.jw-dt-overlay--dialog {
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(36rem, calc(100vw - 32px));
    max-height: 85vh;
}
.jw-dt-details { padding-top: 0; padding-bottom: 0; gap: var(--jw-dt-space-s, 8px); }
.jw-dt-details-head, .jw-dt-details-actions {
    position: sticky;
    z-index: 1;
    background: var(--jw-dt-color-page, #fff);
}
.jw-dt-details-head {
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--jw-dt-space-s, 8px);
    padding-top: var(--jw-dt-space-s, 8px);
}
.jw-dt-details-head .jw-dt-icon-btn { border-color: transparent; flex: none; }
.jw-dt-details .jw-dt-fields { row-gap: var(--jw-dt-space-s, 8px); }
.jw-dt-details-pos { margin: 0; color: var(--jw-dt-color-text-muted, #666); font-size: 0.85rem; }
.jw-dt-details-actions {
    bottom: 0;
    padding: var(--jw-dt-space-s, 8px) 0 max(var(--jw-dt-space-l, 12px), env(safe-area-inset-bottom));
    border-top: 1px solid var(--dt-border);
}
.jw-dt-details-open { margin-right: auto; }
.jw-dt-btn:disabled { opacity: 0.4; cursor: default; }

/* Export dialog */
.jw-dt-export.jw-dt-overlay--dialog { width: min(28rem, calc(100vw - 32px)); }
.jw-dt-export-form, .jw-dt-export-more { display: flex; flex-direction: column; gap: var(--jw-dt-space-s, 8px); }
.jw-dt-export-more { border-top: 1px solid var(--dt-border); padding-top: var(--jw-dt-space-s, 8px); }
/* Actions stay in view when the options make the dialog scroll. */
.jw-dt-export { padding-bottom: 0; }
.jw-dt-export .jw-dt-panel-actions {
    position: sticky;
    bottom: 0;
    background: var(--jw-dt-color-page, #fff);
    border-top: 1px solid var(--dt-border);
    padding: var(--jw-dt-space-s, 8px) 0 max(var(--jw-dt-space-l, 12px), env(safe-area-inset-bottom));
}
.jw-dt-field { display: flex; flex-direction: column; gap: var(--jw-dt-space-2xs, 4px); }
.jw-dt-fieldset { border: none; margin: 0; padding: 0; min-width: 0; }
.jw-dt-fieldset legend { padding: 0; margin-bottom: var(--jw-dt-space-2xs, 4px); }

/* Segmented control: native radios laid over adjacent options in one track.
   Selected = filled accent (not color alone: fill + contrast change). */
.jw-dt-segmented {
    display: flex;
    gap: 2px;
    padding: 2px;
    background: var(--dt-surface-muted);
    border: 1px solid var(--dt-border);
    border-radius: var(--jw-dt-radius-s, 8px);
}
.jw-dt-segment { position: relative; flex: 1 1 0; min-width: 0; }
.jw-dt-segment input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
}
.jw-dt-segment-text {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    height: 100%;
    padding: var(--jw-dt-space-2xs, 4px) var(--jw-dt-space-s, 8px);
    border-radius: calc(var(--jw-dt-radius-s, 8px) - 2px);
    text-align: center;
    line-height: 1.2;
}
.jw-dt-segment-detail { font-size: 0.8rem; color: var(--jw-dt-color-text-muted, #666); }
.jw-dt-segment:hover input:not(:checked) + .jw-dt-segment-text { background: var(--dt-hover); }
.jw-dt-segment input:checked + .jw-dt-segment-text {
    background: var(--dt-accent);
    color: var(--dt-accent-text);
    font-weight: 600;
}
.jw-dt-segment input:checked + .jw-dt-segment-text .jw-dt-segment-detail { color: inherit; }
.jw-dt-segment input:focus-visible + .jw-dt-segment-text {
    outline: 2px solid var(--jw-dt-color-text, #222);
    outline-offset: 1px;
}

/* Switch: native checkbox (role="switch"). Off = outlined track, knob left;
   on = filled track, knob right (position carries the state, not color). */
.jw-dt-switch {
    display: flex;
    align-items: center;
    gap: var(--jw-dt-space-s, 8px);
    min-height: 44px;
    padding: 0 var(--jw-dt-space-2xs, 4px);
    border-radius: var(--jw-dt-radius-s, 8px);
    cursor: pointer;
}
.jw-dt-switch:hover { background: var(--dt-hover); }
.jw-dt-switch-label { flex: 1; min-width: 0; }
.jw-dt-switch input {
    -webkit-appearance: none;
    appearance: none;
    position: relative;
    flex: none;
    width: 40px;
    height: 24px;
    margin: 0;
    border: 2px solid var(--jw-dt-color-text-muted, #666);
    border-radius: 999px;
    background: var(--jw-dt-color-page, #fff);
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s;
}
.jw-dt-switch input::before {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--jw-dt-color-text-muted, #666);
    transition: transform 0.15s;
}
.jw-dt-switch input:checked { background: var(--dt-accent); border-color: var(--dt-accent); }
.jw-dt-switch input:checked::before { transform: translateX(16px); background: var(--dt-accent-text); }
.jw-dt-switch input:focus-visible { outline: 2px solid var(--jw-dt-color-text, #222); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
    .jw-dt-switch input, .jw-dt-switch input::before { transition: none; }
}
@media (forced-colors: active) {
    .jw-dt-switch input { border-color: CanvasText; background: Canvas; }
    .jw-dt-switch input::before { background: CanvasText; }
    .jw-dt-switch input:checked { border-color: Highlight; background: Highlight; }
    .jw-dt-switch input:checked::before { background: HighlightText; }
    .jw-dt-segment input:checked + .jw-dt-segment-text { forced-color-adjust: none; background: Highlight; color: HighlightText; }
}
.jw-dt-disclosure { align-self: flex-start; border-color: transparent; padding-left: var(--jw-dt-space-2xs, 4px); }
.jw-dt-disclosure:hover { background: var(--dt-hover); }
.jw-dt-disclosure .jw-dt-ic { transition: transform 0.15s; }
.jw-dt-disclosure[aria-expanded="true"] .jw-dt-ic { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) { .jw-dt-disclosure .jw-dt-ic { transition: none; } }
.jw-dt-tabs { display: flex; gap: var(--jw-dt-space-2xs, 4px); }
.jw-dt-tab {
    flex: 1;
    font: inherit;
    cursor: pointer;
    background: var(--dt-surface-muted);
    color: inherit;
    border: 1px solid var(--dt-border);
    border-radius: var(--jw-dt-radius-s, 8px);
    padding: var(--jw-dt-space-s, 8px);
    min-height: 40px;
}
.jw-dt-tab.is-active { background: var(--dt-accent); border-color: var(--dt-accent); color: var(--dt-accent-text); }
.jw-dt-filter-body { display: flex; flex-direction: column; gap: var(--jw-dt-space-s, 8px); }
.jw-dt-field-label { font-size: 0.85rem; font-weight: 600; }
.jw-dt-input, .jw-dt-overlay .jw-dt-select {
    font: inherit;
    color: inherit;
    width: 100%;
    background: var(--jw-dt-color-page, #fff);
    border: 1px solid var(--dt-border);
    border-radius: var(--jw-dt-radius-s, 8px);
    padding: var(--jw-dt-space-s, 8px);
}
.jw-dt-operands { display: flex; flex-direction: column; gap: var(--jw-dt-space-xs, 6px); }
.jw-dt-check-list { display: flex; flex-direction: column; max-height: 220px; overflow: auto; gap: 2px; }
.jw-dt-check {
    display: flex;
    align-items: center;
    gap: var(--jw-dt-space-s, 8px);
    padding: var(--jw-dt-space-s, 8px) var(--jw-dt-space-2xs, 4px);
    border-radius: var(--jw-dt-radius-s, 8px);
    cursor: pointer;
}
.jw-dt-check:hover { background: var(--dt-hover); }
.jw-dt-check input[type="checkbox"], .jw-dt-check input[type="radio"] { width: 18px; height: 18px; flex: none; }
.jw-dt-search-mode { border: none; border-top: 1px solid var(--dt-border); margin: 0; padding: var(--jw-dt-space-s, 8px) 0 0; min-width: 0; }
/* Floated legend: keeps the top border from running through it. */
.jw-dt-search-mode legend { float: left; width: 100%; }
.jw-dt-search-mode .jw-dt-segmented { clear: both; }
.jw-dt-col-row { display: flex; align-items: center; gap: var(--jw-dt-space-2xs, 4px); }
.jw-dt-col-row .jw-dt-switch { flex: 1; min-width: 0; }
.jw-dt-move-btn { border-color: transparent; flex: none; }
.jw-dt-move-btn:disabled { opacity: 0.35; cursor: default; background: none; }
/* Pressed = filled accent (not color alone: background + border change). */
.jw-dt-pin-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    min-width: 44px;
    min-height: 44px;
    cursor: pointer;
    color: var(--jw-dt-color-text-muted, #666);
    background: none;
    border: 1px solid transparent;
    border-radius: var(--jw-dt-radius-s, 8px);
}
.jw-dt-pin-toggle:hover { background: var(--dt-hover); color: var(--jw-dt-color-text, #222); }
.jw-dt-pin-toggle[aria-pressed="true"] { background: var(--dt-accent); border-color: var(--dt-accent); color: var(--dt-accent-text); }
.jw-dt-check-all { font-weight: 600; border-bottom: 1px solid var(--dt-border); }
.jw-dt-check-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jw-dt-check-count { color: var(--jw-dt-color-text-muted, #666); font-size: 0.8rem; }
.jw-dt-panel-actions { display: flex; justify-content: flex-end; gap: var(--jw-dt-space-s, 8px); }
/* Saved views panel: a little wider than the other popovers, so the name field fits its placeholder. */
.jw-dt-views-panel:not(.jw-dt-overlay--sheet) { width: 320px; max-width: calc(100vw - 8px); }
.jw-dt-views-save { display: flex; gap: var(--jw-dt-space-2xs, 4px); }
.jw-dt-views-save .jw-dt-input { flex: 1; min-width: 0; }
.jw-dt-views-extra:empty, .jw-dt-views-active-wrap:empty { display: none; }
.jw-dt-views-active {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
    gap: var(--jw-dt-space-2xs, 4px) var(--jw-dt-space-s, 8px);
}
.jw-dt-views-active p, .jw-dt-views-question, .jw-dt-views-error { margin: 0; overflow-wrap: anywhere; }
.jw-dt-views-badge { color: var(--jw-dt-color-text-muted, #666); }
.jw-dt-views-error { color: var(--jw-dt-color-error, #c0392b); font-size: 0.88rem; }
.jw-dt-views-confirm, .jw-dt-views-item.is-step { display: flex; flex-direction: column; align-items: stretch; gap: var(--jw-dt-space-s, 8px); }
.jw-dt-views-confirm, .jw-dt-views-item.is-step {
    padding: var(--jw-dt-space-s, 8px);
    border: 1px solid var(--dt-border);
    border-radius: var(--jw-dt-radius-s, 8px);
}
.jw-dt-views-item.is-step .jw-dt-views-confirm { padding: 0; border: none; }
.jw-dt-views-list { display: flex; flex-direction: column; gap: var(--jw-dt-space-s, 8px); }
.jw-dt-views-items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.jw-dt-views-item { display: flex; align-items: center; gap: var(--jw-dt-space-2xs, 4px); }
.jw-dt-views-item .jw-dt-icon-btn { border-color: transparent; flex: none; }
.jw-dt-views-load {
    flex: 1; min-width: 0; min-height: 44px; text-align: left; font: inherit; cursor: pointer;
    display: flex; align-items: center; gap: var(--jw-dt-space-xs, 6px);
    background: none; border: none; color: inherit;
    padding: var(--jw-dt-space-s, 8px); border-radius: var(--jw-dt-radius-s, 8px);
}
.jw-dt-views-load .jw-dt-ic { width: 16px; flex: none; }
.jw-dt-views-load[aria-current="true"] { font-weight: 600; }
.jw-dt-views-name { overflow-wrap: anywhere; }
.jw-dt-views-load:hover { background: var(--dt-hover); }
.jw-dt-views-empty { margin: 0; color: var(--jw-dt-color-text-muted, #666); font-size: 0.88rem; }

/* Filter summary: one row per active filter (open it / remove it). */
.jw-dt-fsum-panel:not(.jw-dt-overlay--sheet) { width: 360px; max-width: calc(100vw - 8px); }
.jw-dt-fsum-panel .jw-dt-panel-actions { flex-wrap: wrap; }
.jw-dt-fsum-items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.jw-dt-fsum-item { display: flex; align-items: center; gap: var(--jw-dt-space-2xs, 4px); }
.jw-dt-fsum-item .jw-dt-icon-btn { border-color: transparent; flex: none; }
.jw-dt-fsum-edit {
    flex: 1; min-width: 0; min-height: 44px; text-align: left; font: inherit; cursor: pointer;
    display: flex; flex-direction: column; justify-content: center; gap: 2px;
    background: none; border: none; color: inherit;
    padding: var(--jw-dt-space-xs, 6px) var(--jw-dt-space-s, 8px); border-radius: var(--jw-dt-radius-s, 8px);
}
.jw-dt-fsum-edit:hover { background: var(--dt-hover); }
.jw-dt-fsum-label { font-weight: 600; }
.jw-dt-fsum-value {
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    color: var(--jw-dt-color-text-muted, #666); font-size: 0.88rem;
}

/* Suppress the long-press text selection / callout on touch so our context menu wins. */
/* Accessibility */
[hidden] { display: none !important; }
.jw-dt-sr-only {
    position: absolute !important;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
}
.jw-dt-search:focus-within,
.jw-dt-td:focus-visible, .jw-dt-card:focus-visible,
.jw-dt-link:focus-visible, .jw-dt-cell-action:focus-visible,
.jw-dt-tab:focus-visible, .jw-dt-views-load:focus-visible, .jw-dt-fsum-edit:focus-visible,
.jw-dt-input:focus-visible, .jw-dt-select:focus-visible,
.jw-dt-check input:focus-visible {
    outline: 2px solid var(--jw-dt-color-text, #222);
    outline-offset: 1px;
}
.jw-dt-td:focus-visible, .jw-dt-card:focus-visible { outline-offset: -2px; }
.jw-dt-overlay:focus { outline: none; }

@media (pointer: coarse) {
    .jw-dt-th, .jw-dt-td, .jw-dt-card {
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
    .jw-dt-toolbar {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: var(--jw-dt-space-s, 8px);
        padding: var(--jw-dt-space-s, 8px) var(--jw-dt-space-l, 12px);
        flex-wrap: wrap;
    }
    .jw-dt-toolbar-left, .jw-dt-toolbar-right { width: auto; }
    .jw-dt-toolbar-left { flex: 1 1 auto; }
    .jw-dt-title { font-size: 1.05rem; margin-right: 0; }

    .jw-dt-search { width: auto; }
    .jw-dt-search-input { min-width: 200px; width: auto; flex: 0 1 auto; padding: var(--jw-dt-space-xs, 6px) var(--jw-dt-space-2xs, 4px); }

    .jw-dt-btn, .jw-dt-icon-btn {
        min-height: 36px;
        min-width: 0;
        padding: var(--jw-dt-space-xs, 6px) var(--jw-dt-space-s, 8px);
    }
    .jw-dt-icon-btn { padding: var(--jw-dt-space-xs, 6px); }
    .jw-dt-ic svg, .jw-dt-search-ic svg { width: 1.1em; height: 1.1em; }

    .jw-dt-table { font-size: 0.92rem; }
    .jw-dt-th, .jw-dt-td { --dt-cell-px: var(--jw-dt-space-l, 12px); padding: var(--jw-dt-space-s, 8px) var(--dt-cell-px); }
    /* At least 24px (WCAG 2.5.8): filter and unpin button sit side by side. */
    .jw-dt-filter-btn, .jw-dt-pin-btn { padding: 2px; min-width: 24px; min-height: 24px; }
    .jw-dt-pin-toggle { min-width: 32px; min-height: 32px; }
    .jw-dt-details-btn { width: 32px; height: 32px; }

    /* Copy button: hidden until row/cell hover */
    .jw-dt-copy { opacity: 0; width: 22px; height: 22px; margin-block: -3px; }
    /* Also revealed for keyboard users (focused cell/card or the button itself). */
    .jw-dt-td:hover .jw-dt-copy, .jw-dt-pair:hover .jw-dt-copy,
    .jw-dt-td:focus-within .jw-dt-copy, .jw-dt-card:focus-within .jw-dt-copy,
    .jw-dt-copy:focus-visible { opacity: 1; }
    .jw-dt-copy:hover { opacity: 1; background: var(--dt-hover); }

    .jw-dt-grid { gap: var(--jw-dt-space-l, 12px); padding: var(--jw-dt-space-l, 12px); }

    .jw-dt-footer {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        padding: var(--jw-dt-space-s, 8px) var(--jw-dt-space-l, 12px);
        font-size: 0.88rem;
        flex-wrap: wrap;
    }
    .jw-dt-info { justify-content: flex-start; }
    .jw-dt-pagesize { display: flex; }
    .jw-dt-pager { width: auto; gap: 2px; }
    .jw-dt-page-btn { min-width: 34px; min-height: 34px; }
    .jw-dt-page-num:not(.is-active) { display: inline-flex; }
    .jw-dt-page-gap { display: inline; }

    .jw-dt-tab { min-height: 0; padding: var(--jw-dt-space-2xs, 4px) var(--jw-dt-space-s, 8px); }
    .jw-dt-input, .jw-dt-overlay .jw-dt-select { padding: var(--jw-dt-space-s, 8px); }
    .jw-dt-check { padding: var(--jw-dt-space-2xs, 4px); }
    .jw-dt-segment-text { min-height: 36px; }
    .jw-dt-switch { min-height: 36px; }
    .jw-dt-views-load { min-height: 36px; padding: var(--jw-dt-space-xs, 6px) var(--jw-dt-space-s, 8px); }
}
`;
