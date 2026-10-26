#!/usr/bin/env node
// Test runner — Node only; the browser tests load axe-core from node_modules (npm ci).
//
//   node tests/run.js            unit + browser tests
//   node tests/run.js --unit     unit tests only (node:test)
//   node tests/run.js --browser  browser tests only (headless Chromium)
//   node tests/run.js --browser --filter "context menu"
//   node tests/run.js --browser --dist   browser tests against dist/jw-datatable.min.js,
//                                and the type test of dist/jw-datatable.min.d.ts
//   node tests/run.js --coverage [--coverage-min 95]   line coverage of datatable.js
//                                and src/ (unit + browser); fails below the minimum
//
// Browser tests need a Chromium-based browser. Set CHROME_BIN, or have one on
// PATH (chromium, google-chrome, …), or a Playwright-cached headless shell.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Coverage } from "./coverage.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const only = args.includes("--unit") ? "unit" : args.includes("--browser") ? "browser" : null;
const filterIndex = args.indexOf("--filter");
const filter = filterIndex >= 0 ? args[filterIndex + 1] : null;
const dist = args.includes("--dist");
const minIndex = args.indexOf("--coverage-min");
const coverageMin = minIndex >= 0 ? Number(args[minIndex + 1]) : null;
// The bundle has no source files to map coverage to.
const coverage = (args.includes("--coverage") || coverageMin !== null) && !dist ? new Coverage(ROOT) : null;

// ---- Unit tests -----------------------------------------------------------

function runUnit() {
    const dir = join(ROOT, "tests", "unit");
    const files = readdirSync(dir).filter((f) => f.endsWith(".test.js")).map((f) => join(dir, f));
    const extra = filter ? ["--test-name-pattern", filter] : [];
    const coverageDir = coverage ? mkdtempSync(join(tmpdir(), "jw-datatable-cov-")) : null;
    const env = coverageDir ? { ...process.env, NODE_V8_COVERAGE: coverageDir } : process.env;
    return new Promise((done) => {
        const child = spawn(process.execPath, ["--test", ...extra, ...files], { stdio: "inherit", env });
        child.on("exit", (code) => {
            if (coverageDir) {
                coverage?.addNodeDir(coverageDir);
                rmSync(coverageDir, { recursive: true, force: true });
            }
            done(code === 0);
        });
    });
}

// ---- Type test of the declarations (--dist) ------------------------------

// The bundled declarations must stand alone (no imports) and type-check
// tests/types/usage.ts, which uses them like a consuming project.
function runTypes() {
    const file = join(ROOT, "dist", "jw-datatable.min.d.ts");
    if (!existsSync(file)) {
        console.error("✖ dist/jw-datatable.min.d.ts not found. Run: node tools/build.js");
        return Promise.resolve(false);
    }
    const source = readFileSync(file, "utf8");
    const problems = [
        !/^\/\*! jw-datatable v\S+ /.test(source) && "no version banner",
        /^\s*import\b|\bfrom\s+["']|\bimport\(/m.test(source) && "imports another module"
    ].filter(Boolean);
    for (const problem of problems) console.error(`✖ dist/jw-datatable.min.d.ts: ${problem}`);
    const tsc = join(ROOT, "node_modules", "typescript", "bin", "tsc");
    return new Promise((done) => {
        const child = spawn(process.execPath, [tsc, "-p", join(ROOT, "tests", "types", "tsconfig.json")], { stdio: "inherit" });
        child.on("exit", (code) => {
            const ok = code === 0 && problems.length === 0;
            console.log(ok ? "✔ tests/types/usage.ts type-checks against the declarations" : "✖ type test failed");
            done(ok);
        });
    });
}

// ---- Static file server ---------------------------------------------------

/** @type {Record<string, string>} */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

function startServer() {
    const server = createServer((req, res) => {
        const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
        const file = join(ROOT, path);
        if (!file.startsWith(ROOT + sep) || !existsSync(file) || !statSync(file).isFile()) {
            res.writeHead(404).end("Not found");
            return;
        }
        res.writeHead(200, { "Content-Type": (MIME[extname(file)] ?? "application/octet-stream") + "; charset=utf-8" });
        res.end(readFileSync(file));
    });
    /** @type {Promise<import("node:http").Server>} */
    const listening = new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
    return listening;
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

// Protocol messages are plain JSON; their payloads stay untyped here.
/** @typedef {{ id?: number, method?: string, params?: any, result?: any, error?: { message: string }, sessionId?: string }} CdpMessage */
/**
 * @typedef {object} CdpConnection
 * @property {(method: string, params?: object, sessionId?: string) => Promise<any>} send
 * @property {(listener: (msg: CdpMessage) => void) => void} on
 * @property {() => void} close
 */

/**
 * @param {string} url
 * @returns {Promise<CdpConnection>}
 */
function connect(url) {
    const ws = new WebSocket(url);
    let id = 0;
    /** @type {Map<number, { resolve: (result: any) => void, reject: (error: Error) => void }>} */
    const calls = new Map();
    /** @type {((msg: CdpMessage) => void)[]} */
    const listeners = [];
    ws.addEventListener("message", (event) => {
        /** @type {CdpMessage} */
        const msg = JSON.parse(event.data);
        const call = msg.id ? calls.get(msg.id) : undefined;
        if (msg.id && call) {
            const { resolve: ok, reject } = call;
            calls.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message)); else ok(msg.result);
        } else if (msg.method) {
            listeners.forEach((fn) => fn(msg));
        }
    });
    /** @type {CdpConnection["send"]} */
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

/**
 * @param {string} bin
 * @param {string} profileDir
 * @returns {Promise<{ child: import("node:child_process").ChildProcess, wsUrl: string }>}
 */
function launchChrome(bin, profileDir) {
    const child = spawn(bin, [
        "--headless", "--no-sandbox", "--disable-gpu", "--no-first-run",
        "--remote-debugging-port=0", `--user-data-dir=${profileDir}`,
        "--window-size=1280,900", "about:blank"
    ], { stdio: ["ignore", "ignore", "pipe"] });
    return new Promise((ok, reject) => {
        let buffer = "";
        let timedOut = false;
        // A hung Chrome is killed; the promise rejects once it has exited.
        const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, 15000);
        child.stderr.on("data", (chunk) => {
            buffer += chunk;
            const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
            if (match) { clearTimeout(timer); ok({ child, wsUrl: match[1] }); }
        });
        child.on("exit", (code) => {
            clearTimeout(timer);
            reject(new Error(timedOut ? `Chrome did not start within 15 s:\n${buffer}` : `Chrome exited (${code}):\n${buffer}`));
        });
    });
}

// A fresh CI runner occasionally hangs on the first Chrome start (no
// "DevTools listening" line); a second start works.
/**
 * @param {string} bin
 * @param {string} profileDir
 */
async function startChrome(bin, profileDir) {
    for (let attempt = 1; ; attempt++) {
        try {
            return await launchChrome(bin, profileDir);
        } catch (error) {
            if (attempt === 3) throw error;
            console.warn(`Chrome start ${attempt} failed, retrying: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
        }
    }
}

// Ends Chrome and waits until it has exited, so it no longer writes to its
// profile directory (removing that right after kill() can fail with ENOTEMPTY).
/** @param {import("node:child_process").ChildProcess} child */
function stopChrome(child) {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise((done) => {
        const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
        child.once("exit", () => { clearTimeout(timer); done(undefined); });
        child.kill();
    });
}

// Only these CDP methods may be triggered from the test page.
const ALLOWED_FROM_PAGE = new Set([
    "Input.dispatchKeyEvent", "Input.dispatchMouseEvent", "Input.dispatchTouchEvent",
    "Emulation.setDeviceMetricsOverride", "Emulation.clearDeviceMetricsOverride",
    "Emulation.setTouchEmulationEnabled"
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
        chrome = await startChrome(bin, profileDir);
        const browser = await connect(chrome.wsUrl);
        const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
        const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
        /** @type {(method: string, params?: object) => Promise<any>} */
        const page = (method, params) => browser.send(method, params, sessionId);

        /** @type {string[]} */
        const pageErrors = [];
        browser.on(async (msg) => {
            if (msg.sessionId !== sessionId) return;
            if (msg.method === "Runtime.exceptionThrown") {
                pageErrors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
            } else if (msg.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(msg.params.type)) {
                pageErrors.push(`console.${msg.params.type}: ` + msg.params.args.map((/** @type {any} */ a) => a.value ?? a.description).join(" "));
            } else if (msg.method === "Runtime.bindingCalled" && msg.params.name === "__cdpSend") {
                const { id, method, params } = JSON.parse(msg.params.payload);
                let error = null;
                try {
                    if (!ALLOWED_FROM_PAGE.has(method)) throw new Error(`CDP method not allowed: ${method}`);
                    await page(method, params);
                } catch (e) {
                    error = e instanceof Error ? e.message : String(e);
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
        const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
        const url = `http://127.0.0.1:${port}/tests/browser/index.html${query}`;
        if (coverage) {
            await page("Profiler.enable");
            await page("Profiler.startPreciseCoverage", { detailed: true });
        }
        await page("Page.navigate", { url });

        /** @type {import("./browser/harness.js").TestResult[]|null} */
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
        if (coverage) {
            const { result } = await page("Profiler.takePreciseCoverage");
            coverage.add(result, (scriptUrl) => (scriptUrl.startsWith(url.split("/tests/")[0]) ? new URL(scriptUrl).pathname.slice(1) : null));
        }
        browser.close();
        return failed === 0 && pageErrors.length === 0;
    } finally {
        if (chrome) await stopChrome(chrome.child);
        server.close();
        rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
}

// ---- Main -------------------------------------------------------------------

let ok = true;
if (only !== "browser") {
    console.log("── Unit tests ──");
    ok = (await runUnit()) && ok;
}
if (dist) {
    console.log("\n── Type test (dist) ──");
    ok = (await runTypes()) && ok;
}
if (only !== "unit") {
    console.log("\n── Browser tests ──");
    try {
        ok = (await runBrowser()) && ok;
    } catch (error) {
        console.error("✖ " + ((error instanceof Error && error.stack) || error));
        ok = false;
    }
}
if (coverage) {
    console.log("\n── Coverage (lines, unit + browser) ──");
    const total = coverage.report();
    if (coverageMin !== null && total < coverageMin) {
        console.error(`✖ Coverage ${total.toFixed(1)}% is below the minimum of ${coverageMin}%.`);
        ok = false;
    }
}
process.exit(ok ? 0 : 1);
