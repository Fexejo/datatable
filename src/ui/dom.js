// DOM building blocks and focus helpers shared by the component, its panels
// and the context menu.

import { createIcon } from "./icons.js";

// Creates an element. `props`: `class`, `text`, `dataset`, `on<event>`
// handlers, attributes (names with "-", `for`, `role`) and other properties;
// null/false values are skipped. `children`: nodes or strings (null/false skipped).
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
            try { node[key] = value; } catch { node.setAttribute(key, value); }
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
export function iconEl(name, className = "k-dt-ic") {
    return el("span", { class: className }, [createIcon(name)]);
}

// Segmented control: native radios (one tab stop, arrow keys, "selected,
// 1 of 3" for screen readers) drawn as adjacent options in one track.
// `options`: [value, text, detail?]; `detail` is a second, smaller line.
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
export function switchEl(text, checked, props = {}) {
    return el("label", { class: "k-dt-switch" }, [
        el("span", { class: "k-dt-switch-label", text }),
        el("input", { type: "checkbox", role: "switch", checked, ...props })
    ]);
}

// ---- Focus ------------------------------------------------------------------

// The focused element, looking into (nested) shadow roots.
export function deepActiveElement() {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
}

// True when nothing useful has focus (e.g. the focused element was removed).
export function focusIsLost() {
    const active = deepActiveElement();
    return !active || active === document.body || !active.isConnected;
}

// Visible, enabled elements in `container` that take focus with Tab.
export function focusables(container) {
    return Array.from(container.querySelectorAll(
        'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'
    )).filter((n) => !n.disabled && n.getClientRects().length > 0);
}

// ---- Popups -----------------------------------------------------------------

// Positions a `position: fixed` popup at (left, top) inside the viewport
// (4px margin). When it does not fit below, it moves up — or, with `flipTop`,
// above that y coordinate (e.g. the top of the anchor).
export function placePopup(node, left, top, { flipTop = null } = {}) {
    const rect = node.getBoundingClientRect();
    if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 4;
    if (top + rect.height > window.innerHeight) {
        top = flipTop != null ? flipTop - rect.height - 4 : window.innerHeight - rect.height - 4;
    }
    node.style.left = `${Math.max(4, left)}px`;
    node.style.top = `${Math.max(4, top)}px`;
}

// ---- Misc ---------------------------------------------------------------------

// Shortens `text` to `max` characters with an ellipsis.
export function truncate(text, max = 30) {
    const str = String(text);
    return str.length > max ? str.slice(0, max - 1) + "…" : str;
}
