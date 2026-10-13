// Pinned columns and horizontal scroll shadows of the table viewport.
//
// Pinned cells are `position: sticky`; each one's `left` is the summed width
// of the sticky columns before it (`--k-dt-pin-<index>` on the table). When
// they don't all fit, the most recently pinned ones (the last ones) stay
// sticky and older ones are paused (`left: auto`, they scroll along).

// Pinned columns may cover at most this share of the visible width (the rest
// of the table must stay usable).
export const MAX_PINNED_SHARE = 0.6;

// Index of the first pin that stays sticky: the last pins whose widths add
// up to at most `limit`.
export function firstStickyPin(widths, limit) {
    let first = widths.length;
    let used = 0;
    while (first > 0 && used + widths[first - 1] <= limit) used += widths[--first];
    return first;
}

// Lays out the pinned columns in `viewport`; returns the keys of the paused ones.
export function layoutPinned(viewport) {
    const body = viewport.querySelector(".k-dt-body");
    const table = viewport.querySelector(".k-dt-table");
    const paused = [];
    let sticky = 0;
    if (table) {
        const pinned = Array.from(table.tHead.rows[0].cells).filter((th) => th.classList.contains("k-dt-pinned"));
        const widths = pinned.map((th) => th.getBoundingClientRect().width);
        const first = firstStickyPin(widths, body.clientWidth * MAX_PINNED_SHARE);
        let offset = 0;
        pinned.forEach((th, i) => {
            if (i < first) {
                table.style.setProperty(`--k-dt-pin-${i}`, "auto");
                paused.push(th.dataset.key);
            } else {
                table.style.setProperty(`--k-dt-pin-${i}`, `${offset}px`);
                offset += widths[i];
            }
        });
        sticky = pinned.length - first;
    }
    viewport.classList.toggle("has-pins", sticky > 0);
    updateScrollShadows(viewport);
    return paused;
}

// Shadows on the edges that have more content to scroll to.
export function updateScrollShadows(viewport) {
    const body = viewport.querySelector(".k-dt-body");
    if (!body) return;
    const max = body.scrollWidth - body.clientWidth;
    viewport.classList.toggle("is-overflow-left", body.scrollLeft > 1);
    viewport.classList.toggle("is-overflow-right", body.scrollLeft < max - 1);
}
