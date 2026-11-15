// Context menu, overlay panels and dialogs, their bottom sheets, form fields.

export const overlayStyles = `
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
    /* As wide as the content needs within these limits, so long column names,
       values and view names don't wrap; overlay.js keeps the width it opened
       with, so the panel doesn't jump while its content changes. */
    width: max-content;
    min-width: min(280px, calc(100vw - 8px));
    max-width: min(32rem, calc(100vw - 8px));
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
    min-width: 0;
    max-width: none;
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
    min-width: 0;
    max-width: none;
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
`;
