// Footer: page info, page size and pager (base: stacked for small screens).

export const footerStyles = `
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
.jw-dt-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: var(--jw-dt-space-2xs, 4px) var(--jw-dt-space-l, 12px);
    color: var(--jw-dt-color-text-muted, #666);
}
.jw-dt-pagesize { display: flex; align-items: center; gap: var(--jw-dt-space-2xs, 4px); }
.jw-dt-select {
    min-height: 44px;
    font: inherit;
    color: inherit;
    background: var(--jw-dt-color-page, #fff);
    border: 1px solid var(--dt-border-strong);
    border-radius: var(--jw-dt-radius-s, 8px);
    padding: var(--jw-dt-space-2xs, 4px) var(--jw-dt-space-xs, 6px);
}
.jw-dt-pager { display: flex; align-items: center; justify-content: center; gap: var(--jw-dt-space-2xs, 4px); width: 100%; }
.jw-dt-page-btn {
    min-width: 44px;
    min-height: 44px;
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
.jw-dt-page-btn.is-active:hover:not(:disabled) {
    background: var(--dt-accent-hover);
    border-color: var(--dt-accent-hover);
}
/* On phones the pager keeps only first/prev/active/next/last. */
.jw-dt-page-num:not(.is-active) { display: none; }
.jw-dt-page-gap { display: none; padding: 0 var(--jw-dt-space-2xs, 4px); color: var(--jw-dt-color-text-muted, #666); }
`;
