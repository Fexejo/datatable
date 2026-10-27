// Layers on the base rules: desktop (>= 640px) and touch screens. Comes last,
// so these rules override the ones of the other parts.

export const responsiveStyles = `
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

    /* Copy button: hidden until row/cell hover; 24px (WCAG 2.5.8). */
    .jw-dt-copy { opacity: 0; width: 24px; height: 24px; margin-block: -4px; }
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
    .jw-dt-select { min-height: 0; }
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

/* ===================================================================== */
/* Touch screens (any width): 44px touch targets. Tablets keep the       */
/* desktop layout above, but get the touch sizes of the base rules and   */
/* always-visible copy buttons back (touch has no hover).                */
/* ===================================================================== */
@media (pointer: coarse) {
    .jw-dt-filter-btn, .jw-dt-pin-btn { min-width: 44px; min-height: 44px; }
    .jw-dt-check { min-height: 44px; }
    /* The copy button stays small next to the value; its tap area is 44px. */
    .jw-dt-copy { position: relative; }
    .jw-dt-copy::after { content: ""; position: absolute; inset: -8px; }
}
@media (min-width: 640px) and (pointer: coarse) {
    .jw-dt-btn, .jw-dt-icon-btn { min-height: 44px; min-width: 44px; }
    .jw-dt-pin-toggle { min-width: 44px; min-height: 44px; }
    .jw-dt-details-btn { width: 44px; height: 44px; }
    .jw-dt-copy { opacity: 1; width: 28px; height: 28px; margin-block: -6px; }
    .jw-dt-page-btn, .jw-dt-select { min-width: 44px; min-height: 44px; }
    .jw-dt-tab { min-height: 44px; padding: var(--jw-dt-space-s, 8px); }
    .jw-dt-check { padding: var(--jw-dt-space-s, 8px) var(--jw-dt-space-2xs, 4px); }
    .jw-dt-segment-text, .jw-dt-switch, .jw-dt-views-load { min-height: 44px; }
}
`;
