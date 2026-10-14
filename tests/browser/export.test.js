// Export: dialog, formats, destinations, API and events.

import { test, assert, sleep, waitFor, deepActiveElement, accessibleName, input } from "./harness.js";
import { mount, $, $$, rightClick, announced, menuItem } from "./helpers.js";

// ---- Export -----------------------------------------------------------------

// Captures export events; `cancel` keeps the browser from downloading.
function captureExports(/** @type {HTMLElement} */ table, { cancel = true } = {}) {
    /** @type {any[]} */
    const events = [];
    table.addEventListener("jw-datatable:export", (/** @type {any} */ e) => {
        events.push(e.detail);
        if (cancel) e.preventDefault();
    });
    return events;
}
const exportDialog = (/** @type {HTMLElement} */ table) => $(table, ".k-dt-export[role='dialog']");
// Input of the option/switch labelled `text` (exact match first, then prefix).
const exportControl = (/** @type {HTMLElement} */ table, /** @type {string} */ text) => {
    const labels = $$(table, ".k-dt-export label");
    return (labels.find((l) => l.textContent.trim() === text)
        ?? labels.find((l) => l.textContent.trim().startsWith(text)))?.querySelector("input");
};
const submitExport = (/** @type {HTMLElement} */ table) => $(table, ".k-dt-export button[type='submit']").click();

test("export: toolbar button opens a labelled dialog with format and file name", async () => {
    const table = mount({ title: "Members", features: { export: true } });
    const button = $(table, '[data-fk="tb:export"]');
    assert.equal(accessibleName(button), "Export");
    assert.equal(button.getAttribute("aria-haspopup"), "dialog");
    button.focus();
    button.click();

    const dialog = exportDialog(table);
    assert.ok(dialog, "dialog open");
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.equal(accessibleName(dialog), "Export");
    assert.equal(button.getAttribute("aria-expanded"), "true");
    assert.equal(deepActiveElement(), exportControl(table, "CSV"), "focus on the selected format");
    assert.ok(exportControl(table, "CSV").checked, "CSV is the default format");
    assert.equal(accessibleName(dialog.querySelector("fieldset legend")), "Format");
    const filename = dialog.querySelector('input[type="text"]');
    assert.equal(dialog.querySelector(`label[for="${filename.id}"]`)?.textContent, "File name");
    assert.match(filename.value, /^Members_\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d\.csv$/);

    // Everything else waits behind "More options".
    const toggle = $(table, ".k-dt-disclosure");
    const more = $(table, ".k-dt-export-more");
    assert.equal(accessibleName(toggle), "More options");
    assert.equal(toggle.getAttribute("aria-expanded"), "false");
    assert.equal(toggle.getAttribute("aria-controls"), more.id);
    assert.ok(more.hidden, "options collapsed");
    toggle.click();
    assert.equal(toggle.getAttribute("aria-expanded"), "true");
    assert.ok(!more.hidden, "options expanded");

    // Defaults
    assert.ok(exportControl(table, "Current filter").checked, "scope: current filter");
    assert.equal(exportControl(table, "Include hidden columns"), undefined, "no hidden columns, no option");
    assert.ok(!exportControl(table, "Values as displayed").checked, "raw values");
    assert.ok(exportControl(table, "Header row").checked, "header row");
    assert.ok(exportControl(table, "Label").checked, "labels as column names");
    assert.equal(more.querySelector("select").value, ";", "delimiter");
    assert.equal(dialog.querySelector(`label[for="${more.querySelector("select").id}"]`)?.textContent, "Delimiter");

    $$(table, ".k-dt-export button").find((b) => b.textContent === "Cancel").click();
    assert.equal(exportDialog(table), null, "closed");
    assert.equal(deepActiveElement(), button, "focus back on the button");
    assert.equal(button.getAttribute("aria-expanded"), "false");
});

test("export: default CSV has raw values of the filtered rows, then an announcement", async () => {
    const table = mount({ features: { export: true, globalSearch: true }, initial: { globalSearch: "Anna" } });
    const events = captureExports(table, { cancel: false });
    $(table, '[data-fk="tb:export"]').click();
    submitExport(table);
    assert.equal(exportDialog(table), null, "dialog closed");
    assert.equal(events.length, 1);
    const [detail] = events;
    assert.equal(detail.format, "csv");
    assert.equal(detail.rowCount, 5);
    assert.match(detail.filename, /^export_.*\.csv$/);
    const lines = detail.content.split("\r\n");
    assert.equal(lines[0], "ID;Name;Fee;Active;Joined");
    assert.equal(lines[1], "1;Anna;0;false;2020-01-15");
    assert.equal(lines.length, 6);
    await announced(table, `5 rows exported to “${detail.filename}”`);
});

test("export: options for scope, columns, formatting, header and delimiter", () => {
    const table = mount({ locale: "de-DE", features: { export: true }, initial: { hiddenColumns: ["fee"] } });
    const events = captureExports(table);
    const run = (/** @type {any} */ setup) => {
        $(table, '[data-fk="tb:export"]').click();
        $(table, ".k-dt-disclosure").click();
        setup();
        submitExport(table);
        return events.at(-1);
    };
    let detail = run(() => exportControl(table, "Aktuelle Seite").click());
    assert.equal(detail.rowCount, 10, "current page");
    assert.deepEqual(detail.columns, ["id", "name", "active", "joined"], "visible columns only");

    detail = run(() => {
        exportControl(table, "Gesamte Tabelle").click();
        exportControl(table, "Ausgeblendete Spalten einbeziehen").click();
        exportControl(table, "Werte wie angezeigt").click();
        exportControl(table, "Kopfzeile").click();
        const select = $(table, ".k-dt-export select");
        select.value = ",";
    });
    assert.equal(detail.rowCount, 30, "entire table");
    assert.deepEqual(detail.columns, ["id", "name", "fee", "active", "joined"], "hidden columns included in display order");
    assert.equal(detail.content.split("\r\n")[0].replace(/\u00a0/g, " "), '1,Anna,"0,00 €",Nein,15.01.2020', "formatted, no header, comma");
});

test("export: JSON swaps the extension, uses keys and offers column info", () => {
    const table = mount({ features: { export: true } });
    const events = captureExports(table);
    $(table, '[data-fk="tb:export"]').click();
    $(table, ".k-dt-disclosure").click();
    const filename = $(table, '.k-dt-export input[type="text"]');
    const json = exportControl(table, "JSON");
    json.click();
    assert.match(filename.value, /\.json$/, "extension follows the format");
    assert.ok(exportControl(table, "Header row").closest("label").hidden, "no header option");
    assert.ok($(table, ".k-dt-export select").closest(".k-dt-field").hidden, "no delimiter");
    assert.ok(exportControl(table, "Key").checked, "keys are the default names for JSON");
    const metadata = exportControl(table, "Include column info");
    assert.ok(!metadata.closest("label").hidden && !metadata.checked, "column info offered, off");
    filename.value = "members";
    submitExport(table);
    let detail = events.at(-1);
    assert.equal(detail.filename, "members.json");
    assert.deepEqual(JSON.parse(detail.content)[0], { id: 1, name: "Anna", fee: 0, active: false, joined: "2020-01-15" });

    $(table, '[data-fk="tb:export"]').click();
    $(table, ".k-dt-disclosure").click();
    exportControl(table, "JSON").click();
    exportControl(table, "Include column info").click();
    submitExport(table);
    detail = JSON.parse(events.at(-1).content);
    assert.deepEqual(detail.columns[2], { key: "fee", label: "Fee", type: "currency" });
    assert.equal(detail.data.length, 30);

    // Back to CSV: labels again; a choice the user made sticks.
    $(table, '[data-fk="tb:export"]').click();
    exportControl(table, "JSON").click();
    exportControl(table, "CSV").click();
    assert.ok(exportControl(table, "Label").checked, "labels for CSV");
    exportControl(table, "Key").click();
    exportControl(table, "Excel").click();
    assert.ok(exportControl(table, "Key").checked, "user choice kept");
});

test("export: XLSX downloads a workbook with typed cells", async () => {
    const table = mount({ title: "Members", features: { export: true } });
    const events = captureExports(table, { cancel: false });
    $(table, '[data-fk="tb:export"]').click();
    exportControl(table, "Excel").click();
    assert.match($(table, '.k-dt-export input[type="text"]').value, /^Members_.*\.xlsx$/);
    assert.ok(!exportControl(table, "Header row").closest("label").hidden, "header row option");
    submitExport(table);
    const detail = events.at(-1);
    assert.equal(detail.format, "xlsx");
    assert.ok(detail.content instanceof Uint8Array, "binary content");
    assert.deepEqual(Array.from(detail.content.slice(0, 4)), [0x50, 0x4B, 0x03, 0x04], "ZIP signature");
    const text = new TextDecoder().decode(detail.content);
    assert.match(text, /<sheet name="Members"/);
    assert.match(text, /<c r="C2" s="5"><v>0<\/v><\/c>/, "currency as number");
    await announced(table, `30 rows exported to “${detail.filename}”`);
});

// Replaces the async Clipboard API for one test; returns the written texts.
function stubClipboard() {
    /** @type {string[] & { restore?: () => void }} */
    const written = [];
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (/** @type {string} */ text) => { written.push(text); } }
    });
    written.restore = () => { delete /** @type {any} */ (navigator).clipboard; };
    return /** @type {string[] & { restore: () => void }} */ (written);
}

test("export: clipboard destination copies text with tabs, hides XLSX and the file name", async () => {
    const written = stubClipboard();
    try {
        const table = mount({ features: { export: true } });
        const events = captureExports(table, { cancel: false });
        $(table, '[data-fk="tb:export"]').click();
        $(table, ".k-dt-disclosure").click();
        exportControl(table, "Excel").click();
        exportControl(table, "Clipboard").click();
        assert.ok(exportControl(table, "CSV").checked, "XLSX falls back to CSV");
        assert.ok(exportControl(table, "Excel").closest("label").hidden, "XLSX not offered");
        assert.ok($(table, '.k-dt-export input[type="text"]').closest(".k-dt-field").hidden, "no file name");
        assert.equal($(table, ".k-dt-export select").value, "\t", "tab for pasting into spreadsheets");
        const submit = $(table, ".k-dt-export button[type='submit']");
        assert.equal(submit.textContent, "Copy");
        submit.click();
        assert.equal(events.at(-1).destination, "clipboard");
        await announced(table, "30 rows copied to clipboard");
        assert.equal(written[0].split("\r\n")[1], "1\tAnna\t0\tfalse\t2020-01-15");

        // Back to download: the delimiter returns to its default.
        $(table, '[data-fk="tb:export"]').click();
        exportControl(table, "Clipboard").click();
        exportControl(table, "File").click();
        assert.equal($(table, ".k-dt-export select").value, ";");
        assert.equal($(table, ".k-dt-export button[type='submit']").textContent, "Export");
    } finally {
        written.restore();
    }
});

test("copying cells, rows and columns neutralizes formulas", async () => {
    const written = stubClipboard();
    try {
        const table = mount({ data: [{ id: 1, name: "=cmd|' /C calc'!A0", fee: -5, active: true, joined: "2020-01-01" }] });
        rightClick($$(table, "tbody td")[1]);
        menuItem(table, "Copy cell").click();
        await announced(table, "Copied to clipboard: =cmd|' /C calc'!A0");
        rightClick($$(table, "tbody td")[1]);
        menuItem(table, "Copy row").click();
        rightClick($$(table, "tbody td")[1]);
        menuItem(table, "Copy column").click();
        await waitFor(() => written.length === 3);
        assert.equal(written[0], "'=cmd|' /C calc'!A0", "cell");
        assert.equal(written[1].split("\t")[1], "'=cmd|' /C calc'!A0", "row");
        assert.match(written[1].split("\t")[2], /^-/, "negative number unchanged");
        assert.equal(written[2], "'=cmd|' /C calc'!A0", "column");
    } finally {
        written.restore();
    }
});

test("export: header row off hides the column-name option for CSV", () => {
    const table = mount({ features: { export: true } });
    $(table, '[data-fk="tb:export"]').click();
    const names = exportControl(table, "Label").closest("fieldset");
    assert.ok(!names.hidden);
    exportControl(table, "Header row").click();
    assert.ok(names.hidden);
});

test("export: context menu opens the dialog, Escape returns focus to the cell", async () => {
    const table = mount({ features: { export: true } });
    const cell = $(table, '[data-fk="cell:1:name"]');
    cell.focus();
    rightClick(cell);
    menuItem(table, "Export…").click();
    assert.ok(exportDialog(table), "dialog open");
    await sleep(10);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(exportDialog(table), null);
    assert.equal(deepActiveElement()?.dataset.fk, "cell:1:name", "focus back on the cell");
});

test("export: keyboard — Enter opens, Enter on the format submits, focus returns", async () => {
    const table = mount({ features: { export: true } });
    const events = captureExports(table);
    $(table, '[data-fk="tb:export"]').focus();
    await input.press("Enter");
    assert.ok(exportDialog(table), "dialog open");
    await input.press("ArrowDown");   // XLSX
    await input.press("ArrowDown");   // JSON
    assert.ok(exportControl(table, "JSON").checked);
    await input.press("Enter");
    assert.equal(exportDialog(table), null, "submitted");
    assert.equal(events.at(-1)?.format, "json");
    assert.equal(deepActiveElement()?.dataset.fk, "tb:export", "focus back on the button");

    await input.press("Enter");
    await input.press("Tab");         // destination
    await input.press("Tab");         // file name
    assert.equal(deepActiveElement()?.type, "text");
    await input.press("Enter");
    assert.equal(events.at(-1)?.format, "csv");
}, { cdp: true });

test("export: exportData() API, cancelable event, defaults", () => {
    const table = mount({ title: "T", exportFilename: "list", features: { export: true }, exportDefaults: { names: "key" } });
    const events = captureExports(table);
    const result = table.exportData({ scope: "page", headers: true });
    assert.equal(result, null, "cancelled by the listener");
    assert.equal(events[0].rowCount, 10);
    assert.match(events[0].filename, /^list_.*\.csv$/, "exportFilename is the base name");
    assert.equal(events[0].content.split("\r\n")[0], "id;name;fee;active;joined", "exportDefaults apply");
    table.exportData({ format: "json", filename: "x" });
    assert.equal(events[1].filename, "x.json");
    table.exportData({ format: "xlsx", destination: "clipboard" });
    assert.equal(events[2].destination, "download", "XLSX can only be downloaded");
    assert.equal(/** @type {any} */ (table).exportCSV, undefined, "exportCSV() removed");
});

test("export: the former csvExport flag no longer enables export", () => {
    const table = mount({ features: /** @type {any} */ ({ csvExport: true }) });
    assert.equal($(table, '[data-fk="tb:export"]'), null);
});

test("copy column does not need the export feature", () => {
    const table = mount();
    rightClick($$(table, "tbody td")[1]);
    assert.ok(menuItem(table, "Copy column"), "Copy column offered");
    assert.equal(menuItem(table, "Export…"), undefined, "no export without the feature");
});

test("export: segmented options and switches — roles, names, keyboard, touch targets", async () => {
    await input.viewport(390, 844);
    const table = mount({ features: { export: true } });
    $(table, '[data-fk="tb:export"]').focus();
    await input.press("Enter");
    $(table, ".k-dt-disclosure").click();

    // Segments are native radios: one tab stop per group, arrows select.
    const csv = exportControl(table, "CSV");
    assert.equal(deepActiveElement(), csv);
    assert.equal(csv.type, "radio");
    assert.equal(csv.closest("fieldset").querySelector("legend").textContent, "Format");
    await input.press("ArrowRight");
    assert.ok(exportControl(table, "Excel").checked, "arrow selects the next option");
    assert.equal(deepActiveElement(), exportControl(table, "Excel"));
    await input.press("Tab");
    assert.equal(deepActiveElement(), exportControl(table, "File"), "Tab moves to the next group");
    const page = exportControl(table, "Current page");
    assert.equal(page.labels[0].textContent, "Current page 10 rows", "name includes the row count");

    // Switches: checkbox with role="switch", named by their row, Space toggles.
    const localized = exportControl(table, "Values as displayed");
    assert.equal(localized.type, "checkbox");
    assert.equal(localized.getAttribute("role"), "switch");
    assert.equal(localized.labels[0].textContent, "Values as displayed (formatted)");
    localized.focus();
    await input.press(" ");
    assert.ok(localized.checked, "Space switches on");
    assert.ok(getComputedStyle(localized).outlineStyle !== "none", "visible focus");

    // Touch targets ≥ 44px on mobile.
    for (const node of [...$$(table, ".k-dt-segment"), ...$$(table, ".k-dt-switch")].filter((n) => !n.hidden)) {
        assert.ok(node.getBoundingClientRect().height >= 44, `${node.textContent.trim()}: ${node.getBoundingClientRect().height}px`);
    }
}, { cdp: true });
