// Minimal in-browser test harness — no dependencies.
//
// Works in two modes:
// - Manually: open tests/browser/index.html over HTTP; results render on the page.
// - Automated: tests/run.js drives headless Chromium and reads `window.__testResults`.
//   It also exposes a `__cdpSend` binding so tests can send *trusted* keyboard,
//   mouse and touch input and change the viewport (`cdp: true` tests are
//   skipped without it).

const tests = [];

/**
 * Registers a test.
 * @param {string} name
 * @param {() => Promise<void>|void} fn
 * @param {{ cdp?: boolean }} [options] cdp: needs trusted input (runner only).
 */
export function test(name, fn, options = {}) {
    tests.push({ name, fn, ...options });
}

// ---- Assertions ---------------------------------------------------------

class AssertionError extends Error {}

function fail(message, actual, expected) {
    const detail = arguments.length > 1
        ? `\n  actual:   ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`
        : "";
    throw new AssertionError(message + detail);
}

export const assert = {
    ok(value, message = "expected truthy value") {
        if (!value) fail(message);
    },
    equal(actual, expected, message = "values differ") {
        if (!Object.is(actual, expected)) fail(message, actual, expected);
    },
    deepEqual(actual, expected, message = "values differ") {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(message, actual, expected);
    },
    match(actual, regex, message = "no match") {
        if (!regex.test(String(actual))) fail(message, actual, String(regex));
    }
};

// ---- Helpers --------------------------------------------------------------

// Two animation frames; the timeout keeps tests from hanging where frames are
// paused (background tab, headless with virtual time).
export const nextFrame = () => Promise.race([
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    new Promise((r) => setTimeout(r, 100))
]);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls `predicate` until it returns a truthy value (or throws on timeout). */
export async function waitFor(predicate, { timeout = 2000, message = "waitFor timed out" } = {}) {
    const start = performance.now();
    for (;;) {
        const result = predicate();
        if (result) return result;
        if (performance.now() - start > timeout) fail(message);
        await sleep(16);
    }
}

/** The element that has focus, descending into shadow roots. */
export function deepActiveElement() {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
}

/**
 * Accessible name approximation for the elements this component renders:
 * aria-label > aria-labelledby > text content (ignoring aria-hidden) > title.
 */
export function accessibleName(node) {
    const label = node.getAttribute("aria-label");
    if (label) return label.trim();
    const ids = node.getAttribute("aria-labelledby");
    if (ids) {
        const root = node.getRootNode();
        return ids.split(/\s+/).map((id) => root.getElementById(id)?.textContent ?? "").join(" ").trim();
    }
    const text = (function collect(n) {
        if (n.nodeType === Node.TEXT_NODE) return n.textContent;
        if (n.nodeType !== Node.ELEMENT_NODE || n.getAttribute("aria-hidden") === "true") return "";
        return Array.from(n.childNodes).map(collect).join("");
    })(node).trim();
    return text || (node.getAttribute("title") ?? "").trim();
}

// ---- Trusted input via Chrome DevTools Protocol (runner only) ----------

const pending = new Map();
let seq = 0;
window.__cdpResolve = (id, error) => {
    const entry = pending.get(id);
    pending.delete(id);
    if (error) entry?.reject(new Error(error)); else entry?.resolve();
};

export const hasCdp = () => typeof window.__cdpSend === "function";

function cdp(method, params) {
    if (!hasCdp()) throw new Error("CDP not available (run via tests/run.js)");
    return new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        window.__cdpSend(JSON.stringify({ id, method, params }));
    });
}

const KEYS = {
    Tab: { code: "Tab", keyCode: 9 },
    Enter: { code: "Enter", keyCode: 13, text: "\r" },
    Escape: { code: "Escape", keyCode: 27 },
    Backspace: { code: "Backspace", keyCode: 8 },
    " ": { code: "Space", keyCode: 32, text: " " },
    ArrowUp: { code: "ArrowUp", keyCode: 38 },
    ArrowDown: { code: "ArrowDown", keyCode: 40 },
    ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
    ArrowRight: { code: "ArrowRight", keyCode: 39 },
    Home: { code: "Home", keyCode: 36 },
    End: { code: "End", keyCode: 35 },
    F10: { code: "F10", keyCode: 121 },
    ContextMenu: { code: "ContextMenu", keyCode: 93 }
};
const MODIFIERS = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };

export const input = {
    /** Presses a key as a real user would. `modifiers`: ["Shift", …]. */
    async press(key, modifiers = []) {
        const def = KEYS[key] ?? { code: `Key${key.toUpperCase()}`, keyCode: key.toUpperCase().charCodeAt(0), text: key };
        const base = {
            key,
            code: def.code,
            windowsVirtualKeyCode: def.keyCode,
            modifiers: modifiers.reduce((m, k) => m | (MODIFIERS[k] ?? 0), 0)
        };
        await cdp("Input.dispatchKeyEvent", { type: def.text ? "keyDown" : "rawKeyDown", text: def.text, ...base });
        await cdp("Input.dispatchKeyEvent", { type: "keyUp", ...base });
        await nextFrame();
    },
    /** Clicks the center of `element` with a real (trusted) mouse event. */
    async click(element) {
        element.scrollIntoView({ block: "center" });
        const r = element.getBoundingClientRect();
        await input.clickAt(r.left + r.width / 2, r.top + r.height / 2);
    },
    /** Clicks the viewport point (x, y) with a real mouse event, whatever lies there. */
    async clickAt(x, y) {
        const base = { x, y, button: "left", clickCount: 1 };
        await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...base });
        await cdp("Input.dispatchMouseEvent", { type: "mousePressed", ...base });
        await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", ...base });
        await nextFrame();
    },
    /** Holds a finger on the center of `element` for `ms`, then lifts it. */
    async longPress(element, ms = 600) {
        element.scrollIntoView({ block: "center" });
        const r = element.getBoundingClientRect();
        const point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        await cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
        await sleep(ms);
        await cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await nextFrame();
    },
    /** Emulates a viewport size (e.g. mobile); `null` resets. */
    async viewport(width, height = 800) {
        if (width == null) await cdp("Emulation.clearDeviceMetricsOverride", {});
        else await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 640 });
        await nextFrame();
    }
};

// ---- Runner ---------------------------------------------------------------

export async function run({ filter } = {}) {
    const results = [];
    for (const t of tests) {
        if (filter && !t.name.includes(filter)) continue;
        if (t.cdp && !hasCdp()) {
            results.push({ name: t.name, status: "skip", message: "needs tests/run.js (trusted input)" });
            continue;
        }
        const start = performance.now();
        try {
            await t.fn();
            results.push({ name: t.name, status: "pass", ms: Math.round(performance.now() - start) });
        } catch (error) {
            results.push({ name: t.name, status: "fail", message: error?.stack || String(error) });
        } finally {
            document.getElementById("fixture")?.replaceChildren();
            if (hasCdp()) await input.viewport(null).catch(() => {});
        }
    }
    return results;
}
