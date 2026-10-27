// Controls inside the panels: segmented control, switch, disclosure, tabs,
// checkboxes, column rows and pin toggles, panel actions.

export const controlStyles = `
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
    min-height: 44px;
}
.jw-dt-tab.is-active { background: var(--dt-accent); border-color: var(--dt-accent); color: var(--dt-accent-text); }
.jw-dt-filter-body { display: flex; flex-direction: column; gap: var(--jw-dt-space-s, 8px); }
.jw-dt-field-label { font-size: 0.85rem; font-weight: 600; }
.jw-dt-input, .jw-dt-overlay .jw-dt-select {
    font: inherit;
    color: inherit;
    width: 100%;
    background: var(--jw-dt-color-page, #fff);
    border: 1px solid var(--dt-border-strong);
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
`;
