#!/usr/bin/env node
// Builds the single-file distribution: dist/jw-datatable.min.js
//
//   node tools/build.js [version]
//
// Runs in CI as part of the release (see .releaserc.json); you normally don't
// need it locally. The sources stay buildless — this only produces the
// bundle for consuming projects. Uses esbuild via npx (pinned version);
// set ESBUILD_BIN to use a local esbuild binary instead.
//
// Steps:
// 1. Copy all source modules to a temp dir.
// 2. Shrink what esbuild can't: minify the CSS string in styles.js and
//    compact the Lucide SVG markup in icons.js.
// 3. Bundle + minify from datatable.js into one ES module with a banner.

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const ESBUILD_VERSION = "0.28.2";
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT_DIR = join(ROOT, "dist");
const OUT_FILE = join(OUT_DIR, "jw-datatable.min.js");
const version = process.argv[2] || "0.0.0-dev";

function esbuild(args, input) {
    const [cmd, pre] = process.env.ESBUILD_BIN
        ? [process.env.ESBUILD_BIN, []]
        : ["npx", ["--yes", `esbuild@${ESBUILD_VERSION}`]];
    const result = spawnSync(cmd, [...pre, ...args], { input, encoding: "utf8", stdio: [input == null ? "ignore" : "pipe", "pipe", "pipe"] });
    if (result.status !== 0) {
        throw new Error(`esbuild failed (${result.status}):\n${result.stderr || result.error}`);
    }
    return result.stdout;
}

const tmp = mkdtempSync(join(tmpdir(), "jw-datatable-build-"));
try {
    // 1. Copy sources (top-level *.js only — tests/tools are not part of the bundle).
    for (const file of readdirSync(ROOT).filter((f) => f.endsWith(".js"))) {
        cpSync(join(ROOT, file), join(tmp, file));
    }

    // 2a. Minify the shadow-DOM CSS.
    const { datatableStyles } = await import(pathToFileURL(join(ROOT, "styles.js")).href);
    const css = esbuild(["--loader=css", "--minify"], datatableStyles).trim();
    writeFileSync(join(tmp, "styles.js"), `export const datatableStyles = ${JSON.stringify(css)};\n`);

    // 2b. Compact icon markup ('<path d="…" />' → '<path d="…"/>').
    const icons = readFileSync(join(tmp, "icons.js"), "utf8").replace(/" \/>/g, '"/>');
    writeFileSync(join(tmp, "icons.js"), icons);

    // 3. Bundle + minify.
    const banner = `/*! jw-datatable v${version} | Icons: Lucide (ISC License, https://lucide.dev) */`;
    mkdirSync(OUT_DIR, { recursive: true });
    esbuild([
        join(tmp, "datatable.js"),
        "--bundle",
        "--format=esm",
        "--minify",
        "--target=es2022",
        "--legal-comments=none",
        `--banner:js=${banner}`,
        `--outfile=${OUT_FILE}`,
        "--log-level=warning"
    ]);

    const output = readFileSync(OUT_FILE);
    const kb = (n) => (n / 1024).toFixed(1) + " KB";
    console.log(`dist/jw-datatable.min.js  v${version}  ${kb(output.length)}  (gzip ${kb(gzipSync(output).length)})`);
} finally {
    rmSync(tmp, { recursive: true, force: true });
}
