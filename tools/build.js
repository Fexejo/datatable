#!/usr/bin/env node
// Builds the distribution: dist/jw-datatable.min.js and its type declarations
// dist/jw-datatable.min.d.ts
//
//   node tools/build.js [version]
//
// Runs in CI as part of the release (see .releaserc.json); you normally don't
// need it locally. The sources stay buildless — this only produces the
// bundle for consuming projects. Uses esbuild via npx (pinned version);
// set ESBUILD_BIN to use a local esbuild binary instead. The declarations
// need the dev tools (npm ci): TypeScript and API Extractor.
//
// Steps:
// 1. Copy the entry point and src/ to a temp dir.
// 2. Shrink what esbuild can't: minify the CSS string of src/ui/styles.js (it
//    joins the parts in src/ui/styles/) and compact the Lucide SVG markup in
//    src/ui/icons.js.
// 3. Bundle + minify from datatable.js into one ES module with a banner
//    (version and the Lucide license notice from src/ui/icons.js).
// 4. Declarations: tsc emits one .d.ts per module from the JSDoc types; the
//    internal `_name` class members are dropped; API Extractor bundles what
//    datatable.js exports into one file without imports; a banner and the
//    global tag-name and event maps are added.

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { Extractor, ExtractorConfig, ExtractorLogLevel } from "@microsoft/api-extractor";

const ESBUILD_VERSION = "0.28.2";
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT_DIR = join(ROOT, "dist");
const OUT_FILE = join(OUT_DIR, "jw-datatable.min.js");
const OUT_DTS = join(OUT_DIR, "jw-datatable.min.d.ts");
const version = process.argv[2] || "0.0.0-dev";

/**
 * @param {string[]} args
 * @param {string} [input] stdin
 * @returns {string} stdout
 */
function esbuild(args, input) {
    // `--package` explicitly: an outer `npx -p …` (the release runs this script
    // inside `npx -p semantic-release@…`) sets npm_config_package, which a bare
    // `npx esbuild@x` would inherit and then look for "esbuild@x" as a command.
    const [cmd, pre] = process.env.ESBUILD_BIN
        ? [process.env.ESBUILD_BIN, []]
        : ["npx", ["--yes", `--package=esbuild@${ESBUILD_VERSION}`, "--", "esbuild"]];
    const result = spawnSync(cmd, [...pre, ...args], { input, encoding: "utf8", stdio: [input == null ? "ignore" : "pipe", "pipe", "pipe"] });
    if (result.status !== 0) {
        throw new Error(`esbuild failed (${result.status}):\n${result.stderr || result.error}`);
    }
    return result.stdout;
}

/**
 * Prepares a tsc-emitted declaration file for the rollup: removes the class
 * members named `_…` (internal by convention) with their doc comments, and
 * the leftover `@typedef` comments; turns same-name typedef aliases
 * (`export type X = import("…").X`) into re-exports, so the rollup names the
 * type X instead of adding an alias X_2.
 * @param {string} source
 * @returns {string}
 */
function prepareDeclarations(source) {
    source = source
        .replace(/^\/\*\* @typedef .*\*\/\n/gm, "")
        .replace(/^export type (\w+) = import\(("[^"]+")\)\.\1;$/gm, "import type { $1 } from $2;\nexport type { $1 };");
    /** @type {string[]} */
    const out = [];
    /** @type {string[]} */
    let pending = [];   // doc comment and lines of the current member
    let inClass = false;
    let inComment = false;
    let depth = 0;
    let internal = false;
    for (const line of source.split("\n")) {
        if (!inClass) {
            out.push(line);
            inClass = /^(export )?declare class .*\{$/.test(line);
            continue;
        }
        if (line === "}") {
            out.push(...pending, line);
            pending = [];
            inClass = false;
            continue;
        }
        pending.push(line);
        if (inComment || (depth === 0 && line.trimStart().startsWith("/**"))) {
            inComment = !line.includes("*/");
            continue;
        }
        if (depth === 0) internal = /^ {4}(?:(?:static|readonly|get|set) )*_/.test(line);
        depth += (line.match(/[{([]/g)?.length ?? 0) - (line.match(/[})\]]/g)?.length ?? 0);
        if (depth === 0) {
            if (!internal) out.push(...pending);
            pending = [];
        }
    }
    return out.join("\n");
}

/** @param {string} dir declarations emitted by tsc */
function bundleDeclarations(dir) {
    const config = ExtractorConfig.prepare({
        configObject: {
            projectFolder: dir,
            mainEntryPointFilePath: join(dir, "datatable.d.ts"),
            compiler: {
                overrideTsconfig: {
                    compilerOptions: { strict: true, target: "es2022", module: "es2022", moduleResolution: "bundler", lib: ["es2023", "dom", "dom.iterable"], types: [] },
                    include: ["**/*.d.ts"]
                }
            },
            dtsRollup: { enabled: true, untrimmedFilePath: OUT_DTS },
            apiReport: { enabled: false },
            docModel: { enabled: false },
            tsdocMetadata: { enabled: false },
            messages: {
                compilerMessageReporting: { default: { logLevel: ExtractorLogLevel.Error } },
                // Not exported under their own name (e.g. the `Column` alias of
                // a module) is fine: the rollup keeps them as local types.
                extractorMessageReporting: {
                    default: { logLevel: ExtractorLogLevel.Error },
                    "ae-missing-release-tag": { logLevel: ExtractorLogLevel.None },
                    "ae-forgotten-export": { logLevel: ExtractorLogLevel.None },
                    "ae-setter-with-docs": { logLevel: ExtractorLogLevel.None }
                },
                tsdocMessageReporting: { default: { logLevel: ExtractorLogLevel.None } }
            }
        },
        configObjectFullPath: undefined,
        packageJsonFullPath: join(ROOT, "package.json")
    });
    const result = Extractor.invoke(config, { localBuild: true, showVerboseMessages: false });
    if (!result.succeeded) throw new Error(`API Extractor failed: ${result.errorCount} errors`);
}

const tmp = mkdtempSync(join(tmpdir(), "jw-datatable-build-"));
try {
    // 1. Copy sources (tests/tools are not part of the bundle).
    cpSync(join(ROOT, "datatable.js"), join(tmp, "datatable.js"));
    cpSync(join(ROOT, "src"), join(tmp, "src"), { recursive: true });

    // 2a. Minify the shadow-DOM CSS.
    const stylesFile = join("src", "ui", "styles.js");
    const { datatableStyles } = await import(pathToFileURL(join(ROOT, stylesFile)).href);
    const css = esbuild(["--loader=css", "--minify"], datatableStyles).trim();
    writeFileSync(join(tmp, stylesFile), `export const datatableStyles = ${JSON.stringify(css)};\n`);

    // 2b. Compact icon markup ('<path d="…" />' → '<path d="…"/>').
    const iconsFile = join(tmp, "src", "ui", "icons.js");
    const iconsSource = readFileSync(iconsFile, "utf8");
    writeFileSync(iconsFile, iconsSource.replace(/" \/>/g, '"/>'));

    // 3. Bundle + minify. The Lucide license notice is the comment block after
    //    the "License notice" paragraph in icons.js; both licenses require it in
    //    every copy, and esbuild drops comments.
    const notice = /^\/\/ License notice[^]*?\n\/\/\n((?:\/\/.*\n)+)/m.exec(iconsSource)?.[1];
    if (!notice) throw new Error("Lucide license notice not found in src/ui/icons.js");
    const license = notice.replace(/^\/\/ ?/gm, "  ").replace(/^ +$/gm, "").trimEnd();
    const banner = `/*! jw-datatable v${version} | Icons: Lucide (https://lucide.dev)\n\n${license}\n*/`;
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
    const kb = (/** @type {number} */ n) => (n / 1024).toFixed(1) + " KB";
    console.log(`dist/jw-datatable.min.js  v${version}  ${kb(output.length)}  (gzip ${kb(gzipSync(output).length)})`);

    // 4. Declarations, from the original sources (same types as the copy).
    const typesDir = join(tmp, "types");
    const tsc = spawnSync(process.execPath, [
        join(ROOT, "node_modules", "typescript", "bin", "tsc"),
        "-p", join(ROOT, "tsconfig.json"),
        "--noEmit", "false",
        "--declaration",
        "--emitDeclarationOnly",
        "--outDir", typesDir
    ], { encoding: "utf8" });
    if (tsc.status !== 0) throw new Error(`tsc failed (${tsc.status}):\n${tsc.stdout}${tsc.stderr || tsc.error || ""}`);
    for (const file of readdirSync(typesDir, { recursive: true, encoding: "utf8" })) {
        if (!file.endsWith(".d.ts")) continue;
        const path = join(typesDir, file);
        writeFileSync(path, prepareDeclarations(readFileSync(path, "utf8")));
    }
    bundleDeclarations(typesDir);
    const declarations = readFileSync(OUT_DTS, "utf8").trim();
    writeFileSync(OUT_DTS, `/*! jw-datatable v${version} | Type declarations of jw-datatable.min.js */

${declarations}

declare global {
    interface HTMLElementTagNameMap {
        "jw-datatable": JwDataTable;
    }
    // The events bubble and are composed: typed on every element.
    interface HTMLElementEventMap extends DataTableEventMap {}
}
`);
    console.log(`dist/jw-datatable.min.d.ts  v${version}  ${kb(readFileSync(OUT_DTS).length)}`);
} finally {
    rmSync(tmp, { recursive: true, force: true });
}
