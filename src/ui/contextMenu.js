// Lightweight, reusable context menu.
// Rendered in the table shadow root, positioned with `position: fixed` at the pointer.
// Supports separators and icons.
//
// Keyboard (WAI-ARIA menu pattern): ArrowUp/ArrowDown move, Home/End jump,
// Enter/Space activate, Escape/Tab close. On close via keyboard or
// activation, focus returns to the opener (see `restoreFocus`).

import { createIcon } from "./icons.js";
import { deepActiveElement, el, focusIsLost, placePopup } from "./dom.js";

/**
 * @typedef {object} MenuItem
 * @property {boolean} [separator]
 * @property {string} [label]
 * @property {string} [icon]
 * @property {(event: MouseEvent) => void} [onSelect]
 */

/** @type {{ el: HTMLElement, restoreFocus?: () => void, cleanup: () => void }|null} */
let activeMenu = null;

// items: array of
//   { separator: true }
//   { label, icon?, onSelect? }
//   (null/false entries are skipped)
//
// options:
//   x, y          pointer position (ignored for `sheet`)
//   label         accessible name of the menu
//   sheet         render as bottom sheet (touch)
//   restoreFocus  () => void — called after a keyboard close / activation when
//                 focus would otherwise be lost
//   onClose       () => void
/**
 * @param {Node} root
 * @param {{ x: number, y: number, items: (MenuItem|null|false|undefined)[], label?: string,
 *     onClose?: () => void, restoreFocus?: () => void, sheet?: boolean }} options
 * @returns {HTMLElement}
 */
export function openContextMenu(root, { x, y, items, label, onClose, restoreFocus, sheet = false }) {
    closeContextMenu();

    const menu = buildMenu(items, () => closeContextMenu());
    if (label) menu.setAttribute("aria-label", label);
    if (sheet) menu.classList.add("k-ctx-menu--sheet");
    // The menu lives outside the table root, so suppress the native menu here too
    // (e.g. long-press directly on an open menu item).
    menu.addEventListener("contextmenu", (event) => event.preventDefault());
    menu.addEventListener("keydown", (event) => handleMenuKey(event, menu));
    root.appendChild(menu);

    // Position synchronously (so the menu can take focus right away).
    if (!sheet) placePopup(menu, x, y);
    focusItem(menu, menuItems(menu)[0]);

    /** @param {PointerEvent} event */
    const handleOutside = (event) => {
        const path = event.composedPath ? event.composedPath() : [event.target];
        if (!path.includes(menu)) closeContextMenu();
    };
    // Escape while focus is elsewhere (e.g. menu opened by pointer).
    /** @param {KeyboardEvent} event */
    const handleKey = (event) => {
        if (event.key === "Escape") closeContextMenu({ restoreFocus: true });
    };
    // Only a real window blur (switching apps/tabs) — element blurs inside the
    // page also reach a capturing window listener.
    /** @param {FocusEvent} event */
    const handleBlur = (event) => {
        if (event.target === window) closeContextMenu();
    };

    // Register on next tick so the opening click does not close immediately.
    const timer = setTimeout(() => {
        document.addEventListener("pointerdown", handleOutside, true);
        document.addEventListener("keydown", handleKey, true);
        window.addEventListener("blur", handleBlur, true);
    }, 0);

    activeMenu = {
        el: menu,
        restoreFocus,
        cleanup: () => {
            clearTimeout(timer);
            document.removeEventListener("pointerdown", handleOutside, true);
            document.removeEventListener("keydown", handleKey, true);
            window.removeEventListener("blur", handleBlur, true);
            onClose?.();
        }
    };
    return menu;
}

// options.restoreFocus: return focus to the opener if it would otherwise be lost.
export function closeContextMenu({ restoreFocus = false } = {}) {
    if (!activeMenu) return;
    // Clear the reference first: removing the (focused) menu fires a synchronous
    // `blur`; any re-entrant call must be a no-op, avoiding a double removal
    // ("node is no longer a child") error.
    const current = activeMenu;
    activeMenu = null;
    const hadFocus = current.el.contains(deepActiveElement());
    current.el.remove();
    current.cleanup();
    if (restoreFocus && current.restoreFocus && (hadFocus || focusIsLost())) current.restoreFocus();
}

// ---- Keyboard -------------------------------------------------------------

/**
 * @param {Element} menu
 * @returns {HTMLElement[]}
 */
function menuItems(menu) {
    return Array.from(/** @type {NodeListOf<HTMLElement>} */ (menu.querySelectorAll('[role="menuitem"]')));
}

/**
 * @param {HTMLElement} menu
 * @param {HTMLElement|undefined} item
 */
function focusItem(menu, item) {
    if (!item) return;
    menuItems(menu).forEach((i) => { i.tabIndex = -1; });
    item.tabIndex = 0;
    item.focus();
}

/**
 * @param {KeyboardEvent} event
 * @param {HTMLElement} menu
 */
function handleMenuKey(event, menu) {
    /** @type {HTMLElement|null} */
    const item = /** @type {Element} */ (event.target).closest('[role="menuitem"]');
    if (!item) return;
    const items = menuItems(menu);
    const index = items.indexOf(item);

    switch (event.key) {
        case "ArrowDown":
            focusItem(menu, items[(index + 1) % items.length]);
            break;
        case "ArrowUp":
            focusItem(menu, items[(index - 1 + items.length) % items.length]);
            break;
        case "Home":
            focusItem(menu, items[0]);
            break;
        case "End":
            focusItem(menu, items[items.length - 1]);
            break;
        case "Escape":
        case "Tab":
            closeContextMenu({ restoreFocus: true });
            break;
        default:
            return;
    }
    event.preventDefault();
    event.stopPropagation();
}

// ---- Building -------------------------------------------------------------

/**
 * @param {(MenuItem|null|false|undefined)[]} items
 * @param {() => void} requestClose
 * @returns {HTMLElement}
 */
function buildMenu(items, requestClose) {
    return el("div", { class: "k-ctx-menu", role: "menu" }, items.map((item) => {
        if (!item) return null;
        if (item.separator) return el("div", { class: "k-ctx-sep", role: "separator" });
        return el("button", {
            type: "button",
            class: "k-ctx-item",
            role: "menuitem",
            tabIndex: -1,
            onclick: (event) => {
                event.preventDefault();
                event.stopPropagation();
                // Close first so the action may move focus (e.g. open a panel);
                // focus is only restored if nothing else took it.
                const restore = activeMenu?.restoreFocus;
                requestClose();
                item.onSelect?.(event);
                if (focusIsLost()) restore?.();
            }
        }, [
            el("span", { class: "k-ctx-icon" }, [item.icon ? createIcon(item.icon) : null]),
            el("span", { class: "k-ctx-label", text: item.label ?? "" })
        ]);
    }));
}
