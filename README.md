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
- **Links** – href, SPA routing event, or custom handler (e.g. open a dialog)
- **Copy button** – per column on hover when `copyable` is set
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
14. [i18n / Localization](#i18n--localization)
15. [Accessibility](#accessibility)
16. [Demo](#demo)

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
| `icons.js` | Inline SVG icons (no external icon package) |
| `i18n.js` | UI translations + `getTranslations()` helper |
| `columns.js` | Column inference from data |
| `demo.html` | Runnable demo |

All modules are plain ES modules with no build step.

---

## Installation & import

```js
// Convenience API (recommended)
import { createDataTable } from "./datatable/datatable.js";

// Or the class directly
import { JwDataTable } from "./datatable/datatable.js";
```

Importing registers the `<jw-datatable>` custom element automatically.

**Requirements:** modern browser with Custom Elements v1 and Shadow DOM.
ES modules need an HTTP(S) origin (not `file://`).

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
| `defaultView` | `"table" \| "grid"` | `"table"` | Initial view |
| `grid` | `object` | — | `{ minWidth, titleColumn }` |
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

All features are on by default. Disable via `features`:

```js
features: {
    pagination: true,
    sorting: true,
    multiSort: true,      // multi-column sort via Shift+click
    filtering: true,
    globalSearch: true,
    contextMenu: true,
    csvExport: true,
    grid: true,           // table/grid toggle
    columnVisibility: true,
    templates: true,
    copyButtons: true     // plus per-column `copyable`
}
```

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

- Semantic `<table>` with `scope="col"` and `aria-sort` on headers
- Controls are real `<button>` / `<input>` with `aria-label` / `title`
- Pagination uses `role="navigation"`; current page has `aria-current="page"`
- Context menu: `role="menu"` / `role="menuitem"`; closes on Esc and outside click; overlays too
- Focus styles via `:focus-visible`

---

## Demo

`demo.html` is a full playground (137 sample rows, theme toggle, reload, CSV export, state dump). Serve over HTTP, e.g.:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/demo.html
```
