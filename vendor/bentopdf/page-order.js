// SPDX-License-Identifier: AGPL-3.0-only
// Adapted from BentoPDF; see source-manifest.json and NOTICE.
// One-based input, zero-based output. This model never edits PDF bytes.

export const MAX_PAGE_COUNT = 10000;
export const MAX_ORDER_INPUT_LENGTH = 100000;

function validateTotal(totalPages) {
  if (!Number.isSafeInteger(totalPages) || totalPages < 1 || totalPages > MAX_PAGE_COUNT) {
    throw new RangeError(`Page count must be an integer from 1 to ${MAX_PAGE_COUNT}.`);
  }
}

// Upstream allPagesIndices, with bounded input validation added.
export function allPagesIndices(totalPages) {
  validateTotal(totalPages);
  return Array.from({ length: totalPages }, (_, i) => i);
}

/**
 * Adapted from parseRangeGroups and applyCustomOrder. Unlike upstream's
 * permissive split helper, every group must be valid; this operation requires
 * every supplied page once; order mode also requires every page. Work and
 * allocation are bounded by the page count
 * and input-length caps before any range is expanded.
 */
export function parsePageOrder(input, totalPages) {
  return parsePages(input, totalPages, true);
}

/** A nonempty subset in requested order; never sorts or silently deduplicates. */
export function parsePageSelection(input, totalPages) {
  return parsePages(input, totalPages, false);
}

function parsePages(input, totalPages, complete) {
  validateTotal(totalPages);
  if (typeof input !== 'string') throw new TypeError('Page selection must be text.');
  if (input.length > MAX_ORDER_INPUT_LENGTH || !input.trim()) {
    throw new RangeError(complete ? 'Enter a complete page order within the input limit.' : 'Select at least one page within the input limit.');
  }
  const indices = [];
  const seen = new Set();
  for (const range of input.split(',')) {
    const trimmedRange = range.trim();
    const parsed = /^([1-9][0-9]*)(?:\s*-\s*([1-9][0-9]*))?$/.exec(trimmedRange);
    if (!parsed) throw new RangeError('Use page numbers or ascending ranges separated by commas.');
    const start = Number(parsed[1]);
    const end = parsed[2] === undefined ? start : Number(parsed[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
        start < 1 || end > totalPages || start > end) {
      throw new RangeError('Page numbers must be within this document, with ranges in ascending order.');
    }
    if (indices.length + end - start + 1 > totalPages) {
      throw new RangeError('A page cannot appear more than once.');
    }
    for (let i = start; i <= end; i++) {
      const index = i - 1;
      if (seen.has(index)) throw new RangeError('A page appears more than once.');
      seen.add(index);
      indices.push(index);
    }
  }
  if (complete && indices.length !== totalPages) throw new RangeError('Include every page exactly once.');
  return indices;
}
