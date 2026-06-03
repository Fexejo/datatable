// Inline SVG icons for jw-datatable (stroke style, currentColor).
// Used by the table UI and context menu — no external icon dependency.

const SVG_OPEN =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true" focusable="false">';

/** @type {Record<string, string>} */
const ICONS = {
    search:
        '<circle cx="11" cy="11" r="8"/>' +
        '<path d="m21 21-4.3-4.3"/>',

    x:
        '<path d="M18 6 6 18"/>' +
        '<path d="m6 6 12 12"/>',

    table:
        '<rect width="18" height="18" x="3" y="3" rx="2"/>' +
        '<path d="M3 9h18"/>' +
        '<path d="M3 15h18"/>' +
        '<path d="M12 3v18"/>',

    grid:
        '<rect width="7" height="7" x="3" y="3" rx="1"/>' +
        '<rect width="7" height="7" x="14" y="3" rx="1"/>' +
        '<rect width="7" height="7" x="14" y="14" rx="1"/>' +
        '<rect width="7" height="7" x="3" y="14" rx="1"/>',

    columns:
        '<rect width="18" height="18" x="3" y="3" rx="2"/>' +
        '<path d="M12 3v18"/>',

    save:
        '<path d="M15.2 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.8"/>' +
        '<path d="M17 3v5H9"/>' +
        '<path d="M7 13h10v6H7z"/>',

    download:
        '<path d="M12 15V3"/>' +
        '<path d="m7 10 5 5 5-5"/>' +
        '<path d="M3 21h18"/>',

    arrowUp:
        '<path d="m18 15-6-6-6 6"/>',

    arrowDown:
        '<path d="m6 9 6 6 6-6"/>',

    arrowUpDown:
        '<path d="m3 8 4-4 4 4"/>' +
        '<path d="M7 4v16"/>' +
        '<path d="m21 16-4 4-4-4"/>' +
        '<path d="M17 20V4"/>',

    filter:
        '<path d="M3 6h18"/>' +
        '<path d="M7 12h10"/>' +
        '<path d="M10 18h4"/>',

    copy:
        '<rect width="14" height="14" x="8" y="8" rx="2"/>' +
        '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',

    chevronsLeft:
        '<path d="m11 17-5-5 5-5"/>' +
        '<path d="m18 17-5-5 5-5"/>',

    chevronLeft:
        '<path d="m15 18-6-6 6-6"/>',

    chevronRight:
        '<path d="m9 18 6-6-6-6"/>',

    chevronsRight:
        '<path d="m6 17 5-5-5-5"/>' +
        '<path d="m13 17 5-5-5-5"/>',

    trash:
        '<path d="M3 6h18"/>' +
        '<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>' +
        '<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',

    calendarCheck:
        '<path d="M8 2v4"/>' +
        '<path d="M16 2v4"/>' +
        '<rect width="18" height="18" x="3" y="4" rx="2"/>' +
        '<path d="M3 10h18"/>' +
        '<path d="m9 16 2 2 4-4"/>'
};

/**
 * Returns inline SVG markup for a named icon.
 * @param {string} name Icon id (see ICONS keys).
 * @param {string} [title] Optional accessible title (omitted when decorative).
 * @returns {string} SVG HTML string, or empty string if unknown.
 */
export function iconSvg(name, title) {
    const body = ICONS[name];
    if (!body) return "";
    const label = title ? String(title).replace(/[<>&"]/g, "") : "";
    const titleTag = label ? `<title>${label}</title>` : "";
    return `${SVG_OPEN}${titleTag}${body}</svg>`;
}

export { ICONS };
