# jw-datatable – Developer documentation

Configurable, reusable data table as a Web Component (`<jw-datatable>`),
written in Vanilla JS (ES modules, Shadow DOM). No external dependencies.

**Features**

- **Pagination** – first/previous/next/last, page numbers, configurable page size
- **Sorting** – ascending/descending, multi-column (Shift+click), context menu
- **Filters** – value filter (pick values) and pattern filter (type-specific operators)
- **Quick filters** – right-click a cell → “Filter by value” / “Exclude value”
- **Global search** – full-text across searchable columns
- **Context menu** – sort, filter, copy (cell/row/column), hide column, export
- **CSV export** – in the browser, Excel-friendly (with BOM)
- **Grid / card view** – compact cards as an alternative to the table
- **Mobile First / responsive** – compact, touch-optimized layout; auto-switches to card view on small screens; bottom-sheet panels; long-press context menu
- **Links** – href, SPA routing event, or custom handler (e.g. open a dialog)
- **Copy button** – per column when `copyable` is set (shown on hover on desktop, always visible on touch)
- **Runtime data** – replace data anytime via `setData()` / `.data`
- **Templates** – save sort, filters, view, etc. to `localStorage` (pluggable adapter, e.g. backend later)
- **Theming** – CSS variables (`--k-*`), `part` selectors, custom CSS

---

## Table of contents

1. [Files & layout](#files--layout)
2. [Installation & import](#installation--import)
3. [Quick start](#quick-start)
4. [Configuration (`config`)](#configuration-config)
5. [Columns (`columns`)](#columns-columns)
6. [Data types & formatting](#data-types--formatting)
7. [Links behind values](#links-behind-values)
8. [Enabling / disabling features](#enabling--disabling-features)
9. [Filters](#filters)
10. [Templates & storage adapter](#templates--storage-adapter)
11. [Events](#events)
12. [Instance API](#instance-api)
13. [Theming & styling](#theming--styling)
    - [Icons](#icons)
14. [Responsive & touch](#responsive--touch)
15. [i18n / Localization](#i18n--localization)
16. [Accessibility](#accessibility)
17. [Demo](#demo)
18. [Development & tests](#development--tests)
19. [Releases & build](#releases--build)

---

## Files & layout

| File | Role |
|------|------|
| `datatable.js` | **Public API** – registers `<jw-datatable>` and exports `createDataTable()` |
| `jwDataTable.js` | Web Component (rendering, state, interaction) |
| `formatters.js` | Type-dependent display formatting |
| `comparators.js` | Sort comparison, multi-column sort |
| `filtering.js` | Value/pattern filters, operators, distinct values |
| `csv.js` | CSV build & download |
| `templateStore.js` | Template storage + `LocalStorageAdapter` |
| `contextMenu.js` | Reusable context menu |
| `styles.js` | Shadow DOM styles as a string |
| `util.js` | Shared helpers |
| `icons.js` | [Lucide](https://lucide.dev) icons, bundled inline (see [Icons](#icons)) |
| `i18n.js` | UI translations + `getTranslations()` helper |
| `columns.js` | Column inference from data |
| `demo.html` | Runnable demo |
| `tests/` | Unit and browser tests (not needed in consuming projects) |
| `dist/jw-datatable.min.js` | Single-file bundle for consuming projects (built by CI) |
| `tools/build.js` | Builds the bundle (used by CI) |
| `.github/workflows/release.yml`, `.releaserc.json` | CI tests + automated releases |

All modules are plain ES modules with no build step.

---

## Installation & import

**Recommended: one file.** Copy `dist/jw-datatable.min.js` into your project
(or download it from the [latest GitHub release](https://github.com/Fexejo/datatable/releases/latest))
and import it:

```js
import { createDataTable } from "./vendor/jw-datatable.min.js";

// Also exported: JwDataTable, LocalStorageAdapter, TemplateStore, inferColumns, inferType
// Default export: createDataTable
```

The bundle contains everything (styles, icons, translations) and has no
dependencies. Its first line names the version
(`/*! jw-datatable vX.Y.Z … */`). `dist/` always holds the latest release;
it is built by CI and must not be edited by hand.

**Alternatively: the sources.** Copy all top-level `*.js` files into one folder
and import `datatable.js` — same API, unminified, handy for debugging:

```js
import { createDataTable } from "./datatable/datatable.js";
```

Importing registers the `<jw-datatable>` custom element automatically (only
once, so loading it twice is harmless).

**Requirements:** modern browser with Custom Elements v1, Shadow DOM and
ES2022. ES modules need an HTTP(S) origin (not `file://`).

---

## Quick start

```js
import { createDataTable } from "./datatable/datatable.js";

const table = createDataTable("#container", {
    title: "Members",
    data: [
        { id: 1, name: "Anna",  fee: 49.9, active: true,  joined: "2021-03-02" },
        { id: 2, name: "Ben",   fee: 12.5, active: false, joined: "2020-11-15" }
    ],
    columns: [
        { key: "id",     label: "ID",     type: "integer", width: "64px" },
        { key: "name",   label: "Name",   type: "string",  copyable: true },
        { key: "fee",    label: "Fee",    type: "currency", format: { currency: "EUR" } },
        { key: "active", label: "Active", type: "boolean" },
        { key: "joined", label: "Joined", type: "date" }
    ],
    pagination: { pageSize: 25, pageSizeOptions: [10, 25, 50] },
    initial: { sort: [{ key: "name", direction: "asc" }] }
});

// Replace data at runtime
table.setData(newRows);
```

Without the factory:

```js
const table = document.createElement("jw-datatable");
document.querySelector("#container").appendChild(table);
table.configure({ /* … */ });
```

---

## Configuration (`config`)

`configure(config)` and `createDataTable(container, config)` accept:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `columns` | `Column[]` | `[]` | Column definitions (required) |
| `data` | `object[]` | `[]` | Row objects |
| `id` | `string` | `"default"` | Id for template storage namespace |
| `title` | `string` | — | Toolbar title |
| `locale` | `string` | `"en-US"` | BCP-47 locale — drives number/date formatting, sort, **and UI language** (see [i18n](#i18n--localization)) |
| `features` | `object` | all on | Toggle features (see below) |
| `pagination` | `object` | — | `{ pageSize, pageSizeOptions }` |
| `initial` | `object` | — | `{ sort, filters, globalSearch, page, pageSize, viewMode, hiddenColumns }` |
| `defaultView` | `"table" \| "grid"` | `"table"` | Initial view (pins the view — disables auto-switching) |
| `grid` | `object` | — | `{ minWidth, titleColumn }` |
| `responsive` | `object` | *(on)* | `{ enabled, breakpoint, autoGridView }` — see [Responsive & touch](#responsive--touch) |
| `maxHeight` | `string` | — | e.g. `"60vh"`; scroll body, sticky header |
| `storage` | `object` | — | Templates: `{ adapter, namespace, key }` |
| `searchPlaceholder` | `string` | *(from locale)* | Search input placeholder override |
| `emptyText` | `string` | *(from locale)* | Override text shown when there are no rows |
| `noResultsText` | `string` | *(from locale)* | Override text shown when filters match nothing |
| `csvDelimiter` | `string` | `";"` | CSV delimiter |
| `exportFilename` | `string` | `"export"` | Default CSV filename |
| `styles` | `string` | — | Extra CSS injected into shadow root |
| `rowClass` | `(row, index) => string` | — | CSS class(es) per row |
| `onRowClick` | `(row, index) => void` | — | Row/card click |
| `onCellClick` | `(value, row, column) => void` | — | Cell click |

---

## Columns (`columns`)

Each column:

| Property | Type | Description |
|----------|------|-------------|
| `key` | `string` | Field on the row object. Dot paths work (`"address.city"`). **Required** |
| `label` | `string` | Header (default: `key`) |
| `type` | `string` | Data type (see [Data types](#data-types--formatting)) |
| `accessor` | `(row) => any` | Custom value instead of `key` |
| `format` | `object` | Format options (type-dependent) |
| `formatter` | `(value, ctx) => string \| Node` | Custom display; `ctx = { row, column, locale }` |
| `exportFormatter` | `(value, ctx) => string` | Custom CSV value |
| `options` | `{ value, label }[]` | Labels for `enum` / `select` |
| `align` | `"left" \| "right" \| "center"` | Alignment (type-dependent default) |
| `width` | `string` | Fixed width, e.g. `"80px"` |
| `hidden` | `boolean` | Initially hidden |
| `sortable` | `boolean` | Allow sort (default `true`) |
| `filterable` | `boolean` | Allow filter (default `true`) |
| `searchable` | `boolean` | Include in global search (default `true`) |
| `exportable` | `boolean` | Include in CSV (default `true`) |
| `copyable` | `boolean` | Show copy button on hover |
| `link` | `object \| function` | Link behind the value (see below) |
| `action` | `(row, value, event) => void` | Render value as a button |
| `cellClass` | `(value, row) => string` | CSS class(es) per cell |

Column flags apply only when the matching global feature is enabled.

---

## Data types & formatting

`type` drives default formatting, sort comparison, and filter operators.

| Type | Display | `format` options |
|------|---------|------------------|
| `string` / `text` | plain text | — |
| `integer` | grouped integer | `grouping: false` |
| `number` / `float` | decimal | `decimals`, `minimumFractionDigits`, `maximumFractionDigits`, `grouping` |
| `currency` | currency | `currency` (e.g. `"EUR"`), `decimals` |
| `percent` | percent | `decimals`; `asNumber: true` if value is 0–100 not 0–1 |
| `boolean` | Yes/No | `trueLabel`, `falseLabel` |
| `date` | date | `options` (Intl.DateTimeFormat) |
| `datetime` | date + time | `options` |
| `time` | time | `options` |
| `enum` / `select` | mapped label | `labels: { value: label }` or column `options` |

**Examples**

```js
{ key: "price",  type: "currency", format: { currency: "CHF", decimals: 2 } }
{ key: "rate",   type: "percent",  format: { decimals: 1 } }            // 0.25 -> "25.0%"
{ key: "amount", type: "percent",  format: { asNumber: true } }         // 25   -> "25%"
{ key: "date",   type: "date",     format: { options: { dateStyle: "long" } } }
{ key: "status", type: "enum",     format: { labels: { a: "Active", i: "Inactive" } } }
```

**Custom formatter** (may return a DOM node):

```js
{
    key: "status",
    label: "Status",
    formatter: (value) => {
        const dot = document.createElement("span");
        dot.textContent = value === "ok" ? "🟢" : "🔴";
        return dot;
    }
}
```

`null`, `undefined`, and `""` are treated as empty (`column.emptyText`, default `""`)
and sort to the end.

---

## Links behind values

Three patterns:

**1. Normal link (`<a href>`)**

```js
{ key: "name", link: (row) => `/members/${row.id}` }
// Shorthand: function = href builder
```

**2. SPA routing** – prevents navigation and fires an event:

```js
{ key: "name", link: { spa: true, url: (row) => `/members/${row.id}` } }

table.addEventListener("jw-datatable:navigate", (e) => {
    router.go(e.detail.href); // { href, row, column, value }
});
```

**3. Custom handler** – any action (e.g. dialog):

```js
{
    key: "name",
    link: {
        url: (row) => `/members/${row.id}`,   // optional, middle-click / copy link
        handler: async (row, value, event) => {
            await confirm(`Open profile for ${value}?`);
        }
    }
}
```

**Value as button** (no link semantics):

```js
{ key: "action", action: (row, value, e) => openDetailDialog(row) }
```

---

## Enabling / disabling features

Most features are **opt-in** (off by default) and are enabled explicitly via
`features`. Only the basics — pagination, context menu, and copy buttons — are on
by default.

| Feature | Default | Description |
|---------|---------|-------------|
| `pagination` | **on** | First/prev/next/last, page numbers, page size |
| `contextMenu` | **on** | Right-click / long-press menu |
| `copyButtons` | **on** | Per-column copy button (needs column `copyable`) |
| `sorting` | off | Sortable column headers + sort context menu |
| `multiSort` | on\* | Multi-column sort via Shift+click (\*only active when `sorting` is on) |
| `filtering` | off | Value / pattern filters per column |
| `globalSearch` | off | Full-text search box in the toolbar |
| `grid` | off | Table ↔ card/grid view toggle (also drives responsive auto-view) |
| `columnVisibility` | off | Show/hide columns chooser |
| `templates` | off | Save/load views (needs storage) |
| `csvExport` | off | CSV export button |

Enable what you need:

```js
features: {
    sorting: true,
    filtering: true,
    globalSearch: true,
    grid: true,
    columnVisibility: true,
    templates: true,
    csvExport: true
}
```

To turn an always-on feature off, set it to `false` (e.g. `pagination: false`).
Column-level flags (`sortable`, `filterable`, …) apply only when the matching
global feature is enabled.

---

## Filters

Per column (filter icon in header or context menu):

- **Values** – checkbox list with counts, search field, “Select all”
- **Pattern** – operator + operand(s), by type family:

| Family | Operators |
|--------|-----------|
| Text | contains, does not contain, equals, does not equal, starts with, ends with, RegEx, is (not) empty |
| Number | `=`, `≠`, `>`, `≥`, `<`, `≤`, between, is (not) empty |
| Date | on, before, after, between, is (not) empty |
| Boolean | is true, is false |

**Quick filter:** right-click a cell → “Filter by value” or “Exclude value”.

Filters combine with global search and each other with **AND**. API:

```js
table.setState({ filters: {
    role: { kind: "value",   values: ["admin", "member"] },
    fee:  { kind: "pattern", operator: "gte", operand: 50, arity: 1 }
}});
table.clearFilters();
```

---

## Templates & storage adapter

Current state (sort, filters, search, page size, view, hidden columns) can be saved as a **template** via UI (save icon) or API:

```js
await table.saveTemplate("Active only");
const names = await table.listTemplates();
await table.loadTemplate("Active only");
await table.removeTemplate("Active only");
```

Default storage is `localStorage` (namespace from `storage.namespace` + `id`).
Swap in a **backend adapter** without changing the component:

```js
const backendAdapter = {
    list:   ()           => fetch("/api/views").then(r => r.json()),
    get:    (name)       => fetch(`/api/views/${name}`).then(r => r.json()),
    save:   (name, data) => fetch(`/api/views/${name}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (name)       => fetch(`/api/views/${name}`, { method: "DELETE" })
};

createDataTable("#c", { /* … */ storage: { adapter: backendAdapter } });
```

Adapter methods may return Promises.

Templates do not store the current page; loading a template always starts on page 1.

---

## Events

All events are `composed` and `bubbles`.

| Event | `detail` | When |
|-------|----------|------|
| `jw-datatable:navigate` | `{ href, row, column, value }` | SPA link clicked (`link.spa`) |
| `jw-datatable:change` | `{ state }` | State changed (sort, filter, page, …) |
| `jw-datatable:datachange` | `{ data }` | Data replaced via `setData()` |

`onRowClick` / `onCellClick` are config callbacks, not events.

---

## Instance API

| Method | Returns | Description |
|--------|---------|-------------|
| `configure(config)` | `this` | Initialize / reconfigure |
| `setData(rows)` / `table.data = rows` | — | Replace data (state kept) |
| `get data` | `object[]` | Current raw data |
| `refresh()` | — | Re-derive and render (e.g. after in-place mutation) |
| `getState()` | `object` | Serializable state |
| `setState(partial)` | — | Apply partial state |
| `clearFilters()` | — | Clear filters and search |
| `exportCSV(filename?)` | — | Download filtered/sorted view as CSV |
| `saveTemplate(name)` | `Promise` | Save current view |
| `loadTemplate(name)` | `Promise` | Load template |
| `listTemplates()` | `Promise<string[]>` | Template names |
| `removeTemplate(name)` | `Promise` | Delete template |

**State shape** (`getState` / `setState` / `initial`):

```js
{
    sort: [{ key: "name", direction: "asc" }],
    filters: { role: { kind: "value", values: ["admin"] } },
    globalSearch: "",
    pageSize: 25,
    page: 1,
    viewMode: "table",            // or "grid"
    hiddenColumns: ["internalId"]
}
```

---

## Theming & styling

The component uses global design tokens (`--k-*` from `main.css`) with fallbacks and supports dark mode (`[data-theme="dark"]`). Three ways to customize:

**1. CSS variables** on `:root` or a parent:

`--k-color-text`, `--k-color-page`, `--k-color-surface`, `--k-color-surface-muted`,
`--k-color-border`, `--k-color-hover`, `--k-color-schicht-meine-bg` (accent),
`--k-radius-s/m/l`, `--k-space-*`, `--k-font-family-base`.

**2. `part` selectors** from outside:

```css
jw-datatable::part(toolbar) { background: #eef; }
jw-datatable::part(card)    { box-shadow: 0 2px 8px rgba(0,0,0,.1); }
```

Parts: `root`, `toolbar`, `body`, `table`, `grid`, `card`, `footer`.

**3. `config.styles`** (injected into shadow root):

```js
createDataTable("#c", { /* … */ styles: `
    .k-dt-th { text-transform: uppercase; }
    .k-dt-tr:hover .k-dt-td { background: #fffbe6; }
` });
```

### Icons

All icons are [Lucide](https://lucide.dev/icons) icons (ISC license), bundled
in `icons.js` — no icon package or `.svg` files are loaded at runtime. They use
`stroke="currentColor"`, so they follow the text color of their control, and
are sized via CSS (`.k-dt-ic svg`, `.k-ctx-icon svg`).

Icons are decorative (`aria-hidden="true"`); every icon-only button carries its
own `aria-label` from the i18n bundle.

**Adding an icon** (maintainers):

1. Look up the canonical name on <https://lucide.dev/icons> (no aliases).
2. `curl -sSL https://cdn.jsdelivr.net/npm/lucide-static@latest/icons/<name>.svg`
3. Copy only the inner markup of `<svg>` (paths, circles, …) as one line into
   `ICONS` in `icons.js`, keyed by the Lucide name.
4. Use it via `createIcon("<name>")` (returns an `SVGSVGElement`), or the
   `iconEl()` helper in `jwDataTable.js` / `icon:` in context-menu items.

---

## Responsive & touch

The component is built **Mobile First**: the base styling targets small / touch
screens (compact spacing, ≥44px touch targets, always-visible copy buttons,
stacked toolbar & footer, trimmed pagination), and a `@media (min-width: 640px)`
layer adds the roomier desktop experience (more padding, hover-reveal copy
buttons, inline toolbar/footer, full page-number pagination).

**What adapts automatically**

| Behavior | Mobile (`< breakpoint`) | Desktop (`≥ breakpoint`) |
|----------|-------------------------|--------------------------|
| View | auto card/grid view (`autoGridView`) | table |
| Toolbar | stacked, full-width search | inline, `space-between` |
| Copy buttons | always visible | reveal on hover |
| Pagination | first / prev / current / next / last | full page numbers + page-size select |
| Filter / column / template panels | bottom sheet | popover anchored to the button |
| Context menu | bottom sheet, opened via **long-press** | popover at the cursor, opened via **right-click** |

**Configuration** (`config.responsive`, all optional):

```js
createDataTable("#c", {
    // …
    responsive: {
        enabled: true,       // master switch (default true)
        breakpoint: 640,     // px; must match the CSS breakpoint if you override styles
        autoGridView: true   // switch to card/grid below the breakpoint (needs features.grid)
    }
});
```

Notes:

- **Auto view switching** only kicks in when neither `defaultView` nor
  `initial.viewMode` is set, and is suspended once the user toggles the view or
  a template/`setState` sets `viewMode` — explicit choices always win.
- The CSS breakpoint is `640px`. If you change `responsive.breakpoint`, mirror it
  via `config.styles` so the visual layout and the JS view-switching agree.
- **Long-press** (~500ms) on a header, cell, or card opens the context menu on
  touch devices; the follow-up tap is suppressed so it won't also trigger
  row/cell/link handlers.

---

## i18n / Localization

The single `locale` config option controls **both** number/date formatting (via `Intl`) **and** all UI strings (toolbar labels, filter operators, pagination, context menu, etc.).

### Built-in languages

| `locale` value | Language | Number/date format |
|----------------|----------|--------------------|
| `"en-US"` (default) | English | US |
| `"en-GB"` | English | British |
| `"de-DE"` | German | German |
| `"de-AT"` | German | Austrian |
| `"de-CH"` | German | Swiss |

Any `de-*` locale resolves to German UI strings; any other unsupported prefix falls back to English.

```js
// German UI + German number/date formatting
createDataTable("#c", { locale: "de-DE", /* … */ });

// English UI + British date format
createDataTable("#c", { locale: "en-GB", /* … */ });
```

### Per-text overrides

Individual strings can still be overridden via `config`:

```js
createDataTable("#c", {
    locale: "de-DE",
    emptyText: "Noch keine Einträge vorhanden.",
    searchPlaceholder: "Mitglieder suchen…"
});
```

### Adding a new language

Open `i18n.js` and add a new entry to the `LOCALES` object using the BCP-47 language subtag as the key:

```js
// i18n.js
export const LOCALES = {
    en: { /* … */ },
    de: { /* … */ },

    // New: French
    fr: {
        searchPlaceholder: "Rechercher…",
        clearFilters: "Effacer tous les filtres",
        filterCount: (n) => `Filtre (${n})`,
        // … all other keys …
        operators: {
            contains: "contient",
            // …
        }
    }
};
```

`getTranslations("fr-FR")` and `getTranslations("fr-CA")` will then both resolve to the `fr` bundle automatically.

---

## Accessibility

The component targets **WCAG 2.2 level AA**. Everything that works with a mouse
or touch also works with the keyboard alone.

**Keyboard**

| Where | Keys | Action |
|-------|------|--------|
| Table body | `Tab` | Enters/leaves the body as **one** tab stop (roving focus; links and buttons inside cells stay in the tab order) |
| Table cell | `←` `→` `↑` `↓` | Move between cells |
| Table cell | `Home` / `End` | First / last cell of the row (`Ctrl` + key: first / last cell of the page) |
| Table cell | `Enter` | Activate the cell's link or action, otherwise `onCellClick` / `onRowClick` |
| Card view | `←` `→` `↑` `↓`, `Home` / `End`, `Enter` | Move between cards, `Enter` triggers `onRowClick` |
| Cell, card, header button | `Shift+F10` or context-menu key | Open the actions menu (same as right-click / long-press) |
| Actions menu | `↑` `↓`, `Home` / `End`, `Enter` / `Space`, `Esc` / `Tab` | Navigate, activate, close (focus returns to where the menu was opened) |
| Sort header | `Enter` / `Space` (`Shift+Enter` adds a sort key) | Sort |
| Panels (filter, columns, templates) | `Tab` / `Shift+Tab`, `Esc` | Focus stays inside the panel; `Esc` closes and returns focus to the button that opened it |
| Filter panel tabs | `←` `→`, `Home` / `End` | Switch between “Values” and “Pattern” |
| Templates panel | `Enter` in the name field | Save |

Focus is kept across re-renders (sorting, filtering, paging, …): the same
control — or its closest equivalent, e.g. the current page when “next” becomes
disabled — gets focus again.

**Semantics**

- Semantic `<table>`, named by `title`, with `scope="col"` and `aria-sort`;
  multi-sort priority is part of the header button's name.
- Card view is a list (`role="list"` / `listitem`).
- Keyboard hints are linked to the table/list via `aria-describedby`.
- Icon-only buttons have an `aria-label` (per column where it matters, e.g.
  “Filter: Name”, “Copy value: Name”); icons are decorative (`aria-hidden`).
- The table/grid toggle is an action button whose label names the view it switches to.
- Pagination is a `navigation` landmark; page buttons are named “Page n”, the
  current one has `aria-current="page"`.
- Actions menu: `role="menu"` / `menuitem`, named “Actions: <column>”.
- Panels are modal dialogs (`role="dialog"`, `aria-modal`, named by their
  heading); opener buttons carry `aria-haspopup="dialog"` and `aria-expanded`.
  The filter panel uses the tabs pattern (`tablist` / `tab` / `tabpanel`).
- All inputs and selects have accessible names.

**Status messages** (polite live region, WCAG 4.1.3): number of results after
search/filter, sort order, page range, “Copied to clipboard”, hidden column,
saved/loaded template. All texts come from `i18n.js`.

**Visual**

- Visible focus indicator (`:focus-visible` outline) on every interactive
  element, including cells, cards and menu items; copy buttons that are hidden
  until hover become visible on keyboard focus.
- Touch targets ≥ 44px on touch layouts.
- Default colors meet contrast requirements (muted text fallback `#666`, 5.7:1
  on white). When overriding `--k-*` tokens, keep ≥ 4.5:1 for text and ≥ 3:1
  for UI components and focus indicators.

**Not covered by the component:** content you render yourself via `formatter`,
`action` or `config.styles` — keep it accessible (names, contrast).

---

## Demo

`demo.html` is a full playground (137 sample rows, theme toggle, reload, CSV export, state dump). Serve over HTTP, e.g.:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/demo.html
```

---

## Development & tests

No npm, no build. Tests need only **Node.js ≥ 22** and, for browser tests,
a Chromium-based browser.

```bash
node tests/run.js                 # all tests
node tests/run.js --unit          # unit tests only (node:test)
node tests/run.js --browser       # browser tests only (headless Chromium)
node tests/run.js --filter "sort" # only tests whose name contains "sort"
```

| Path | Content |
|------|---------|
| `tests/unit/*.test.js` | `node:test` tests for the DOM-free modules (formatting, sorting, filtering, CSV, i18n, icons, …) |
| `tests/browser/datatable.test.js` | Component tests in a real browser (rendering, sorting, pagination, context menu, accessibility, keyboard, responsive) |
| `tests/browser/harness.js` | Tiny in-browser test harness (`test`, `assert`, `waitFor`, `input.press`, `input.viewport`) |
| `tests/run.js` | Runner: starts a static server and headless Chromium, drives it via the DevTools protocol |

**Browser lookup:** `CHROME_BIN` env var → `chromium` / `google-chrome` on
`PATH` → Playwright's browser cache (`~/.cache/ms-playwright`).

**In a normal browser:** serve the repo (`python3 -m http.server 8000`) and open
<http://localhost:8000/tests/browser/>. Tests marked `{ cdp: true }` need
trusted keyboard input or viewport emulation and are skipped there. Keep the
tab in the foreground; background tabs pause animation frames.

**Writing a browser test:**

```js
test("name", async () => {
    const table = mount({ features: { sorting: true } });   // mounts into #fixture
    $$(table, "thead th")[1].querySelector("button").click();
    assert.equal($$(table, "thead th")[1].getAttribute("aria-sort"), "ascending");
});

test("keyboard", async () => {
    // …
    await input.press("Enter");          // trusted key event via CDP
}, { cdp: true });
```

Each change to UI behavior should come with a browser test, including its
keyboard and screen-reader semantics (roles, names, states, focus).

---

## Releases & build

Releases are fully automated with GitHub Actions
(`.github/workflows/release.yml`) and
[semantic-release](https://semantic-release.gitbook.io/):

1. Every push and pull request runs all tests against the sources, builds a
   dev bundle and runs the browser tests against it.
2. On `main`, semantic-release derives the next version from the commit
   messages since the last tag. If a release is due, it builds
   `dist/jw-datatable.min.js` with that version, runs the browser tests
   against the bundle, and only if they pass commits the bundle
   (`chore(release): X.Y.Z [skip ci]`), tags `vX.Y.Z` and publishes a GitHub
   release with the file attached.

**Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/):**

| Commit | Release |
|--------|---------|
| `fix: …` | patch (1.0.**1**) |
| `feat: …` | minor (1.**1**.0) |
| `feat!: …` or footer `BREAKING CHANGE: …` | major (**2**.0.0) |
| `docs:`, `test:`, `refactor:`, `chore:`, `ci:`, `style:` | no release |

**Local build** (optional, needs `npx` for the pinned esbuild version, or set
`ESBUILD_BIN`):

```bash
node tools/build.js 1.2.3-local       # writes dist/jw-datatable.min.js
node tests/run.js --browser --dist     # browser tests against the bundle
```

Don't commit a locally built `dist/` — CI owns it.

The build minifies the CSS and icon markup, then bundles and minifies all
modules with esbuild into one ES module (≈ 70 KB, ≈ 20 KB gzipped).

**Repository setup:** Actions need write access (*Settings → Actions →
General → Workflow permissions → Read and write*). If `main` is protected
against direct pushes, allow GitHub Actions to bypass the rule or provide a
token with push rights as `GITHUB_TOKEN` replacement.
