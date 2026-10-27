// Saved views panel and filter summary.

export const panelStyles = `
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
.jw-dt-views-rename { display: flex; flex-direction: column; align-items: stretch; gap: var(--jw-dt-space-s, 8px); }
/* While a question, the rename field or a view's menu is open, the rest of the panel is inert. */
.jw-dt-views-panel [data-inert] { opacity: 0.4; }
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
.jw-dt-views-text { display: flex; flex-direction: column; min-width: 0; }
.jw-dt-views-detail { color: var(--jw-dt-color-text-muted, #666); font-size: 0.82rem; overflow-wrap: anywhere; }
.jw-dt-views-load[aria-current="true"] .jw-dt-views-detail { font-weight: 400; }
.jw-dt-views-item .jw-dt-views-share[aria-pressed="true"] {
    background: var(--dt-accent);
    border-color: var(--dt-accent);
    color: var(--dt-accent-text);
}
.jw-dt-views-load:hover { background: var(--dt-hover); }
.jw-dt-views-empty { margin: 0; color: var(--jw-dt-color-text-muted, #666); font-size: 0.88rem; }
.jw-dt-views-group { display: flex; flex-direction: column; gap: var(--jw-dt-space-2xs, 4px); }
.jw-dt-views-group-head { margin: 0; font-size: 0.88rem; font-weight: 600; }
.jw-dt-views-group-head .jw-dt-disclosure { font-weight: inherit; }

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
`;
