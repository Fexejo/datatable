// XLSX writer — one worksheet as an Office Open XML workbook, packed in an
// uncompressed ZIP. No dependencies, no DOM; runs in the browser and in Node.

import { toDate, typeGroup } from "../core/util.js";

// ---- ZIP (stored, no compression) -------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

export function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// `files`: [{ name, data: string | Uint8Array }] → ZIP archive bytes.
export function zip(files, date = new Date()) {
    const encoder = new TextEncoder();
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    const day = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const locals = [];
    const centrals = [];
    let offset = 0;

    for (const file of files) {
        const name = encoder.encode(file.name);
        const data = typeof file.data === "string" ? encoder.encode(file.data) : file.data;
        const crc = crc32(data);
        // Fields shared by the local header and the central directory entry:
        // version, flags (UTF-8 names), method (stored), time, date, crc, sizes, name length.
        const common = (view, at) => {
            view.setUint16(at, 20, true);
            view.setUint16(at + 2, 0x0800, true);
            view.setUint16(at + 4, 0, true);
            view.setUint16(at + 6, time, true);
            view.setUint16(at + 8, day, true);
            view.setUint32(at + 10, crc, true);
            view.setUint32(at + 14, data.length, true);
            view.setUint32(at + 18, data.length, true);
            view.setUint16(at + 22, name.length, true);
        };

        const local = new Uint8Array(30 + name.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034B50, true);
        common(lv, 4);
        local.set(name, 30);

        const central = new Uint8Array(46 + name.length);
        const cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014B50, true);
        cv.setUint16(4, 20, true);              // version made by
        common(cv, 6);
        cv.setUint32(42, offset, true);         // offset of the local header
        central.set(name, 46);

        locals.push(local, data);
        centrals.push(central);
        offset += local.length + data.length;
    }

    const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054B50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    const parts = [...locals, ...centrals, end];
    const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
    let at = 0;
    for (const part of parts) { out.set(part, at); at += part.length; }
    return out;
}

// ---- Cells ------------------------------------------------------------------

// Style ids (index into cellXfs in styles.xml).
const STYLE = { header: 1, date: 2, datetime: 3, time: 4, currency: 5, percent: 6, integer: 7 };
const MAX_TEXT = 32767;   // Excel's limit per cell

function escapeXml(text) {
    return String(text)
        // eslint-disable-next-line no-control-regex -- strips characters XML 1.0 forbids
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// A1-style column name: 0 → A, 25 → Z, 26 → AA.
export function columnLetter(index) {
    let name = "";
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    return name;
}

// Excel serial date (days since 1899-12-30) from local date parts; Excel
// has no time zones. Date-only strings ("2024-01-05") are taken as local days.
export function dateSerial(value) {
    let date;
    const dateOnly = typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) date = new Date(+dateOnly[1], +dateOnly[2] - 1, +dateOnly[3]);
    else date = toDate(value);
    if (!date) return null;
    const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(),
        date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
    return (utc - Date.UTC(1899, 11, 30)) / 86400000;
}

function timeSerial(value) {
    const match = typeof value === "string" && /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
    if (!match) return null;
    return (+match[1] * 3600 + +match[2] * 60 + +(match[3] || 0)) / 86400;
}

const textCell = (ref, text, style) => {
    const value = String(text).slice(0, MAX_TEXT);
    return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
};
const numberCell = (ref, number, style) => `<c r="${ref}"${style ? ` s="${style}"` : ""}><v>${number}</v></c>`;

// Typed cell from an export value: numbers, booleans and dates keep their
// type (by value, or by column type for strings); everything else is text.
// `text: true` writes every value as text (formatted export).
function cell(ref, value, column, text) {
    if (value == null || value === "") return "";
    if (text) return textCell(ref, value);
    if (typeof value === "boolean") return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
    const type = column.type || "string";
    const group = typeGroup(type);
    if (value instanceof Date || group === "date") {
        const serial = type === "time" ? (timeSerial(value) ?? dateSerial(value)) : dateSerial(value);
        if (serial != null) return numberCell(ref, serial, STYLE[type] ?? STYLE.datetime);
    }
    const number = typeof value === "number" ? value
        : group === "number" && typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    if (Number.isFinite(number)) {
        if (type === "currency") return numberCell(ref, number, STYLE.currency);
        if (type === "percent") return numberCell(ref, column.format?.asNumber ? number / 100 : number, STYLE.percent);
        if (type === "integer") return numberCell(ref, number, STYLE.integer);
        return numberCell(ref, number);
    }
    return textCell(ref, typeof value === "object" ? JSON.stringify(value) : value);
}

// Display width in characters, for the column widths.
function cellWidth(value, column, text) {
    if (value == null) return 0;
    if (!text && typeGroup(column.type) === "date") return column.type === "datetime" ? 17 : column.type === "time" ? 8 : 11;
    return String(typeof value === "object" ? JSON.stringify(value) : value).length;
}

// ---- Workbook ---------------------------------------------------------------

// Sheet names: max. 31 characters, none of []:*?/\ and no leading/trailing quote.
export function sheetName(name) {
    const clean = String(name ?? "").replace(/[[\]:*?/\\]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31).trim();
    return clean || "Sheet1";
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006";

const STYLES = `${XML}<styleSheet xmlns="${NS}">`
    + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
    + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="8">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + [14, 22, 20, 4, 10, 3].map((id) => `<xf numFmtId="${id}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join("")
    + "</cellXfs>"
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + "</styleSheet>";

/**
 * Builds an .xlsx file.
 * @param {{ sheet?: string, header?: string[]|null, columns: object[], rows: any[][], text?: boolean }} table
 *   `columns`: column definitions (`type`, `format`) for typing the cells;
 *   `rows`: values per row in column order; `text`: write every value as text.
 * @returns {Uint8Array}
 */
export function buildXLSX({ sheet, header = null, columns, rows, text = false }, date = new Date()) {
    const lines = [];
    const widths = columns.map((c, i) => (header ? header[i].length : 0));
    let r = 0;
    if (header) {
        r++;
        lines.push(`<row r="${r}">${header.map((name, i) => textCell(columnLetter(i) + r, name, STYLE.header)).join("")}</row>`);
    }
    for (const values of rows) {
        r++;
        lines.push(`<row r="${r}">${values.map((value, i) => {
            widths[i] = Math.max(widths[i], cellWidth(value, columns[i], text));
            return cell(columnLetter(i) + r, value, columns[i], text);
        }).join("")}</row>`);
    }

    const cols = columns.length
        ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(8, w + 2))}" customWidth="1"/>`).join("")}</cols>`
        : "";
    // Frozen header row.
    const views = header
        ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        : "";
    const worksheet = `${XML}<worksheet xmlns="${NS}">${views}${cols}<sheetData>${lines.join("")}</sheetData></worksheet>`;

    return zip([
        { name: "[Content_Types].xml", data: `${XML}<Types xmlns="${PKG}/content-types">`
            + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            + '<Default Extension="xml" ContentType="application/xml"/>'
            + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            + "</Types>" },
        { name: "_rels/.rels", data: `${XML}<Relationships xmlns="${PKG}/relationships">`
            + `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
        { name: "xl/workbook.xml", data: `${XML}<workbook xmlns="${NS}" xmlns:r="${REL}">`
            + `<sheets><sheet name="${escapeXml(sheetName(sheet))}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
        { name: "xl/_rels/workbook.xml.rels", data: `${XML}<Relationships xmlns="${PKG}/relationships">`
            + `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>`
            + `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>` },
        { name: "xl/worksheets/sheet1.xml", data: worksheet },
        { name: "xl/styles.xml", data: STYLES }
    ], date);
}
