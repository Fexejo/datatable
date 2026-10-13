// Pagination arithmetic — pages are 1-based.

import { clamp } from "./util.js";

/**
 * @param {number} total
 * @param {number} pageSize
 */
export function pageCount(total, pageSize) {
    return Math.max(1, Math.ceil(total / pageSize));
}

// 1-based first and last row of `page`, e.g. "11–20 of 42".
/**
 * @param {number} page
 * @param {number} pageSize
 * @param {number} total
 */
export function pageRange(page, pageSize, total) {
    return {
        start: total === 0 ? 0 : (page - 1) * pageSize + 1,
        end: Math.min(page * pageSize, total),
        total
    };
}

// The rows of `page` (clamped to the existing pages).
/**
 * @template T
 * @param {T[]} rows
 * @param {number} page
 * @param {number} pageSize
 */
export function paginate(rows, page, pageSize) {
    const current = clamp(page, 1, pageCount(rows.length, pageSize));
    const start = (current - 1) * pageSize;
    return { page: current, pageCount: pageCount(rows.length, pageSize), rows: rows.slice(start, start + pageSize) };
}

// Page buttons to show: all pages up to 7, else first, last and the
// neighbours of `current`, with "…" for the gaps.
/**
 * @param {number} current
 * @param {number} total
 * @returns {(number|"…")[]}
 */
export function pageItems(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    /** @type {(number|"…")[]} */
    const items = [1];
    if (current > 3) items.push("…");
    for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) items.push(p);
    if (current < total - 2) items.push("…");
    items.push(total);
    return items;
}

// Rendering cost grows with the number of cells (rows × rendered columns); up
// to this many the table stays responsive (sort, filter, search, focus).
export const MAX_PAGE_CELLS = 5000;

export const DEFAULT_PAGE_SIZES = [10, 25, 50, 100, 250, 500, 1000];

// The page sizes to offer for `columnCount` rendered columns: those whose
// pages stay within `maxCells`, at least the smallest one, plus `current`
// (a page size in use is kept, never reduced automatically).
/**
 * @param {number[]} options
 * @param {number} columnCount
 * @param {number} [current]
 */
export function pageSizeChoices(options, columnCount, current, maxCells = MAX_PAGE_CELLS) {
    const sizes = [...new Set(options)].sort((a, b) => a - b);
    const fitting = sizes.filter((size) => size * columnCount <= maxCells);
    const choices = fitting.length ? fitting : sizes.slice(0, 1);
    if (current && !choices.includes(current)) choices.push(current);
    return choices.sort((a, b) => a - b);
}

// True when all `rowCount` rows on one page would exceed `maxCells`.
/**
 * @param {number} rowCount
 * @param {number} columnCount
 */
export function exceedsCellLimit(rowCount, columnCount, maxCells = MAX_PAGE_CELLS) {
    return rowCount * columnCount > maxCells;
}
