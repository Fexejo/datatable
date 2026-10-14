// Pinned columns and horizontal scroll shadows of the table viewport.
//
// Pinned cells are `position: sticky`; each one's `left` is the summed width
// of the sticky columns before it (`--dt-pin-<index>` on the viewport). When
// they don't all fit, the most recently pinned ones (the last ones) stay
// sticky and older ones are paused (`left: auto`, they scroll along).
//
// With thousands of rows, every layout of the table is expensive:
// `layoutPinned` reads all measurements first (one layout), then writes only
// values that changed. The offsets sit on the viewport, which outlives a re-rendered body,
// so a new table usually inherits the right values and needs no restyle.

// Pinned columns may cover at most this share of the visible width (the rest
// of the table must stay usable).
export const MAX_PINNED_SHARE = 0.6;

// Index of the first pin that stays sticky: the last pins whose widths add
// up to at most `limit`.
/**
 * @param {number[]} widths
 * @param {number} limit
 */
export function firstStickyPin(widths, limit) {
    let first = widths.length;
    let used = 0;
    while (first > 0 && used + widths[first - 1] <= limit) used += widths[--first];
    return first;
}

// Lays out the pinned columns in `viewport`; returns the keys of the paused ones.
/**
 * @param {HTMLElement} viewport
 * @returns {string[]}
 */
export function layoutPinned(viewport) {
    /** @type {HTMLElement|null} */
    const body = viewport.querySelector(".jw-dt-body");
    /** @type {HTMLTableElement|null} */
    const table = viewport.querySelector(".jw-dt-table");
    // Read …
    const pinned = table?.tHead
        ? Array.from(table.tHead.rows[0].cells).filter((th) => th.classList.contains("jw-dt-pinned"))
        : [];
    const widths = pinned.map((th) => th.getBoundingClientRect().width);
    const first = body && pinned.length ? firstStickyPin(widths, body.clientWidth * MAX_PINNED_SHARE) : 0;
    const shadows = scrollShadows(body);
    // … then write.
    /** @type {string[]} */
    const paused = [];
    let offset = 0;
    pinned.forEach((th, i) => {
        let value;
        if (i < first) {
            value = "auto";
            paused.push(th.dataset.key ?? "");
        } else {
            value = `${offset}px`;
            offset += widths[i];
        }
        const name = `--dt-pin-${i}`;
        if (viewport.style.getPropertyValue(name) !== value) viewport.style.setProperty(name, value);
    });
    viewport.classList.toggle("has-pins", pinned.length - first > 0);
    applyScrollShadows(viewport, shadows);
    return paused;
}

// Shadows on the edges that have more content to scroll to.
/** @param {HTMLElement} viewport */
export function updateScrollShadows(viewport) {
    applyScrollShadows(viewport, scrollShadows(viewport.querySelector(".jw-dt-body")));
}

/** @param {Element|null} body */
function scrollShadows(body) {
    if (!body) return null;
    const max = body.scrollWidth - body.clientWidth;
    return { left: body.scrollLeft > 1, right: body.scrollLeft < max - 1 };
}

/**
 * @param {HTMLElement} viewport
 * @param {{ left: boolean, right: boolean }|null} shadows
 */
function applyScrollShadows(viewport, shadows) {
    if (!shadows) return;
    viewport.classList.toggle("is-overflow-left", shadows.left);
    viewport.classList.toggle("is-overflow-right", shadows.right);
}
