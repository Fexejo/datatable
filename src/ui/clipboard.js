// Clipboard writes and the visual / screen-reader confirmation on copy buttons.

import { deepActiveElement, el, iconEl } from "./dom.js";

let fallbackActive = false;

// Writes `text` to the clipboard. Falls back to `execCommand("copy")` where
// the async Clipboard API is missing or refused (e.g. plain HTTP).
export function writeClipboard(text) {
    if (!navigator.clipboard?.writeText) {
        fallbackCopy(text);
        return Promise.resolve();
    }
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
}

// The helper textarea needs focus for execCommand; focus is put back
// afterwards so keyboard and screen-reader users stay where they were.
function fallbackCopy(text) {
    const previous = deepActiveElement();
    const ta = el("textarea", { value: text, readOnly: true, "aria-hidden": "true", tabIndex: -1 });
    ta.style.cssText = "position:fixed;top:0;opacity:0;";
    document.body.appendChild(ta);
    fallbackActive = true;
    try {
        ta.focus({ preventScroll: true });
        ta.select();
        try { document.execCommand("copy"); } catch { /* ignore */ }
        ta.remove();
        if (previous && previous.isConnected && previous !== document.body) previous.focus({ preventScroll: true });
    } finally {
        fallbackActive = false;
    }
}

// Confirms on the focused button itself by renaming it until it loses focus.
// Screen readers announce name changes of the focused element; unlike live
// regions this does not depend on settings (NVDA "report dynamic content
// changes"). Used instead of — not in addition to — a live region.
export function confirmOnButton(button, message) {
    if (button.dataset.label == null) {
        button.dataset.label = button.getAttribute("aria-label") || "";
        const onBlur = () => {
            if (fallbackActive) return;   // the helper textarea took focus briefly
            button.removeEventListener("blur", onBlur);
            button.setAttribute("aria-label", button.dataset.label);
            delete button.dataset.label;
            setCopied(button, false);
        };
        button.addEventListener("blur", onBlur);
    }
    // A repeated copy must still change the name; a trailing period is
    // not spoken at default punctuation levels.
    const current = button.getAttribute("aria-label");
    button.setAttribute("aria-label", current === message ? `${message}.` : message);
    setCopied(button, true);
}

// Shows the check icon briefly (the message goes to a live region instead).
export function flashCopied(button) {
    setCopied(button, true);
    clearTimeout(button._copiedTimer);
    button._copiedTimer = setTimeout(() => {
        if (button.dataset.label == null) setCopied(button, false);
    }, 1200);
}

// Visual copy confirmation: check icon + accent color.
function setCopied(button, copied) {
    button.classList.toggle("is-copied", copied);
    button.replaceChildren(iconEl(copied ? "check" : "copy"));
}
