# jw-datatable – Developer documentation

Configurable, reusable data table as a Web Component (`<jw-datatable>`),
written in Vanilla JS (ES modules, Shadow DOM). No external dependencies.

**Features**

- **Pagination** – first/previous/next/last, page numbers, configurable page size
- **Sorting** – ascending/descending, multi-column (Shift+click), context menu
- **Filters** – value filter (pick values) and pattern filter (type-specific operators)
- **Quick filters** – right-click a cell → “Filter by value” / “Exclude value”
- **Global search** – full-text across searchable columns
- **Context menu** – sort, filter, copy (cell/row/column), pin/hide column, export
- **Record details** – dialog with all fields of a row (including hidden columns), previous/next through all results
- **Column order** – move columns via drag and drop on the header (desktop), the context menu, `Ctrl+Shift+←/→` or the column chooser
- **Column pinning** – pin any columns to the left edge (sticky while scrolling horizontally); scroll shadows show where more content is
- **Export** – CSV, Excel (XLSX) or JSON as a download or to the clipboard, via a dialog (rows, columns, raw or formatted values, header, delimiter); entirely in the browser, protected against formula injection
- **Grid / card view** – cards with label/value pairs as an alternative to the table (two columns, stacked on narrow cards)
- **Compact view** – summary table with a few key columns; a tap on a row opens all its fields in a details dialog
- **Mobile First / responsive** – compact, touch-optimized layout; auto-switches to the card or compact view on small screens; bottom-sheet panels; long-press context menu
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
10. [Column pinning](#column-pinning)
11. [Column order](#column-order)
12. [Views: table, cards, compact](#views-table-cards-compact)
13. [Record details](#record-details)
14. [Export](#export)
15. [Templates & storage adapter](#templates--storage-adapter)
16. [Events](#events)
17. [Instance API](#instance-api)
18. [Theming & styling](#theming--styling)
    - [Size & placement](#size--placement)
    - [Icons](#icons)
19. [Responsive & touch](#responsive--touch)
20. [i18n / Localization](#i18n--localization)
21. [Accessibility](#accessibility)
22. [Demo](#demo)
23. [Development & tests](#development--tests)
24. [Releases & build](#releases--build)

---

## Files & layout

| File | Role |
|------|------|
| `datatable.js` | **Public API** – registers `<jw-datatable>` and exports `createDataTable()` |
| `jwDataTable.js` | Web Component (rendering, state, interaction) |
| `formatters.js` | Type-dependent display formatting |
| `comparators.js` | Sort comparison, multi-column sort |
| `filtering.js` | Value/pattern filters, operators, distinct values |
| `export.js` | CSV / XLSX / JSON build, formula neutralizing, file name & download |
| `xlsx.js` | XLSX writer (one worksheet, uncompressed ZIP) |
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
| `initial` | `object` | — | `{ sort, filters, globalSearch, page, pageSize, viewMode, hiddenColumns, pinnedColumns, columnOrder }` |
| `defaultView` | `"table" \| "grid" \| "compact"` | `"table"` | Initial view (pins the view — disables auto-switching) |
| `grid` | `object` | — | `{ minWidth, titleColumn }` |
| `responsive` | `object` | *(on)* | `{ enabled, breakpoint, autoGridView, mobileView }` — see [Responsive & touch](#responsive--touch) |
| `maxHeight` | `string` | — | e.g. `"60vh"`; scroll body, sticky header |
| `columnMinWidth` | `string` | — | Minimum width of text columns, e.g. `"10rem"` (see [Column widths](#column-widths)) |
| `cellOverflow` | `"wrap" \| "ellipsis"` | `"wrap"` | Long cell text wraps, or stays on one line with “…” (see [Long cell content](#long-cell-content)) |
| `storage` | `object` | — | Templates: `{ adapter, namespace, key }` |
| `searchPlaceholder` | `string` | *(from locale)* | Search input placeholder override |
| `emptyText` | `string` | *(from locale)* | Override text shown when there are no rows |
| `noResultsText` | `string` | *(from locale)* | Override text shown when filters match nothing |
| `exportFilename` | `string` | `title`, else `"export"` | Base of the default file name (timestamp and extension are appended) |
| `exportDefaults` | `object` | — | Defaults of the export dialog and `exportData()` (see [Export](#export)) |
| `styles` | `string` | — | Extra CSS injected into shadow root |
| `rowClass` | `(row, index) => string` | — | CSS class(es) per row |
| `onRowClick` | `(row, index) => void` | — | Row/card click (compact view: “Open” button in the details dialog) |
| `onCellClick` | `(value, row, column) => void` | — | Cell click (not in the compact view) |

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
| `exportFormatter` | `(value, ctx) => any` | Custom export value; `ctx = { row, column, locale, localized, format }` |
| `options` | `{ value, label }[]` | Labels for `enum` / `select` |
| `align` | `"left" \| "right" \| "center"` | Alignment (type-dependent default) |
| `width` | `string` | Fixed width, e.g. `"80px"`; the column is never squeezed below it |
| `minWidth` | `string` | Minimum width, e.g. `"14rem"`; overrides `columnMinWidth` (see [Column widths](#column-widths)) |
| `overflow` | `"wrap" \| "ellipsis"` | Overrides `cellOverflow` for this column |
| `maxWidth` | `string` | Content width limit for `"ellipsis"` cells (default `16rem`), e.g. `"200px"` |
| `hidden` | `boolean` | Initially hidden |
| `compact` | `boolean` | Shown in the compact view (default: the first two visible columns) |
| `pinned` | `boolean` | Initially pinned to the left edge (needs `features.columnPinning`; `initial.pinnedColumns` wins) |
| `sortable` | `boolean` | Allow sort (default `true`) |
| `filterable` | `boolean` | Allow filter (default `true`) |
| `searchable` | `boolean` | Include in global search (default `true`) |
| `exportable` | `boolean` | Include in exports (default `true`) |
| `copyable` | `boolean` | Show copy button on hover |
| `link` | `object \| function` | Link behind the value (see below) |
| `action` | `(row, value, event) => void` | Render value as a button |
| `cellClass` | `(value, row) => string` | CSS class(es) per cell |

Column flags apply only when the matching global feature is enabled.

### Column widths

Columns size to their content. When the table is wider than its space, the
browser first squeezes every column down to its longest word (headers never
wrap) and only then scrolls horizontally, so with many columns text ends up
wrapped almost word by word. Set a floor to keep columns readable; the table
scrolls instead:

```js
createDataTable("#c", {
    columnMinWidth: "10rem",                    // all text columns
    columns: [
        { key: "id",    type: "integer" },      // numbers: natural width
        { key: "email", minWidth: "16rem" },    // wider than the default
        { key: "code",  width: "6rem" }         // fixed width
    ]
});
```

- **`columnMinWidth`** applies to text columns only (`string`, `text`, `enum`,
  `select` and other non-number/date/boolean types).
- **Numbers, dates and booleans** never wrap and keep their natural width.
- **`minWidth`** per column wins over `columnMinWidth`; **`width`** also acts
  as the floor, so a column with a fixed width is not squeezed.
- Widths include the cell padding. A column is never narrower than its header
  (label plus sort/filter/pin buttons), even with a smaller `width`.
- With `"ellipsis"` cells the content is still cut at `maxWidth` (default
  `16rem`); a larger `minWidth` only adds empty space, so keep it below.

### Long cell content

By default long values wrap at spaces; a single word is only broken when it
does not fit at all (`overflow-wrap: break-word`); numbers, dates and booleans
stay on one line. In cards and the details dialog, long words without break
opportunities (e-mail addresses, URLs) wrap anywhere instead of overflowing.
A floor against squeezed columns is described in
[Column widths](#column-widths). With `cellOverflow: "ellipsis"`
(or `overflow: "ellipsis"` per column) cells stay on one line, are capped at
`maxWidth` (default `16rem`, CSS variable `--k-dt-cell-max-width`) and end in
“…” when cut off:

- **Mouse:** hovering a cut-off value shows the full text as a tooltip
  (`title`, set only when the text is actually truncated).
- **Keyboard / touch:** the focused (or tapped) cell shows its full content,
  wrapping onto several lines until focus moves on.
- Screen readers always get the full text.

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

Empty values (nothing to display) get neither a link nor a button, so there
is no focus stop without a name.

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
| `grid` | off | Card/grid view in the view switch (also drives responsive auto-view) |
| `compactView` | off | Compact view in the view switch: key columns + details dialog per row (includes `rowDetails` behavior) |
| `columnVisibility` | off | Column chooser: one switch per column to show/hide it |
| `columnPinning` | off | Pin columns to the left edge (context menu, column chooser) |
| `columnReorder` | off | Move columns: drag and drop on the header, context menu, `Ctrl+Shift+←/→`, column chooser |
| `rowDetails` | off | “Show details” in the context menu of cells/cards: dialog with all fields of the record |
| `templates` | off | Save/load views (needs storage) |
| `export` | off | Export button and context-menu entry (dialog: CSV / XLSX / JSON, download or clipboard) |

Enable what you need:

```js
features: {
    sorting: true,
    filtering: true,
    globalSearch: true,
    grid: true,
    compactView: true,
    columnVisibility: true,
    columnPinning: true,
    columnReorder: true,
    rowDetails: true,
    templates: true,
    export: true
}
```

To turn an always-on feature off, set it to `false` (e.g. `pagination: false`).
Column-level flags (`sortable`, `filterable`, …) apply only when the matching
global feature is enabled.

---

## Filters

Per column (filter icon in header or context menu):

- **Values** – checkbox list with counts, search field, “Select all”.
  Searching works like Excel's AutoFilter: the matching values start out
  checked (“Select all search results”), and a segmented control below the
  list (“Search results”) decides what “Apply” (or `Enter` in the search field
  or on an option) does:
  - **Only these values** (default) – the filter becomes exactly the
    checked matches; values hidden by the search are not included.
  - **Add to filter** – the checked matches are added to the selection from
    before the search.

  Clearing the search field restores the selection from before the search.
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

## Column pinning

With `features.columnPinning`, users can pin any column to the left edge. Pinned
columns move to the front (in the order they were pinned) and stay in place
(`position: sticky`) while the rest of the table scrolls horizontally. Each
pinned column's offset is the summed width of the pinned columns before it; it
is re-measured whenever the table or its container resizes.

- **Pin / unpin:** context menu of a header or cell (“Pin column” / “Unpin
  column”), or the pin toggle next to each column in the column chooser
  (`features.columnVisibility`). Pinned columns show a pin button in their
  header that unpins them.
- **Start state:** `pinned: true` on a column, or `initial.pinnedColumns: ["key", …]`.
- **State:** `pinnedColumns` is part of `getState()` / `setState()` and of
  saved templates.
- **Space limit:** pinned columns cover at most 60 % of the visible width.
  When they don't all fit (e.g. on a phone), the most recently pinned ones stay
  in place and the older ones scroll with the table until there is room again;
  pinning announces which columns scroll along.

Horizontal **scroll shadows** appear on the edges that have more content
(with pinned columns, on the edge of the last pinned column). This is
independent of pinning and always on.

Pinned cells need an opaque background. They use `--k-color-page` (header:
`--k-color-surface`); if you color rows via `rowClass`, set the color on the
cells (`.my-row > td`), not on the `<tr>`, so pinned cells match.

---

## Column order

With `features.columnReorder`, users can move columns:

- **Drag and drop** a header onto another header (desktop layout, not on
  touch); an accent bar marks whether it lands before or after the target.
- **Context menu** of a header or cell: “Move left”, “Move right”, “Move to
  start”, “Move to end” (only the moves that are possible), and “Reset column
  order” once the order differs from `columns`.
- **Keyboard shortcut** on a header button: `Ctrl+Shift+←` / `Ctrl+Shift+→`
  (deliberately not `Ctrl+Alt+arrows`, which screen readers use for table
  navigation and the Windows Magnifier for panning, and not `Alt+Shift`, which
  switches the keyboard layout on Windows).
- **Column chooser** (`features.columnVisibility`): “Move up” / “Move down”
  per column; the list shows all columns in display order (top = left).

**With pinned columns:** pinned columns always form the block at the front.
Moving a column into that block pins it, moving a pinned column out of it
unpins it; dropping a column right at the boundary keeps its state. Pinned
columns can be reordered among themselves (this changes `pinnedColumns`).

**State:** `columnOrder` (all column keys, including hidden ones) is part of
`getState()` / `setState()` / `initial` and saved templates. Unknown keys are
ignored; columns missing from it keep their configured order at the end.
CSV export and “Copy row” follow the displayed order. In the compact view the
moves refer to the columns shown there.

---

## Views: table, cards, compact

| View (`viewMode`) | Feature | What it shows |
|-------------------|---------|---------------|
| `"table"` | always | All visible columns |
| `"grid"` | `features.grid` | One card per row with label/value pairs (`grid.titleColumn` as card title) |
| `"compact"` | `features.compactView` | A table with only the key columns plus a details button per row |

With more than one view enabled, the toolbar shows a **view switch**: one
toggle button per view, the current one pressed. The chosen view is part of
the state (`viewMode`) and of saved templates. A `viewMode` whose feature is
off falls back to the table.

**Compact view.** Columns marked `compact: true` are shown (default: the first
two visible columns, pinned ones first). Tapping a row — or `Enter` on one of
its cells, or the details button at the end of the row — opens the
[details dialog](#record-details) with **all** fields of the record, including
the columns not shown in the compact table and hidden ones. Links and buttons
inside cells keep their own action. `onRowClick` does not fire on the row here;
the dialog offers it as an “Open” button instead.

Compact rows are as high as table rows; on touch layouts they are at least
44px high, because the whole row is the tap target for the details.

```js
createDataTable("#c", {
    columns: [
        { key: "name", label: "Name", compact: true },
        { key: "status", label: "Status", compact: true },
        { key: "email", label: "Email" },
        // …
    ],
    features: { grid: true, compactView: true },
    responsive: { mobileView: "compact" }   // phones start in the compact view
});
```

---

## Record details

With `features.rowDetails` (or `features.compactView`), the context menu of
every cell and card has **“Show details”**; in the compact view, rows open it
directly. It opens a modal dialog (centered on desktop, bottom sheet on
mobile) with every field of the record as label/value pairs — visible columns in
display order, then hidden ones. Values are formatted as in the table, links and
copy buttons work.

- **Previous / Next** walk through all filtered and sorted rows, across pages:
  the table turns the page along, and when the dialog closes, focus returns to
  the shown record's row (or card).
- **Open** (only with `onRowClick`) closes the dialog and calls
  `onRowClick(row, index)` for the shown record.
- The dialog title uses `grid.titleColumn`, else the first visible column.

---

## Export

With `features.export`, the toolbar button (download icon) and **“Export…”**
in the context menu open the export dialog (centered on desktop, bottom sheet
on mobile). Everything happens in the browser, no backend.

Always shown, so a quick export is just `Enter`:

- **Format** – CSV (default), Excel (XLSX) or JSON.
- **Destination** – file download (default) or clipboard (CSV and JSON; XLSX
  is binary and is not offered for the clipboard). The submit button reads
  “Export” or “Copy”.
- **File name** (downloads only) – default: `exportFilename`, else `title`,
  else `"export"`, plus a timestamp and the extension, e.g.
  `Members_2026-10-12_14-30-05.csv`. Switching the format swaps the extension;
  a missing extension is added.

Behind **“More options”** (collapsed); options that do not apply to the chosen
format are hidden:

| Option | Default | Description |
|--------|---------|-------------|
| Rows (`scope`) | `"filtered"` | `"page"` current page (only with pagination), `"filtered"` all rows matching filters and search, `"all"` the entire data. Always in the current sort order; the dialog shows the row count of each choice |
| Include hidden columns (`allColumns`) | `false` | Also export hidden columns (only offered when columns are hidden). Columns always come in display order; `exportable: false` columns are never exported |
| Values as displayed (`localized`) | `false` | `false`: raw values (CSV/JSON: numbers with `.` decimal point, booleans as `true`/`false`, `Date` objects as ISO strings; XLSX: typed cells). `true`: the formatted text from the table (locale, `format`, `formatter`), in XLSX as text cells |
| Header row (`headers`) | `true` | CSV and XLSX |
| Column names (`names`) | `"label"`, JSON: `"key"` | `"label"` or `"key"`; header row in CSV/XLSX, property names in JSON. Follows the format until the user picks one |
| Include column info (`metadata`) | `false` | JSON only: `{ columns: [{ key, label, type }], data: [...] }` instead of a plain array, shaped like the table's own config (`key` is the property name used in `data`) |
| Delimiter (`delimiter`) | `";"`, clipboard: tab | CSV only: `;` `,` tab `\|`. Copying defaults to tab, so the text pastes into spreadsheet cells; a delimiter the user picked stays |

`exportDefaults` changes these defaults (plus `format` and `destination`) for
the dialog and `exportData()`:

```js
createDataTable("#c", { /* … */
    features: { export: true },
    exportFilename: "members",
    exportDefaults: { format: "xlsx", localized: true, delimiter: "," }
});
```

A column's `exportFormatter(value, ctx)` replaces its value in every export
(`ctx = { row, column, locale, localized, format }`).

**CSV** follows RFC 4180 (quoted fields, CRLF line endings); downloads start
with a BOM so Excel detects UTF-8.

**XLSX** is a workbook with one worksheet named after `exportFilename` /
`title` (bold, frozen header row, column widths from the content). Raw values
become typed cells: numbers (currency `#,##0.00`, percent `0.00%`, integer
`#,##0`), booleans, and dates/times of `date` / `datetime` / `time` columns
as Excel dates (`"2024-01-05"` strings count as local days). Cells are never
written as formulas. The file is built by `xlsx.js` without dependencies (an
uncompressed ZIP).

**JSON** is an array of objects (one per row), or with column info an object
`{ columns, data }`; raw values keep their types, empty values become `null`.
If two columns share a name, the second one uses its key.

**Formula injection.** Spreadsheet apps run cells that start with `=`, `+`,
`-`, `@`, tab or carriage return (and their full-width forms) as formulas. In
CSV — header and values — and in everything copied from the table (copy
buttons, “Copy cell/row/column”), such text gets a leading `'`, so it shows as
text. Numbers, including signed and formatted ones like `-5` or
`-1.234,56 €`, stay unchanged. XLSX writes text cells, which are never run;
JSON is not affected.

The result is announced: “30 rows exported to “Members_….csv”” or “30 rows
copied to clipboard”. The `jw-datatable:export` event fires before the
download or copy and can cancel it (see [Events](#events)), e.g. to send the
file elsewhere:

```js
table.addEventListener("jw-datatable:export", (e) => {
    e.preventDefault();                  // no download, no announcement
    upload(e.detail.filename, e.detail.content);   // string, or Uint8Array for XLSX
});
```

Without the dialog: `table.exportData({ format: "xlsx", scope: "all" })`.

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
| `jw-datatable:export` | `{ format, destination, filename, content, rowCount, columns, options }` | Before an export is downloaded or copied; `content` is a string (CSV, JSON) or `Uint8Array` (XLSX); **cancelable** (`preventDefault()` skips download/copy and announcement) |

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
| `openExportDialog()` | — | Open the export dialog (also without `features.export`) |
| `exportData(options?)` | `object \| null` | Export without the dialog; `options` as in [Export](#export) plus `format`, `destination` (XLSX always downloads) and `filename`. Returns the event detail, `null` if cancelled |
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
    viewMode: "table",            // or "grid", "compact"
    hiddenColumns: ["internalId"],
    pinnedColumns: ["name"],      // display order of the pinned columns
    columnOrder: ["name", "email", "id", "internalId"]   // all columns; pinned ones still come first
}
```

Entries that refer to columns which do not exist (in `sort`, `filters`,
`hiddenColumns`, `pinnedColumns`, `columnOrder`) are ignored, e.g. a state
stored before the column configuration changed.

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

### Size & placement

`<jw-datatable>` is a block element (`display: block; min-width: 0`): without
a width it fills its parent, otherwise it takes whatever width you give it from
outside (`width`, `max-width`, a grid track, a flex basis). A table wider than
that scrolls horizontally inside the component; toolbar and footer stay put.
Because of `min-width: 0` it also shrinks to its track as a flex or grid item
instead of stretching the layout.

```css
jw-datatable { max-width: 48rem; }                 /* fixed or capped width */
.layout { display: grid; grid-template-columns: 1fr 20rem; } /* shrinks with the track */
```

Height grows with the rows; set `maxHeight` (e.g. `"60vh"`) to scroll the body
vertically under a sticky header.

The switch to the mobile layout follows the **viewport** width
(`responsive.breakpoint`), not the component's own width: a narrow table on a
wide screen keeps the table view and scrolls horizontally.

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
| View | auto `mobileView`: cards or compact (`autoGridView`) | table |
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
        autoGridView: true,  // switch views automatically at the breakpoint
        mobileView: "grid"   // view below the breakpoint: "grid" (cards, needs features.grid)
                             // or "compact" (needs features.compactView)
    }
});
```

Notes:

- **Auto view switching** only kicks in when neither `defaultView` nor
  `initial.viewMode` is set, and is suspended once the user switches the view or
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
| Table cell | `Enter` | Activate the cell's link or action, otherwise `onCellClick` / `onRowClick`; in the compact view: open the row's details |
| Card view | `←` `→` `↑` `↓`, `Home` / `End`, `Enter` | Move between cards, `Enter` triggers `onRowClick` |
| Cell, card, header button | `Shift+F10` or context-menu key | Open the actions menu (same as right-click / long-press) |
| Header button | `Ctrl+Shift+←` / `Ctrl+Shift+→` | Move the column (with `features.columnReorder`); focus stays on the button |
| Actions menu | `↑` `↓`, `Home` / `End`, `Enter` / `Space`, `Esc` / `Tab` | Navigate, activate, close (focus returns to where the menu was opened) |
| Sort header | `Enter` / `Space` (`Shift+Enter` adds a sort key) | Sort |
| Panels (filter, columns, templates, details, export) | `Tab` / `Shift+Tab`, `Esc` | Focus stays inside the panel; `Esc` closes and returns focus to the button that opened it |
| Details dialog | `Shift+F10` on a cell/card → “Show details”; `Enter` on “Previous” / “Next” | Opens with focus on the dialog heading; focus stays on the pressed button (moves to the other one at the first/last record); closing returns focus to the shown record |
| Filter panel tabs | `←` `→`, `Home` / `End` | Switch between “Values” and “Pattern” |
| Filter panel, “Values” tab | `Enter` in the search field or on a search-result option | Apply (same as the “Apply” button); the search-result options are radio buttons (`↑` `↓`) |
| Templates panel | `Enter` in the name field | Save |
| Export dialog | `←` `→` (or `↑` `↓`) in a segmented control, `Space` on a switch or “More options”, `Enter` in the file name or on an option | Select an option, toggle a switch, export (same as the “Export” button); focus starts on the selected format and returns to the opener afterwards |

Focus is kept across re-renders (sorting, filtering, paging, …): the same
control — or its closest equivalent, e.g. the current page when “next” becomes
disabled — gets focus again. Sorting, pinning/unpinning and showing/hiding
columns update the table in place (header cells are reused and reordered, the
`<table>` element stays), so the focused header button stays the same element
and screen readers only announce the change instead of re-reading the whole
table.

**Semantics**

- Semantic `<table>`, named by `title`, with `scope="col"` and `aria-sort`;
  multi-sort priority is part of the header button's name.
- Card view is a list (`role="list"` / `listitem`); each card lists its
  fields as a description list (`<dl>` with `<dt>` label / `<dd>` value).
- Keyboard hints are linked to the table/list via `aria-describedby`.
- Icon-only buttons have an `aria-label` (per column where it matters, e.g.
  “Filter: Name”, “Copy value: Name”); icons are decorative (`aria-hidden`).
- The view switch is a `group` named “View” with one toggle button per view
  (`aria-pressed`, named “Table view” / “Grid view” / “Compact view”).
- Compact view: the details column has a visually hidden header “Details”;
  each row's button is named “Show details: <record>” and carries
  `aria-haspopup="dialog"` / `aria-expanded`. The keyboard hint mentions that
  `Enter` opens the details.
- Column order: every drag-and-drop move also works without dragging (context
  menu, `Ctrl+Shift+←/→`, column chooser buttons named “Move up: <column>” /
  “Move down: <column>”). Moves are announced with the new position (“Column
  “Name” moved to position 3 of 8”, or pinned/unpinned when crossing the
  pinned block); the table and the focused control are kept in place.
- Column pinning: the pin toggles in the column chooser are toggle buttons
  (`aria-pressed`, named “Pin column: <column>”); the pin button in a pinned
  column's header is named “Unpin column: <column>”. After unpinning from the
  header, focus moves to the column's header button at its new position.
- Pagination is a `navigation` landmark; page buttons are named “Page n”, the
  current one has `aria-current="page"`.
- Actions menu: `role="menu"` / `menuitem`, named “Actions: <column>”.
- Panels are modal dialogs (`role="dialog"`, `aria-modal`, named by their
  heading); opener buttons carry `aria-haspopup="dialog"` and `aria-expanded`.
  The filter panel uses the tabs pattern (`tablist` / `tab` / `tabpanel`).
- Segmented controls (export dialog, search-result option in the value
  filter) are native radio groups (`fieldset` / `legend`, one tab stop, arrow
  keys) drawn as adjacent options; the selected one is filled. Switches
  (export options, column visibility in the column chooser) are native
  checkboxes with `role="switch"` (“switch, on/off”, `Space` toggles), named by
  their row; the knob position shows the state. Both keep a visible focus,
  ≥ 44px touch targets on mobile and work in forced-colors mode.
- Export dialog: named “Export” by its `<h2>` heading. Format, destination,
  rows and column names are segmented controls, on/off options are switches.
  “More options” is a disclosure button
  (`aria-expanded`, `aria-controls`); options that do not apply to the chosen
  format or destination are hidden, not just disabled. Choosing the clipboard
  while XLSX is selected switches to CSV.
- Details dialog: named “Details: <record>” by its `<h2>` heading, fields as a
  description list, “Previous” / “Next” named “Previous record” / “Next
  record”; moving to another record announces “Record n of total: <record>”.
- All inputs and selects have accessible names.

**Status messages** (polite live region, WCAG 4.1.3). The region is a single
visually hidden `<div data-jw-datatable-announcer>` appended to `<body>` and
shared by all tables — live regions inside shadow roots are not reliably
announced by screen readers. While a panel (modal dialog) is open, messages go
to a live region inside the panel instead. Messages: number of results after
search/filter, sort order, page range, “Copied to clipboard: <value>”, hidden
column, pinned/unpinned column (including when there is not enough room to keep
pinned columns in place), record shown in the details dialog, saved/loaded template, finished export (rows and file name, or rows copied to the clipboard). Repeated identical messages are announced again.
All texts come from `i18n.js`.

The result count of the global search is announced once typing pauses (1 s),
not after every keystroke.

**Copy confirmation.** With the keyboard, focus stays on the copy button and
the button itself is renamed to “Copied to clipboard: <value>” and shows a
check icon until it loses focus. Screen readers announce name changes of the focused element regardless
of their live-region settings (e.g. NVDA “Report dynamic content changes”),
and nothing is announced twice. A mouse click does not move focus (so the table
context is not read out); the confirmation then goes to the live region and the
check icon shows for about a second.
Copying also works without the async Clipboard API (plain HTTP) and keeps
focus in place.

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

`demo.html` is a full playground with the table front and center:

- **Sample data** – 26 columns of every type (nested keys, `accessor`,
  `link`, `action`, `cellClass`, hidden and non-exportable columns, empty
  values, formula-like text) and 0 to 10,000 seeded rows; “New data” draws
  new ones.
- **Table width** – slider, “Full width”, or drag the grip at the right
  edge, to try column widths and horizontal scrolling.
- **Configuration** (collapsed) – every config option, feature and column
  flag can be changed live; the resulting config is shown as code. Settings,
  theme and language are remembered in `localStorage`.
- **Events** – log of all events and callbacks, plus `getState()`.

Serve over HTTP, e.g.:

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
| `tests/unit/*.test.js` | `node:test` tests for the DOM-free modules (formatting, sorting, filtering, export incl. XLSX, i18n, icons, …) |
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
