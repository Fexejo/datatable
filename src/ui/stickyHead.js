// Sticky table header: with `maxHeight` the rows scroll in the body under it.
//
// Cells keep a scroll margin of the header height (`--dt-head-h` on the
// viewport), so a cell that gets focus under the header scrolls out from
// under it (WCAG 2.4.11 Focus Not Obscured). The browser doesn't do that by
// itself: a cell behind a sticky header counts as visible.

/**
 * @param {HTMLElement} viewport
 * @param {boolean} sticky  Whether the header sticks; without, no margin.
 */
export function layoutHeadMargin(viewport, sticky) {
    /** @type {HTMLTableElement|null} */
    const table = sticky ? viewport.querySelector(".jw-dt-table") : null;
    const value = table?.tHead ? `${table.tHead.getBoundingClientRect().height}px` : "";
    if (viewport.style.getPropertyValue("--dt-head-h") !== value) viewport.style.setProperty("--dt-head-h", value);
}
