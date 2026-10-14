// DOM building blocks and focus helpers shared by the component, its panels
// and the context menu.

import { createIcon } from "./icons.js";

// Creates an element. `props`: `class`, `text`, `dataset`, `on<event>`
// handlers, attributes (names with "-", `for`, `role`) and other properties;
// null/false values are skipped. `children`: nodes or strings (null/false skipped).
/** @typedef {Node|string|null|undefined|false} Child */
/**
 * Props of `el()`; the common handlers get the element as `currentTarget`.
 * @template {HTMLElement} E
 * @typedef {{
 *     [key: string]: any,
 *     onclick?: (event: MouseEvent & { currentTarget: E }) => void,
 *     onkeydown?: (event: KeyboardEvent & { currentTarget: E }) => void,
 *     oninput?: (event: Event & { currentTarget: E }) => void,
 *     onchange?: (event: Event & { currentTarget: E }) => void,
 *     onscroll?: (event: Event & { currentTarget: E }) => void,
 *     onsubmit?: (event: SubmitEvent & { currentTarget: E }) => void
 * }} ElProps
 */
/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {ElProps<HTMLElementTagNameMap[K]>} [props]
 * @param {Child|Child[]} [children]
 * @returns {HTMLElementTagNameMap[K]}
 */
export function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value == null || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key === "dataset") Object.assign(node.dataset, value);
        else if (key.startsWith("on") && typeof value === "function") {
            node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === "for" || key.includes("-") || key === "role") {
            node.setAttribute(key, value);
        } else {
            try { /** @type {any} */ (node)[key] = value; } catch { node.setAttribute(key, value); }
        }
    }
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
        if (child == null || child === false) continue;
        node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
}

// A decorative Lucide icon in a sizing wrapper.
/** @param {string} name */
export function iconEl(name, className = "k-dt-ic") {
    return el("span", { class: className }, [createIcon(name)]);
}

// Segmented control: native radios (one tab stop, arrow keys, "selected,
// 1 of 3" for screen readers) drawn as adjacent options in one track.
// `options`: [value, text, detail?]; `detail` is a second, smaller line.
/**
 * @param {string} name
 * @param {string} legend
 * @param {[value: string, text: string, detail?: string|null][]} options
 * @param {string} value
 */
export function segmentedEl(name, legend, options, value) {
    return el("fieldset", { class: "k-dt-fieldset" }, [
        el("legend", { class: "k-dt-field-label", text: legend }),
        el("div", { class: "k-dt-segmented" }, options.map(([optionValue, text, detail]) =>
            el("label", { class: "k-dt-segment", "data-value": optionValue }, [
                el("input", { type: "radio", name, value: optionValue, checked: optionValue === value }),
                el("span", { class: "k-dt-segment-text" }, [
                    text,
                    // The space keeps the accessible name readable ("Current page 10 rows").
                    detail && " ",
                    detail && el("span", { class: "k-dt-segment-detail", text: detail })
                ])
            ])))
    ]);
}

// On/off switch: a native checkbox with role="switch" (announced as
// "switch, on/off", Space toggles); the whole row is the click target.
// `props` go to the input (e.g. `onchange`).
/**
 * @param {string} text
 * @param {boolean} checked
 * @param {Record<string, any>} [props]
 */
export function switchEl(text, checked, props = {}) {
    return el("label", { class: "k-dt-switch" }, [
        el("span", { class: "k-dt-switch-label", text }),
        el("input", { type: "checkbox", role: "switch", checked, ...props })
    ]);
}

// ---- Focus ------------------------------------------------------------------

// The focused element, looking into (nested) shadow roots.
/** @returns {HTMLElement|null} */
export function deepActiveElement() {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return /** @type {HTMLElement|null} */ (active);
}

// True when nothing useful has focus (e.g. the focused element was removed).
export function focusIsLost() {
    const active = deepActiveElement();
    return !active || active === document.body || !active.isConnected;
}

// Puts `nodes` (new or existing children) into `container` in this order
// without moving the one that contains the focus: moving a focused element
// drops focus. Returns that node, if any.
/**
 * @template {Element} T
 * @param {Element} container
 * @param {T[]} nodes
 * @returns {T|undefined}
 */
export function reorderAroundFocus(container, nodes) {
    const active = deepActiveElement();
    const anchor = nodes.find((node) => node.contains(active));
    const at = anchor ? nodes.indexOf(anchor) : -1;
    nodes.forEach((node, i) => {
        if (i < at) container.insertBefore(node, anchor ?? null);
        else if (i > at) container.appendChild(node);
    });
    return anchor;
}

// Visible, enabled elements in `container` that take focus with Tab.
/**
 * @param {ParentNode} container
 * @returns {HTMLElement[]}
 */
export function focusables(container) {
    /** @type {NodeListOf<HTMLElement & { disabled?: boolean }>} */
    const nodes = container.querySelectorAll(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'
    );
    return Array.from(nodes).filter((n) => !n.disabled && n.getClientRects().length > 0);
}

// ---- Popups -----------------------------------------------------------------

// Positions a `position: fixed` popup at (left, top) inside the viewport
// (4px margin). When it does not fit below, it moves up — or, with `flipTop`,
// above that y coordinate (e.g. the top of the anchor).
/**
 * @param {HTMLElement} node
 * @param {number} left
 * @param {number} top
 * @param {{ flipTop?: number|null }} [options]
 */
export function placePopup(node, left, top, { flipTop = null } = {}) {
    const rect = node.getBoundingClientRect();
    if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 4;
    if (top + rect.height > window.innerHeight) {
        top = flipTop != null ? flipTop - rect.height - 4 : window.innerHeight - rect.height - 4;
    }
    node.style.left = `${Math.max(4, left)}px`;
    node.style.top = `${Math.max(4, top)}px`;
}
