#!/usr/bin/env node
// Test runner — Node only; the browser tests load axe-core from node_modules (npm ci).
//
//   node tests/run.js            unit + browser tests
//   node tests/run.js --unit     unit tests only (node:test)
//   node tests/run.js --browser  browser tests only (headless Chromium)
//   node tests/run.js --browser --filter "context menu"
//   node tests/run.js --browser --dist   browser tests against dist/jw-datatable.min.js
//
// Browser tests need a Chromium-based browser. Set CHROME_BIN, or have one on
// PATH (chromium, google-chrome, …), or a Playwright-cached headless shell.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const only = args.includes("--unit") ? "unit" : args.includes("--browser") ? "browser" : null;
const filterIndex = args.indexOf("--filter");
const filter = filterIndex >= 0 ? args[filterIndex + 1] : null;
const dist = args.includes("--dist");

// ---- Unit tests -----------------------------------------------------------

function runUnit() {
    const dir = join(ROOT, "tests", "unit");
    const files = readdirSync(dir).filter((f) => f.endsWith(".test.js")).map((f) => join(dir, f));
    const extra = filter ? ["--test-name-pattern", filter] : [];
    return new Promise((done) => {
        const child = spawn(process.execPath, ["--test", ...extra, ...files], { stdio: "inherit" });
        child.on("exit", (code) => done(code === 0));
    });
}

// ---- Static file server ---------------------------------------------------

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

function startServer() {
    const server = createServer((req, res) => {
        const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
        const file = join(ROOT, path);
        if (!file.startsWith(ROOT + sep) || !existsSync(file) || !statSync(file).isFile()) {
            res.writeHead(404).end("Not found");
            return;
        }
        res.writeHead(200, { "Content-Type": (MIME[extname(file)] ?? "application/octet-stream") + "; charset=utf-8" });
        res.end(readFileSync(file));
    });
    return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

// ---- Browser discovery ----------------------------------------------------

function findChrome() {
    if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
    const pathDirs = (process.env.PATH ?? "").split(":");
    for (const name of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome"]) {
        for (const dir of pathDirs) if (existsSync(join(dir, name))) return join(dir, name);
    }
    const cache = join(homedir(), ".cache", "ms-playwright");
    if (existsSync(cache)) {
        for (const dir of readdirSync(cache).sort().reverse()) {
            for (const rel of ["chrome-headless-shell-linux64/chrome-headless-shell", "chrome-linux/chrome", "chrome-linux64/chrome"]) {
                const candidate = join(cache, dir, rel);
                if (existsSync(candidate)) return candidate;
            }
        }
    }
    return null;
}

// ---- Chrome DevTools Protocol (built-in WebSocket) ------------------------

function connect(url) {
    const ws = new WebSocket(url);
    let id = 0;
    const calls = new Map();
    const listeners = [];
    ws.addEventListener("message", (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && calls.has(msg.id)) {
            const { resolve: ok, reject } = calls.get(msg.id);
            calls.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message)); else ok(msg.result);
        } else if (msg.method) {
            listeners.forEach((fn) => fn(msg));
        }
    });
    const send = (method, params = {}, sessionId) => new Promise((ok, reject) => {
        const callId = ++id;
        calls.set(callId, { resolve: ok, reject });
        ws.send(JSON.stringify({ id: callId, method, params, sessionId }));
    });
    return new Promise((ok, reject) => {
        ws.addEventListener("open", () => ok({ send, on: (fn) => listeners.push(fn), close: () => ws.close() }));
        ws.addEventListener("error", () => reject(new Error(`cannot connect to ${url}`)));
    });
}

function launchChrome(bin, profileDir) {
    const child = spawn(bin, [
        "--headless", "--no-sandbox", "--disable-gpu", "--no-first-run",
        "--remote-debugging-port=0", `--user-data-dir=${profileDir}`,
        "--window-size=1280,900", "about:blank"
    ], { stdio: ["ignore", "ignore", "pipe"] });
    return new Promise((ok, reject) => {
        let buffer = "";
        const timer = setTimeout(() => reject(new Error("Chrome did not start:\n" + buffer)), 15000);
        child.stderr.on("data", (chunk) => {
            buffer += chunk;
            const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
            if (match) { clearTimeout(timer); ok({ child, wsUrl: match[1] }); }
        });
        child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`Chrome exited (${code}):\n${buffer}`)); });
    });
}

// Only these CDP methods may be triggered from the test page.
const ALLOWED_FROM_PAGE = new Set([
    "Input.dispatchKeyEvent", "Input.dispatchMouseEvent",
    "Emulation.setDeviceMetricsOverride", "Emulation.clearDeviceMetricsOverride"
]);

async function runBrowser() {
    if (dist && !existsSync(join(ROOT, "dist", "jw-datatable.min.js"))) {
        console.error("✖ dist/jw-datatable.min.js not found. Run: node tools/build.js");
        return false;
    }
    const bin = findChrome();
    if (!bin) {
        console.error("✖ No Chromium found. Set CHROME_BIN or install chromium / google-chrome.");
        return false;
    }
    const server = await startServer();
    const profileDir = mkdtempSync(join(tmpdir(), "jw-datatable-test-"));
    let chrome;
    try {
        chrome = await launchChrome(bin, profileDir);
        const browser = await connect(chrome.wsUrl);
        const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
        const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
        const page = (method, params) => browser.send(method, params, sessionId);

        const pageErrors = [];
        browser.on(async (msg) => {
            if (msg.sessionId !== sessionId) return;
            if (msg.method === "Runtime.exceptionThrown") {
                pageErrors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
            } else if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
                pageErrors.push(`console.${msg.params.type}: ` + msg.params.args.map((a) => a.value ?? a.description).join(" "));
            } else if (msg.method === "Runtime.bindingCalled" && msg.params.name === "__cdpSend") {
                const { id, method, params } = JSON.parse(msg.params.payload);
                let error = null;
                try {
                    if (!ALLOWED_FROM_PAGE.has(method)) throw new Error(`CDP method not allowed: ${method}`);
                    await page(method, params);
                } catch (e) {
                    error = e.message;
                }
                await page("Runtime.evaluate", { expression: `window.__cdpResolve(${id}, ${JSON.stringify(error)})` });
            }
        });

        await page("Runtime.enable");
        await page("Page.enable");
        await page("Runtime.addBinding", { name: "__cdpSend" });

        const params = new URLSearchParams();
        if (filter) params.set("filter", filter);
        if (dist) params.set("dist", "");
        const query = params.size ? `?${params}` : "";
        const url = `http://127.0.0.1:${server.address().port}/tests/browser/index.html${query}`;
        await page("Page.navigate", { url });

        let results = null;
        const deadline = Date.now() + 60000;
        while (!results && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 100));
            const { result } = await page("Runtime.evaluate", { expression: "window.__testResults", returnByValue: true });
            results = result.value ?? null;
        }
        if (!results) throw new Error("Browser tests did not finish within 60s.\n" + pageErrors.join("\n"));

        for (const r of results) {
            const mark = { pass: "✔", fail: "✖", skip: "○" }[r.status];
            console.log(`${mark} ${r.name}${r.ms != null ? ` (${r.ms}ms)` : ""}`);
            if (r.message && r.status !== "pass") console.log("    " + r.message.replace(/\n/g, "\n    "));
        }
        if (pageErrors.length) {
            console.log("\nPage errors / warnings:");
            pageErrors.forEach((e) => console.log("  " + e));
        }
        const failed = results.filter((r) => r.status === "fail").length;
        const passed = results.filter((r) => r.status === "pass").length;
        const skipped = results.filter((r) => r.status === "skip").length;
        console.log(`\nbrowser${dist ? " (dist)" : ""}: ${passed} passed, ${failed} failed, ${skipped} skipped`);
        browser.close();
        return failed === 0 && pageErrors.length === 0;
    } finally {
        chrome?.child.kill();
        server.close();
        rmSync(profileDir, { recursive: true, force: true });
    }
}

// ---- Main -------------------------------------------------------------------

let ok = true;
if (only !== "browser") {
    console.log("── Unit tests ──");
    ok = (await runUnit()) && ok;
}
if (only !== "unit") {
    console.log("\n── Browser tests ──");
    try {
        ok = (await runBrowser()) && ok;
    } catch (error) {
        console.error("✖ " + (error?.stack || error));
        ok = false;
    }
}
process.exit(ok ? 0 : 1);
