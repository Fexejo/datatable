// Export dialog. Format, destination and file name are always shown;
// everything else waits behind "More options" so a quick export is just Enter.

import { el, iconEl, segmentedEl, switchEl } from "../ui/dom.js";
import { EXPORT_DEFAULTS, EXPORT_FORMATS, defaultFilename, defaultNames } from "../export/export.js";
import { uid } from "../core/util.js";
import { formatCount } from "../core/formatters.js";

// `defaults`: export options (see EXPORT_DEFAULTS). `baseName`: start of the
// suggested file name. `scopes`: [[value, text, rowCount]] offered as "Rows".
// `hasHiddenColumns`: offer "All columns". `onSubmit(options)`: export with
// the chosen options; `onCancel()`.
/** @typedef {import("../types.js").ExportOptions} ExportOptions */
/**
 * @param {{ t: import("../core/i18n.js").Translations, locale: string, defaults: ExportOptions, baseName: string,
 *     scopes: [value: ExportOptions["scope"], text: string, rowCount: number][], hasHiddenColumns: boolean,
 *     onSubmit: (options: ExportOptions) => void, onCancel: () => void }} options
 */
export function buildExportDialog({ t, locale, defaults, baseName, scopes, hasHiddenColumns, onSubmit, onCancel }) {
    const id = uid("jwdt-exp");
    /** @param {HTMLElement} label */
    const inputOf = (label) => /** @type {HTMLInputElement} */ (label.querySelector("input"));
    /**
     * @param {string} text
     * @param {HTMLElement} control
     */
    const field = (text, control) => el("div", { class: "jw-dt-field" }, [
        el("label", { class: "jw-dt-field-label", for: control.id, text }),
        control
    ]);
    /**
     * @param {string} name
     * @param {string} legend
     * @param {[value: string, text: string, detail?: string][]} options
     * @param {string} value
     */
    const radios = (name, legend, options, value) => segmentedEl(`${id}-${name}`, legend, options, value);
    // The checked one of the values offered in `group`.
    /**
     * @param {HTMLElement} group
     * @returns {any}
     */
    const radioValue = (group) => /** @type {HTMLInputElement|null} */ (group.querySelector("input:checked"))?.value;
    /**
     * @param {HTMLElement} group
     * @param {string} value
     */
    const setRadio = (group, value) => {
        /** @type {HTMLInputElement} */ (group.querySelector(`input[value="${CSS.escape(value)}"]`)).checked = true;
    };

    let format = EXPORT_FORMATS[defaults.format] ? defaults.format : EXPORT_DEFAULTS.format;
    const formats = /** @type {ExportOptions["format"][]} */ (Object.keys(EXPORT_FORMATS));
    const formatGroup = radios("format", t.exportFormat, formats.map((key) => [key, t.exportFormats[key]]), format);
    formatGroup.querySelector("input:checked")?.setAttribute("data-autofocus", "");
    const destinationGroup = radios("destination", t.exportDestination,
        [["download", t.exportDownload], ["clipboard", t.exportClipboard]],
        defaults.destination === "clipboard" && EXPORT_FORMATS[format].text ? "clipboard" : "download");
    const filename = el("input", {
        type: "text",
        class: "jw-dt-input",
        id: `${id}-name`,
        autocomplete: "off",
        value: defaultFilename(baseName, format)
    });
    const filenameField = field(t.exportFilename, filename);

    // ---- More options
    /** @type {[string, string, string][]} */
    const scopeOptions = scopes.map(([value, text, count]) => [value, text, t.resultsCount(count, formatCount(count, locale))]);
    const scopeGroup = radios("scope", t.exportRows, scopeOptions,
        scopes.some(([value]) => value === defaults.scope) ? defaults.scope : "filtered");
    const allColumns = hasHiddenColumns ? switchEl(t.exportAllColumns, defaults.allColumns) : null;
    const localized = switchEl(t.exportLocalized, defaults.localized);
    const headers = switchEl(t.exportHeaders, defaults.headers);
    const metadata = switchEl(t.exportMetadata, defaults.metadata);
    const namesGroup = radios("names", t.exportNames,
        [["label", t.exportNamesLabel], ["key", t.exportNamesKey]], defaults.names ?? defaultNames(format));
    /** @type {Record<string, keyof typeof t.delimiters>} */
    const delimiterNames = { ";": "semicolon", ",": "comma", "\t": "tab", "|": "pipe" };
    const delimiterOptions = Object.entries(delimiterNames).map(([value, key]) => [value, t.delimiters[key]]);
    if (!delimiterNames[defaults.delimiter]) delimiterOptions.push([defaults.delimiter, defaults.delimiter]);
    const delimiter = el("select", { class: "jw-dt-select", id: `${id}-delimiter` },
        delimiterOptions.map(([value, text]) => el("option", { value, text, selected: value === defaults.delimiter })));
    const delimiterField = field(t.exportDelimiter, delimiter);
    const more = el("div", { class: "jw-dt-export-more", id: `${id}-more`, hidden: true },
        [scopeGroup, allColumns, localized, headers, namesGroup, metadata, delimiterField]);

    // Column names and the delimiter follow format and destination until
    // the user picks one: keys for JSON, tabs for pasting into a spreadsheet.
    let namesSet = defaults.names != null;
    let delimiterSet = false;
    namesGroup.addEventListener("change", () => { namesSet = true; });
    delimiter.addEventListener("change", () => { delimiterSet = true; });

    const submit = el("button", { type: "submit", class: "jw-dt-btn jw-dt-btn-primary" });
    const sync = () => {
        const clipboard = radioValue(destinationGroup) === "clipboard";
        // XLSX cannot go to the clipboard.
        /** @type {HTMLElement} */ (formatGroup.querySelector('[data-value="xlsx"]')).hidden = clipboard;
        filenameField.hidden = clipboard;
        headers.hidden = format === "json";
        metadata.hidden = format !== "json";
        delimiterField.hidden = format !== "csv";
        namesGroup.hidden = format !== "json" && !inputOf(headers).checked;
        if (!namesSet) setRadio(namesGroup, defaultNames(format));
        if (!delimiterSet) delimiter.value = clipboard ? "\t" : defaults.delimiter;
        submit.textContent = clipboard ? t.exportCopySubmit : t.exportSubmit;
    };
    /** @param {ExportOptions["format"]} next */
    const setFormat = (next) => {
        // A new format swaps the extension, unless the user typed another one.
        const oldExt = "." + EXPORT_FORMATS[format].extension;
        if (filename.value.toLowerCase().endsWith(oldExt)) {
            filename.value = filename.value.slice(0, -oldExt.length) + "." + EXPORT_FORMATS[next].extension;
        }
        format = next;
        setRadio(formatGroup, next);
        sync();
    };
    formatGroup.addEventListener("change", () => setFormat(radioValue(formatGroup)));
    destinationGroup.addEventListener("change", () => {
        if (radioValue(destinationGroup) === "clipboard" && !EXPORT_FORMATS[format].text) setFormat("csv");
        else sync();
    });
    headers.addEventListener("change", sync);
    sync();

    const toggle = el("button", {
        type: "button",
        class: "jw-dt-btn jw-dt-disclosure",
        "aria-expanded": "false",
        "aria-controls": more.id,
        onclick: () => {
            more.hidden = !more.hidden;
            toggle.setAttribute("aria-expanded", String(!more.hidden));
        }
    }, [iconEl("chevron-right"), el("span", { text: t.exportMoreOptions })]);

    // Enter in the file name or on an option submits the form.
    const form = el("form", {
        class: "jw-dt-export-form",
        onsubmit: (event) => {
            event.preventDefault();
            onSubmit({
                format,
                destination: radioValue(destinationGroup),
                filename: filename.value,
                scope: radioValue(scopeGroup),
                allColumns: allColumns ? inputOf(allColumns).checked : false,
                localized: inputOf(localized).checked,
                headers: inputOf(headers).checked,
                names: radioValue(namesGroup),
                metadata: inputOf(metadata).checked,
                delimiter: delimiter.value
            });
        }
    }, [
        formatGroup,
        destinationGroup,
        filenameField,
        toggle,
        more,
        el("div", { class: "jw-dt-panel-actions" }, [
            el("button", { type: "button", class: "jw-dt-btn", text: t.cancel, onclick: onCancel }),
            submit
        ])
    ]);

    return el("div", { class: "jw-dt-panel jw-dt-export" }, [
        el("h2", { class: "jw-dt-panel-head", text: t.exportTitle }),
        form
    ]);
}
