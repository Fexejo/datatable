// Pagination arithmetic — pages are 1-based.

import { clamp } from "./util.js";

export function pageCount(total, pageSize) {
    return Math.max(1, Math.ceil(total / pageSize));
}

// 1-based first and last row of `page`, e.g. "11–20 of 42".
export function pageRange(page, pageSize, total) {
    return {
        start: total === 0 ? 0 : (page - 1) * pageSize + 1,
        end: Math.min(page * pageSize, total),
        total
    };
}

// The rows of `page` (clamped to the existing pages).
export function paginate(rows, page, pageSize) {
    const current = clamp(page, 1, pageCount(rows.length, pageSize));
    const start = (current - 1) * pageSize;
    return { page: current, pageCount: pageCount(rows.length, pageSize), rows: rows.slice(start, start + pageSize) };
}

// Page buttons to show: all pages up to 7, else first, last and the
// neighbours of `current`, with "…" for the gaps.
export function pageItems(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const items = [1];
    if (current > 3) items.push("…");
    for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) items.push(p);
    if (current < total - 2) items.push("…");
    items.push(total);
    return items;
}
