# CLAUDE.md

`<jw-datatable>`: reusable data table as a Web Component (Vanilla JS, ES modules,
Shadow DOM). Projects use the release bundle `dist/jw-datatable.min.js` (one file).
README.md is the only developer documentation (layout: "Files & layout",
internals: "Architecture").

## Rules

- No build for the sources and no runtime dependencies; relative imports with
  `.js`. npm only for dev tools (`package.json`: exact-pinned devDependencies
  ESLint, TypeScript, axe-core), locally and in CI. `tools/build.js` (esbuild)
  and semantic-release run via `npx` with pinned versions, in CI only.
- Never edit or commit `dist/`; CI builds it on release.
- Conventional Commits (`fix`, `perf`, `feat`, `feat!`, `docs`, `test`,
  `refactor`, `chore`, `ci`); semantic-release derives the version. One topic per commit.
- Public exports only in `datatable.js`; update the test "public API is exported".
- Update README.md in the same change for any change to API, config, column
  options, events, features, CSS variables/parts, i18n or accessibility
  (keep the "Keyboard" table current). No other doc files.
- English in code, comments and README. UI texts only via `src/core/i18n.js`
  (maintain `en` and `de`).
- WCAG 2.2 AA: keyboard operable, visible focus, correct roles/names/states,
  focus into overlays and back to the opener, contrast 4.5:1 text / 3:1 UI,
  touch targets ≥ 44px, keyboard equivalent for right-click/long-press.

## Code

- `src/core/`, `src/export/`: DOM-free, unit-tested in Node; keep them that way.
  `src/panels/`, `src/render/`: get data + callbacks, never the component.
- State changes go through `_commit()`; interactive elements get a stable `data-fk`;
  panels open via `_showOverlay()`; status messages via `_announce()`; row/cell
  events are delegated (records in `_items`). Details: README "Architecture".
- DOM via `el()` from `src/ui/dom.js`. CSS prefix `jw-dt-` (context menu `jw-ctx-`),
  theme variables `--jw-dt-*` read with a fallback (listed in README "Theming"),
  internal variables `--dt-*`, events `jw-datatable:<name>` (bubbles, composed),
  private members `_name`. JSDoc types on every function (public ones in
  `src/types.js`); `npm run typecheck` (tsc `strict`, also over tests and
  tools) must pass, prefer narrowing over casts.

## Icons (Lucide)

Only real Lucide icons in `ICONS` (`src/ui/icons.js`), keyed by the canonical name
(check `lucide-static@latest/tags.json`; no aliases, no own drawings, no `.svg`
files, no inline SVG). Get one with
`curl -sSL https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/<name>.svg`
and store the inner markup of `<svg>` on one line. Use `iconEl("name")`, or
`icon: "name"` in context-menu items; icon-only buttons need an `aria-label`
from i18n. Ask the user which icon to use; remove unused ones.

## Test

```bash
npm ci                            # dev tools: ESLint, TypeScript, axe-core
npm run check                     # lint + typecheck + tests + coverage ≥ 99%; must pass after every change
node tests/run.js                 # all tests
node tests/run.js --unit|--browser
node tests/run.js --filter "context menu"
node tools/build.js 0.0.0-dev && node tests/run.js --browser --dist; rm -rf dist
python3 -m http.server 8000       # /demo.html, /tests/browser/
```

- New logic in `src/core`/`src/export` → `tests/unit/<module>.test.js`. New UI
  behavior → the topic file in `tests/browser/` (shared fixtures in `helpers.js`;
  a new file is imported in `index.html`) incl. keyboard and ARIA; real keys,
  touch and viewport only via `input.press()` / `input.longPress()` /
  `input.viewport()` with `{ cdp: true }`. A new layout, panel or popup state
  → a check in `axe.test.js` (`assertNoAxeViolations()`).
- Console errors/warnings of the page fail the run.
- Chromium: `CHROME_BIN`, `PATH`, else the Playwright cache (the only one here).
- Screenshot: `"$CHROME" --no-sandbox --window-size=1280,900 --virtual-time-budget=3000
  --screenshot=<file>.png http://localhost:8000/demo.html` (mobile: `390,844`).
