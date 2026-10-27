// Host variables, toolbar and buttons (base: Mobile First).

export const baseStyles = `
:host {
    display: block;
    /* As a flex/grid item, shrink to the track and scroll inside instead of
       stretching the layout to the table's width. */
    min-width: 0;
    font-family: var(--jw-dt-font-family, system-ui, sans-serif);
    color: var(--jw-dt-color-text, #222);
    --dt-border: var(--jw-dt-color-border, #d8d8d8);
    /* Form fields: their border is all that shows where to type (3:1, WCAG 1.4.11). */
    --dt-border-strong: var(--jw-dt-color-border-strong, #808080);
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
    border: 1px solid var(--dt-border-strong);
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
`;
