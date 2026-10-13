// Applies the component CSS to a shadow root. The CSS is parsed once into a
// constructed stylesheet shared by all tables; extra CSS (`config.styles`)
// becomes a second, per-table sheet.

import { datatableStyles } from "./styles.js";

/** @type {CSSStyleSheet|null} */
let componentSheet = null;

function supportsAdoptedStyles() {
    return typeof CSSStyleSheet === "function" && "adoptedStyleSheets" in ShadowRoot.prototype;
}

/** @param {ShadowRoot} root */
export function applyStyles(root, extra = "") {
    if (!supportsAdoptedStyles()) {
        const style = root.querySelector("style") || root.appendChild(document.createElement("style"));
        style.textContent = datatableStyles + extra;
        return;
    }
    if (!componentSheet) {
        componentSheet = new CSSStyleSheet();
        componentSheet.replaceSync(datatableStyles);
    }
    const sheets = [componentSheet];
    if (extra) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(extra);
        sheets.push(sheet);
    }
    root.adoptedStyleSheets = sheets;
}
