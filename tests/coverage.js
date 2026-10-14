// Line coverage of datatable.js and src/ from V8 coverage data — Node only,
// no npm packages. The unit tests deliver it through NODE_V8_COVERAGE, the
// browser tests through the DevTools protocol (Profiler.takePreciseCoverage);
// both use the same format. A line counts as covered when either run
// executed code on it.

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

// Covered and coverable line numbers per file (repo-relative path).
export class Coverage {
    /** @param {string} root Repository root. */
    constructor(root) {
        this.root = root;
        /** @type {Map<string, { coverable: Set<number>, covered: Set<number> }>} */
        this.files = new Map();
    }

    // Adds V8 script coverage ({ url, functions: [{ ranges }] }[]). `toPath`
    // maps a script URL to a repo-relative path, or null to skip the script.
    /**
     * @param {{ url: string, functions: { ranges: { startOffset: number, endOffset: number, count: number }[] }[] }[]} scripts
     * @param {(url: string) => string|null} toPath
     */
    add(scripts, toPath) {
        for (const script of scripts) {
            const path = toPath(script.url);
            if (!path || !isSource(path)) continue;
            const source = readFileSync(join(this.root, path), "utf8");
            const counts = offsetCounts(source.length, script.functions);
            const file = this._file(path);
            let offset = 0;
            source.split("\n").forEach((line, i) => {
                if (isCoverable(line)) {
                    file.coverable.add(i + 1);
                    for (let c = 0; c < line.length; c++) {
                        if (line[c] !== " " && counts[offset + c] > 0) { file.covered.add(i + 1); break; }
                    }
                }
                offset += line.length + 1;
            });
        }
    }

    // Reads the files NODE_V8_COVERAGE wrote into `dir`.
    /** @param {string} dir */
    addNodeDir(dir) {
        for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
            const { result } = JSON.parse(readFileSync(join(dir, name), "utf8"));
            this.add(result, (url) => (url.startsWith("file://") ? relative(this.root, new URL(url).pathname) : null));
        }
    }

    /** @param {string} path */
    _file(path) {
        let file = this.files.get(path);
        if (!file) {
            file = { coverable: new Set(), covered: new Set() };
            this.files.set(path, file);
        }
        return file;
    }

    // Prints one row per file (lowest first) and returns the total percentage.
    report() {
        const rows = [...this.files].map(([path, { coverable, covered }]) => {
            const missing = [...coverable].filter((n) => !covered.has(n)).sort((a, b) => a - b);
            return { path, percent: percent(coverable.size - missing.length, coverable.size), missing };
        }).sort((a, b) => a.percent - b.percent || a.path.localeCompare(b.path));
        const width = Math.max(...rows.map((r) => r.path.length), 5);
        console.log(`${"file".padEnd(width)}  lines   uncovered`);
        for (const r of rows) {
            console.log(`${r.path.padEnd(width)}  ${r.percent.toFixed(1).padStart(5)}%  ${ranges(r.missing)}`);
        }
        let coverable = 0;
        let covered = 0;
        for (const file of this.files.values()) {
            coverable += file.coverable.size;
            covered += file.covered.size;
        }
        const total = percent(covered, coverable);
        console.log(`${"total".padEnd(width)}  ${total.toFixed(1).padStart(5)}%`);
        return total;
    }
}

/** @param {string} path */
function isSource(path) {
    return path === "datatable.js" || (path.startsWith("src/") && path.endsWith(".js"));
}

// Lines with code: not blank, not only a comment, not only closing brackets.
/** @param {string} line */
function isCoverable(line) {
    const text = line.trim();
    return text !== "" && !/^(\/\/|\/\*|\*)/.test(text) && !/^[}\])]+[;,)]*$/.test(text);
}

// Execution count per character: nested ranges (smaller) override outer ones.
/**
 * @param {number} length
 * @param {{ ranges: { startOffset: number, endOffset: number, count: number }[] }[]} functions
 */
function offsetCounts(length, functions) {
    const counts = new Int32Array(length);
    const all = functions.flatMap((f) => f.ranges)
        .sort((a, b) => (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset));
    for (const r of all) counts.fill(r.count, r.startOffset, Math.min(r.endOffset, length));
    return counts;
}

/**
 * @param {number} part
 * @param {number} whole
 */
function percent(part, whole) {
    return whole === 0 ? 100 : (100 * part) / whole;
}

// "3-5,9,12-14", shortened for the terminal.
/** @param {number[]} lines */
function ranges(lines) {
    const parts = [];
    for (let i = 0; i < lines.length; i++) {
        let j = i;
        while (j + 1 < lines.length && lines[j + 1] === lines[j] + 1) j++;
        parts.push(i === j ? `${lines[i]}` : `${lines[i]}-${lines[j]}`);
        i = j;
    }
    const text = parts.join(",");
    return text.length > 60 ? text.slice(0, 59) + "…" : text;
}
