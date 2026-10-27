// The table: borders, scroll shadows, pinned columns, header (sticky), column
// drag, widths, compact layout, cells and copy buttons.

export const tableStyles = `
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
/* Edge of the pinned block: a strong line (3:1 against header and rows), like
   the one under the header, so the cells scrolling behind it stay apart. Its
   width is always reserved (transparent while no pin is sticky): the widths
   decide which pins fit, and must not change with the result. */
.jw-dt-pinned-last { border-right: 2px solid transparent; }
.has-pins .jw-dt-pinned-last { border-right-color: var(--dt-border-strong); }
.jw-dt-viewport.has-pins.is-overflow-left .jw-dt-pinned-last::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: -1px;
    right: -14px;
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
/* Strong line under the header (3:1 against header and rows): it stays
   distinct from the rows that pass under a sticky header. */
.jw-dt-th {
    position: sticky;
    top: 0;
    border-bottom: 2px solid var(--dt-border-strong);
    background: var(--dt-surface);
    z-index: 2;
    white-space: nowrap;
    font-weight: 700;
}
/* A cell focused under the sticky header scrolls out from under it (set from JS). */
.jw-dt-td { scroll-margin-top: var(--dt-head-h, 0px); }
/* stickyHeader: the header follows the page, shifted from JS (ui/stickyHead.js);
   the viewport's scroll margin carries the offset below a fixed bar of the page. */
.jw-dt-viewport.is-sticky-head { scroll-margin-top: var(--jw-dt-sticky-top, 0px); }
.is-sticky-head .jw-dt-th { transform: translateY(var(--dt-head-shift, 0px)); }
.is-sticky-head .jw-dt-td { scroll-margin-top: calc(var(--dt-head-h, 0px) + var(--jw-dt-sticky-top, 0px)); }
/* While rows lie under the header, it casts a shadow on them (box-shadow is
   taken by the pin edge and the drop marker). */
.is-head-stuck .jw-dt-th::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    height: 6px;
    pointer-events: none;
    background: linear-gradient(rgba(0,0,0,0.14), transparent);
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
`;
