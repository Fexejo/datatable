// Accessibility: hidden content, focus outlines, no text selection on long-press.

export const a11yStyles = `
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

/* Suppress the long-press text selection / callout on touch so our context menu wins. */
@media (pointer: coarse) {
    .jw-dt-th, .jw-dt-td, .jw-dt-card {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
    }
}
`;
