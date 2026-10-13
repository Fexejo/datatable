// Polite screen-reader announcements (status messages, WCAG 4.1.3).
//
// One shared live region in the light DOM (document.body) serves all tables:
// live regions inside shadow roots are not reliably announced by screen
// readers (observed with NVDA + Chrome). It must exist before the first
// message, so tables create it when they connect.

// Visually hidden but exposed to assistive tech (inline styles: the region
// lives outside the shadow root).
const SR_ONLY_STYLE = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;"
    + "overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;";

/** @returns {HTMLElement} */
export function getAnnouncer() {
    /** @type {HTMLElement|null} */
    let node = document.querySelector("body > [data-jw-datatable-announcer]");
    if (!node) {
        node = document.createElement("div");
        node.setAttribute("data-jw-datatable-announcer", "");
        node.setAttribute("aria-live", "polite");
        node.setAttribute("aria-atomic", "true");
        node.style.cssText = SR_ONLY_STYLE;
        document.body.appendChild(node);
    }
    return node;
}

// Announces messages in the region `target()` returns — resolved when the
// text is written, since an action may close a modal panel (which has its
// own region) right after announcing.
export class Announcer {
    /** @param {() => HTMLElement} [target] */
    constructor(target = getAnnouncer) {
        this._target = target;
        /** @type {ReturnType<typeof setTimeout>|undefined} */
        this._timer = undefined;
        this._toggle = false;
    }

    /** @param {string|null|undefined} message */
    announce(message) {
        if (!message) return;
        clearTimeout(this._timer);
        this._target().textContent = "";
        // Browsers may merge "clear + set" into one update and then see no
        // change for a repeated message. An alternating invisible suffix makes
        // every announcement a real text change.
        this._toggle = !this._toggle;
        const text = message + (this._toggle ? " " : "");
        this._timer = setTimeout(() => { this._target().textContent = text; }, 100);
    }

    cancel() {
        clearTimeout(this._timer);
    }
}
