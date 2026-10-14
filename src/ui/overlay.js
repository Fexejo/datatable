// Modal panels (filter, columns, saved views, export, record details).
//
// A panel is a dialog: focus moves in (to `[data-autofocus]` or the first
// control), Tab cycles inside, Escape closes, and focus returns to the opener.
// Everything outside is inert, as `aria-modal` tells assistive tech: a
// backdrop under the panel takes the pointer (no hover or click reaches the
// page behind), and a click on it only closes the panel. Dialogs dim the page. Each panel brings its own live region
// (`[data-live]`), because everything outside a modal is hidden from
// assistive tech. On mobile every panel is a bottom sheet.

import { el, deepActiveElement, focusIsLost, focusables, placePopup } from "./dom.js";
import { closeContextMenu } from "./contextMenu.js";
import { uid } from "../core/util.js";

export class Overlay {
    // `root`: the shadow root the panels go into.
    // `restoreFocus(key)`: focuses the element with that focus key.
    /**
     * @param {ShadowRoot} root
     * @param {{ restoreFocus: (key: string|null) => void }} options
     */
    constructor(root, { restoreFocus }) {
        this._root = root;
        this._restoreFocus = restoreFocus;
        /** @type {HTMLElement|null} */
        this.panel = null;
        // Focus key to return to on close (may be re-targeted while open).
        /** @type {string|null} */
        this.returnKey = null;
        // Focus key of the opener button (it carries `aria-expanded`).
        /** @type {string|null} */
        this.openerKey = null;
        /** @type {HTMLElement|null} */
        this._backdrop = null;
        /** @type {((event: PointerEvent) => void)|null} */
        this._onOutside = null;
        /** @type {((event: KeyboardEvent) => void)|null} */
        this._onKey = null;
        /** @type {() => void} */
        this._escape = () => this.close();
    }

    /** @param {HTMLElement|null} [panel] */
    isOpen(panel = null) {
        return panel ? this.panel === panel : this.panel !== null;
    }

    // The open panel's live region, or null.
    /** @returns {HTMLElement|null} */
    liveRegion() {
        return this.panel?.querySelector("[data-live]") ?? null;
    }

    // `anchor`: the opener; the popover is placed below it. `centered`: a
    // dialog in the middle of the screen that dims the page. `sheet`: a bottom
    // sheet (mobile).
    // `onEscape`: called instead of closing on Escape (e.g. to step back to
    // the panel this one was opened from).
    /**
     * @param {HTMLElement} panel
     * @param {{ anchor?: HTMLElement|null, returnKey?: string|null, centered?: boolean, sheet?: boolean,
     *     onEscape?: (() => void)|null }} [options]
     */
    show(panel, { anchor = null, returnKey = null, centered = false, sheet = false, onEscape = null } = {}) {
        this.close();
        closeContextMenu();
        panel.classList.add("jw-dt-overlay");
        panel.appendChild(el("div", { "data-live": "", "aria-live": "polite", "aria-atomic": "true", class: "jw-dt-sr-only" }));
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-modal", "true");
        const head = panel.querySelector(".jw-dt-panel-head");
        if (head) {
            head.id = uid("jwdt-dlg");
            panel.setAttribute("aria-labelledby", head.id);
        }

        if (sheet) panel.classList.add("jw-dt-overlay--sheet");
        else if (centered) panel.classList.add("jw-dt-overlay--dialog");
        const backdrop = el("div", { class: "jw-dt-backdrop" + (centered ? " jw-dt-backdrop--dim" : ""), "aria-hidden": "true" });
        // Focus stays in the panel until the click closes it, then returns to the opener.
        backdrop.addEventListener("mousedown", (event) => event.preventDefault());
        backdrop.addEventListener("click", () => { if (this.panel === panel) this.close(); });
        this._backdrop = backdrop;
        this._root.append(backdrop, panel);
        if (!sheet && !centered) {
            // Position synchronously so the panel can take focus right away.
            const a = anchor?.isConnected ? anchor.getBoundingClientRect() : { left: 0, top: 0, bottom: 0 };
            placePopup(panel, a.left, a.bottom + 4, { flipTop: a.top });
        }

        this.panel = panel;
        this.returnKey = returnKey;
        this._escape = onEscape ?? (() => this.close());
        this.openerKey = anchor?.dataset?.fk ?? null;
        if (this.openerKey) anchor?.setAttribute("aria-expanded", "true");

        panel.addEventListener("keydown", (event) => this._onPanelKey(event, panel));
        /** @type {HTMLElement|undefined} */
        const initial = panel.querySelector("[data-autofocus]") || focusables(panel)[0];
        if (initial) initial.focus();
        else { panel.tabIndex = -1; panel.focus(); }

        this._onOutside = (event) => {
            const path = event.composedPath ? event.composedPath() : [event.target];
            // The backdrop handles its own click; this catches whatever lies above it.
            if (!path.includes(panel) && !path.includes(anchor) && !path.includes(backdrop)) this.close({ restoreFocus: false });
        };
        // Escape inside the panel is the panel's own (a step inside may handle it).
        this._onKey = (event) => {
            if (event.key === "Escape" && !event.composedPath().includes(panel)) this._escape();
        };
        // Next tick, so the opening click does not close the panel right away.
        const { _onOutside: onOutside, _onKey: onKey } = this;
        setTimeout(() => {
            if (this.panel !== panel) return;
            document.addEventListener("pointerdown", onOutside, true);
            document.addEventListener("keydown", onKey, true);
        }, 0);
    }

    // `restoreFocus`: return focus to the opener if it was inside the panel
    // or got lost (not when the user clicked elsewhere).
    close({ restoreFocus = true } = {}) {
        if (!this.panel) return;
        const panel = this.panel;
        const hadFocus = panel.contains(deepActiveElement());
        this.panel = null;
        panel.remove();
        this._backdrop?.remove();
        this._backdrop = null;
        if (this._onOutside) document.removeEventListener("pointerdown", this._onOutside, true);
        if (this._onKey) document.removeEventListener("keydown", this._onKey, true);
        if (this.openerKey) {
            this._root.querySelector(`[data-fk="${CSS.escape(this.openerKey)}"]`)?.setAttribute("aria-expanded", "false");
        }
        this.openerKey = null;
        if (restoreFocus && (hadFocus || focusIsLost())) this._restoreFocus(this.returnKey);
    }

    /**
     * @param {KeyboardEvent} event
     * @param {HTMLElement} panel
     */
    _onPanelKey(event, panel) {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            this._escape();
        } else if (event.key === "Tab") {
            const items = focusables(panel);
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            const active = deepActiveElement();
            if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
        }
    }
}
