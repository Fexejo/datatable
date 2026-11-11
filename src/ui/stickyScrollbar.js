// Sticky horizontal scrollbar: while a table is wider than its viewport and
// its bottom edge (with the body's own scrollbar) lies below the visible area,
// a second scrollbar is kept at the bottom of the window (or of the nearest
// scrolling ancestor), so the columns on the right can be reached without
// Shift + wheel. It gives way once the body's own scrollbar comes into view.
//
// The bar is an empty `overflow-x: scroll` element at the viewport's bottom
// (`.jw-dt-hscroll`) whose track spans the body's scroll range, so both scroll
// the same distance; their `scrollLeft` follows in both directions. Like the
// sticky header it is lifted with `translateY`: `.jw-dt` clips
// (`overflow: hidden`) and the body scrolls itself, so CSS sticky can't follow
// the page. `--jw-dt-sticky-bottom` leaves room for a fixed bar of the page below.
//
// It is a mouse aid only (`aria-hidden`, out of the tab order): keyboard users
// scroll with the arrow keys in the table, touch users swipe. Where scrollbars
// take no room (overlay scrollbars, touch) it isn't shown. While it is in use,
// cells keep a scroll margin of its height (`--dt-hscroll-h` on the viewport),
// so a cell that gets focus never stays hidden under it (WCAG 2.4.11).

import { el } from "./dom.js";
import { ScrollWatch } from "./scrollWatch.js";

// The bar's height beyond the scrollbar: its 1px top border and 1px track (styles/table.js).
const BAR_EXTRA = 2;

export class StickyScrollbar {
    constructor() {
        /** @type {HTMLElement|null} */
        this._viewport = null;
        this._track = el("div", { class: "jw-dt-hscroll-track" });
        this._bar = el("div", {
            class: "jw-dt-hscroll", part: "sticky-scrollbar", "aria-hidden": "true", tabIndex: -1, hidden: true,
            onscroll: () => follow(this._bar, this._body())
        }, [this._track]);
        this._scroll = new ScrollWatch(() => this.update());
    }

    // Keeps the bar under the body in `viewport`; null removes it.
    /** @param {HTMLElement|null} viewport */
    sync(viewport) {
        if (this._viewport !== viewport) {
            this._viewport?.classList.remove("is-sticky-scrollbar", "has-hscroll");
            this._viewport?.style.removeProperty("--dt-hscroll-h");
            this._bar.remove();
            this._bar.hidden = true;
            viewport?.classList.add("is-sticky-scrollbar");
            viewport?.append(this._bar);
            this._viewport = viewport;
        }
        this._scroll.watch(viewport);
        this.update();
    }

    // The body scrolled horizontally: the bar follows.
    followBody() {
        if (!this._bar.hidden) follow(this._body(), this._bar);
    }

    // Reads the positions, then shows, sizes and lifts the bar.
    update() {
        const viewport = this._viewport;
        const body = this._body();
        const scroller = this._scroll.scroller;
        if (!viewport || !body || !scroller) return;
        // The body's own horizontal scrollbar: 0 without overflow or with overlay scrollbars.
        const thickness = body.offsetHeight - body.clientHeight;
        const range = body.scrollWidth - body.clientWidth;
        const active = range > 1 && thickness > 0;
        const barHeight = thickness + BAR_EXTRA;
        let visibleBottom = document.documentElement.clientHeight;
        if (scroller instanceof Element) {
            const scrollerTop = scroller.getBoundingClientRect().top + scroller.clientTop;
            visibleBottom = Math.min(visibleBottom, scrollerTop + scroller.clientHeight);
        }
        // The offset is a length in any unit; scroll-margin-bottom resolves it to px.
        visibleBottom -= parseFloat(getComputedStyle(viewport).scrollMarginBottom) || 0;
        const bodyBox = body.getBoundingClientRect();
        const headHeight = body.querySelector("thead")?.getBoundingClientRect().height ?? 0;
        const lift = bodyBox.bottom - visibleBottom;
        // Only while the body's scrollbar is out of sight and the bar would not cover the header.
        const shown = active && lift > 0.5 && visibleBottom - bodyBox.top >= headHeight + barHeight;

        viewport.classList.toggle("has-hscroll", active);
        const margin = active ? `${barHeight}px` : "";
        if (viewport.style.getPropertyValue("--dt-hscroll-h") !== margin) viewport.style.setProperty("--dt-hscroll-h", margin);
        this._bar.hidden = !shown;
        if (!shown) return;
        const trackWidth = `${range + viewport.clientWidth}px`;
        if (this._track.style.width !== trackWidth) this._track.style.width = trackWidth;
        const transform = `translateY(${-lift}px)`;
        if (this._bar.style.transform !== transform) this._bar.style.transform = transform;
        follow(body, this._bar);
    }

    /** @returns {HTMLElement|null} */
    _body() {
        return this._viewport?.querySelector(".jw-dt-body") ?? null;
    }
}

// `to` scrolls to where `from` is; equal positions are not written, so the
// two never set each other back and forth.
/**
 * @param {HTMLElement|null} from
 * @param {HTMLElement|null} to
 */
function follow(from, to) {
    if (from && to && Math.abs(from.scrollLeft - to.scrollLeft) >= 1) to.scrollLeft = from.scrollLeft;
}
