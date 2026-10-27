// Sticky table header: with `maxHeight` the rows scroll in the body under it;
// with `stickyHeader` it stays in sight while the page (or the scrolling
// element the table sits in) scrolls past the table.
//
// In the body the header is plain `position: sticky`. With the page it can't
// be: the body scrolls horizontally, and an element that scrolls on one axis
// is the sticky container on both. So the header cells are shifted down with
// `translateY` (`--dt-head-shift` on the thead) while the table passes the top
// of its scroll container, and stop at the table's end. The header stays in
// the same <table>, so its cells keep labelling their columns for assistive
// tech. `--jw-dt-sticky-top` leaves room for a fixed bar of the page above.
//
// Cells keep a scroll margin of the header height (`--dt-head-h` on the
// viewport), so a cell that gets focus under the header scrolls out from
// under it (WCAG 2.4.11 Focus Not Obscured). The browser doesn't do that by
// itself: a cell behind a sticky header counts as visible.
//
// While rows lie under the header, the viewport has `is-head-stuck`: the
// header casts a shadow on them.

import { clamp } from "../core/util.js";

// The header doesn't follow the page while it would cover more than this share
// of the visible height (zoomed in, phone in landscape): the rows must stay
// readable (WCAG 1.4.10).
export const MAX_HEAD_SHARE = 0.3;

// Where the header sticks: "body" (maxHeight), "page" (stickyHeader) or nowhere (null).
/**
 * @param {HTMLElement} viewport
 * @param {"body"|"page"|null} mode
 */
export function layoutHead(viewport, mode) {
    /** @type {HTMLTableElement|null} */
    const table = mode ? viewport.querySelector(".jw-dt-table") : null;
    const value = table?.tHead ? `${table.tHead.getBoundingClientRect().height}px` : "";
    if (viewport.style.getPropertyValue("--dt-head-h") !== value) viewport.style.setProperty("--dt-head-h", value);
    // With the page, StickyHead sets the shadow.
    if (mode === "body") updateBodyStuck(viewport);
    else if (!mode) viewport.classList.remove("is-head-stuck");
}

// maxHeight: rows lie under the header once the body is scrolled down.
/** @param {HTMLElement} viewport */
export function updateBodyStuck(viewport) {
    const body = viewport.querySelector(".jw-dt-body");
    viewport.classList.toggle("is-head-stuck", !!body && body.scrollTop > 0);
}

// Moves the header of one table along with the scrolling of the page or of
// its nearest scrolling ancestor.
export class StickyHead {
    constructor() {
        /** @type {HTMLElement|null} */
        this._viewport = null;
        /** @type {Element|Window|null} */
        this._scroller = null;
        this._frame = 0;
        this._onScroll = () => {
            this._frame ||= requestAnimationFrame(() => {
                this._frame = 0;
                this.update();
            });
        };
    }

    // Follows the header in `viewport`; null stops following.
    /** @param {HTMLElement|null} viewport */
    sync(viewport) {
        if (this._viewport && this._viewport !== viewport) {
            this._viewport.classList.remove("is-sticky-head", "is-head-stuck");
            this._head()?.style.removeProperty("--dt-head-shift");
        }
        this._viewport = viewport;
        viewport?.classList.add("is-sticky-head");
        const scroller = viewport ? scrollParent(viewport) : null;
        if (scroller !== this._scroller) {
            this._scroller?.removeEventListener("scroll", this._onScroll);
            scroller?.addEventListener("scroll", this._onScroll, { passive: true });
            if (!scroller) {
                removeEventListener("resize", this._onScroll);
                cancelAnimationFrame(this._frame);
                this._frame = 0;
            } else if (!this._scroller) addEventListener("resize", this._onScroll, { passive: true });
            this._scroller = scroller;
        }
        this.update();
    }

    // Reads the positions, then writes the shift only if it changed.
    update() {
        const head = this._head();
        const scroller = this._scroller;
        if (!this._viewport || !scroller || !head) return;
        // The offset is a length in any unit; scroll-margin-top resolves it to px.
        const offset = parseFloat(getComputedStyle(this._viewport).scrollMarginTop) || 0;
        let top = offset;
        let visible = innerHeight - offset;
        if (scroller instanceof Element) {
            top += Math.max(0, scroller.getBoundingClientRect().top + scroller.clientTop);
            visible = scroller.clientHeight - offset;
        }
        const table = /** @type {HTMLElement} */ (head.parentElement).getBoundingClientRect();
        const headHeight = head.getBoundingClientRect().height;
        const shift = headHeight > visible * MAX_HEAD_SHARE ? 0 : clamp(top - table.top, 0, table.height - headHeight);
        const value = shift > 0 ? `${shift}px` : "";
        if (head.style.getPropertyValue("--dt-head-shift") !== value) head.style.setProperty("--dt-head-shift", value);
        this._viewport.classList.toggle("is-head-stuck", shift > 0);
    }

    _head() {
        /** @type {HTMLTableElement|null|undefined} */
        const table = this._viewport?.querySelector(".jw-dt-table");
        return table?.tHead ?? null;
    }
}

// The element whose scrolling moves `node` (across shadow roots), else the window.
/**
 * @param {Element} node
 * @returns {Element|Window}
 */
function scrollParent(node) {
    for (let n = parentOf(node); n && n !== document.body && n !== document.documentElement; n = parentOf(n)) {
        const { overflowY } = getComputedStyle(n);
        if (overflowY === "auto" || overflowY === "scroll") return n;
    }
    return window;
}

/**
 * @param {Element} node
 * @returns {Element|null}
 */
function parentOf(node) {
    const parent = node.parentNode;
    return parent instanceof ShadowRoot ? parent.host : node.parentElement;
}
