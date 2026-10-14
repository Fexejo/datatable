import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { ICONS } from "../../src/ui/icons.js";

// All bundled sources except the icon table itself.
const src = new URL("../../src/", import.meta.url);
const source = readdirSync(src, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".js") && !f.endsWith("icons.js"))
    .map((f) => readFileSync(new URL(f, src), "utf8"))
    .join("\n");

test("icon keys are kebab-case Lucide names", () => {
    for (const name of Object.keys(ICONS)) {
        assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/, name);
    }
});

test("icon bodies are single-line inner SVG markup", () => {
    for (const [name, body] of Object.entries(ICONS)) {
        assert.ok(!body.includes("\n"), `${name}: one line`);
        assert.ok(!/<svg|<!--/.test(body), `${name}: no <svg> wrapper or comment`);
    }
});

test("every icon used in the source exists, and every icon is used", () => {
    const used = new Set();
    // iconEl("x"), createIcon("x"), navBtn("x", …), icon: "x", and ternaries of icon names.
    for (const m of source.matchAll(/(?:iconEl|createIcon|navBtn)\(\s*"([a-z0-9-]+)"|icon:\s*"([a-z0-9-]+)"/g)) {
        used.add(m[1] || m[2]);
    }
    for (const m of source.matchAll(/\?\s*"([a-z0-9-]+)"\s*:\s*"([a-z0-9-]+)"/g)) {
        if (m[1] in ICONS) used.add(m[1]);
        if (m[2] in ICONS) used.add(m[2]);
    }
    for (const name of used) assert.ok(name in ICONS, `missing icon "${name}"`);
    for (const name of Object.keys(ICONS)) assert.ok(used.has(name), `unused icon "${name}"`);
});
