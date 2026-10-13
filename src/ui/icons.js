// Lucide icons (https://lucide.dev, ISC license) for jw-datatable.
// Keys are the exact canonical Lucide names; values are the inner markup of
// the Lucide SVG (one line each). No custom drawings, no aliases.

const SVG_NS = "http://www.w3.org/2000/svg";

/** @type {Record<string, string>} */
const ICONS = {
    "search": '<path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" />',
    "x": '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
    "table": '<path d="M12 3v18" /><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" />',
    "rows-3": '<rect width="18" height="18" x="3" y="3" rx="2" /><path d="M21 9H3" /><path d="M21 15H3" />',
    "layout-grid": '<rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />',
    "columns-3": '<rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="M15 3v18" />',
    "eye-off": '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" />',
    "bookmark": '<path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z" />',
    "pencil": '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /><path d="m15 5 4 4" />',
    "download": '<path d="M12 15V3" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" />',
    "arrow-up": '<path d="m5 12 7-7 7 7" /><path d="M12 19V5" />',
    "arrow-down": '<path d="M12 5v14" /><path d="m19 12-7 7-7-7" />',
    "arrow-left": '<path d="m12 19-7-7 7-7" /><path d="M19 12H5" />',
    "arrow-right": '<path d="M5 12h14" /><path d="m12 5 7 7-7 7" />',
    "arrow-left-to-line": '<path d="M3 19V5" /><path d="m13 6-6 6 6 6" /><path d="M7 12h14" />',
    "arrow-right-to-line": '<path d="M17 12H3" /><path d="m11 18 6-6-6-6" /><path d="M21 5v14" />',
    "arrow-up-down": '<path d="m21 16-4 4-4-4" /><path d="M17 20V4" /><path d="m3 8 4-4 4 4" /><path d="M7 4v16" />',
    "list-filter": '<path d="M2 5h20" /><path d="M6 12h12" /><path d="M9 19h6" />',
    "copy": '<rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />',
    "chevrons-left": '<path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" />',
    "chevron-left": '<path d="m15 18-6-6 6-6" />',
    "chevron-right": '<path d="m9 18 6-6-6-6" />',
    "chevrons-right": '<path d="m6 17 5-5-5-5" /><path d="m13 17 5-5-5-5" />',
    "trash": '<path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />',
    "check": '<path d="M20 6 9 17l-5-5" />',
    "pin": '<path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />',
    "maximize-2": '<path d="M15 3h6v6" /><path d="m21 3-7 7" /><path d="m3 21 7-7" /><path d="M9 21H3v-6" />',
    "pin-off": '<path d="M12 17v5" /><path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89" /><path d="m2 2 20 20" /><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11" />'
};

/**
 * Creates a Lucide icon as an SVG element (stroke style, `currentColor`).
 * Decorative by default (hidden from assistive tech) — the surrounding control
 * carries the accessible name. Pass `label` only for a standalone, meaningful icon.
 *
 * @param {string} name Lucide icon name (key of ICONS).
 * @param {{ label?: string }} [options]
 * @returns {SVGSVGElement}
 */
export function createIcon(name, { label } = {}) {
    const svg = /** @type {SVGSVGElement} */ (iconTemplate(name).cloneNode(true));
    if (label) {
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", label);
    } else {
        svg.setAttribute("aria-hidden", "true");
    }
    return svg;
}

// Parsed once per name and cloned afterwards: a large table shows an icon in
// every copyable cell, and cloning is much cheaper than parsing the markup.
/** @type {Map<string, SVGSVGElement>} */
const templates = new Map();

/** @param {string} name */
function iconTemplate(name) {
    let svg = templates.get(name);
    if (svg) return svg;
    svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("focusable", "false");
    const body = ICONS[name];
    if (body == null) {
        console.warn(`jw-datatable: unknown icon "${name}"`);
        return svg;
    }
    svg.innerHTML = body;
    templates.set(name, svg);
    return svg;
}

export { ICONS };
