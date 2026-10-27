// Card layout and the label/value list (cards, details dialog).

export const cardStyles = `
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
`;
