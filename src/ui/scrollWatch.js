// Watches the scrolling that moves an element in the page: the window's or
// that of its nearest scrolling ancestor (found across shadow roots). Things
// that follow the page from JS (sticky header, sticky scrollbar) are updated
// once per frame on scrolling and on resizing the window.

export class ScrollWatch {
    /** @param {() => void} onChange */
    constructor(onChange) {
        /** @type {Element|Window|null} The watched scroller; null while nothing is watched. */
        this.scroller = null;
        this._frame = 0;
        this._onScroll = () => {
            this._frame ||= requestAnimationFrame(() => {
                this._frame = 0;
                onChange();
            });
        };
    }

    // Watches the scroller of `node`, again after the node moved; null stops watching.
    /** @param {Element|null} node */
    watch(node) {
        const scroller = node ? scrollParent(node) : null;
        if (scroller === this.scroller) return;
        this.scroller?.removeEventListener("scroll", this._onScroll);
        scroller?.addEventListener("scroll", this._onScroll, { passive: true });
        if (!scroller) {
            removeEventListener("resize", this._onScroll);
            cancelAnimationFrame(this._frame);
            this._frame = 0;
        } else if (!this.scroller) addEventListener("resize", this._onScroll, { passive: true });
        this.scroller = scroller;
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
