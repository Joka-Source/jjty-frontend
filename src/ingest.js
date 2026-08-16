// jt — ingestion via jt-connectors. Every way material enters jt returns an
// IngestResult: blocks plus a non-optional provenance record (source kind,
// name, sha-256 content digest, byte size, capture time). Nothing enters as
// a stripped file.
//
// Text / markdown / paste use the vendored isomorphic connectors verbatim.
// PDF uses pdfjs-dist in the browser (same block shape as jt-connectors'
// node PDF connector: one block per page, "page:N" locator), assembled with
// the vendored makeResult so digests and provenance stay consistent.

import {
  ingestText,
  ingestPaste,
  looksLikeMarkdownName,
  contentDigest,
  byteSize,
} from "jt-connectors";
import { makeResult } from "jt-connectors/src/core/result.ts";

export { ingestText, ingestPaste, looksLikeMarkdownName, contentDigest, byteSize };

/**
 * Pure: turn one pdfjs text-content item list into a page's text.
 * Mirrors jt-connectors src/node/pdf.ts so browser and node output match.
 */
export function pageTextFromItems(items) {
  const parts = [];
  for (const item of items) {
    if ("str" in item) {
      parts.push(item.str);
      if (item.hasEOL) parts.push("\n");
    }
  }
  return parts
    .join(" ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/[ \t]{2,}/g, " ");
}

/**
 * Ingest raw PDF bytes in the browser. `pdfjs` is injected (the app passes
 * the real pdfjs-dist module; tests can pass a stub) so this module stays
 * importable under node.
 */
export async function ingestPdfBrowser(pdfjs, bytes, { name, capturedAt } = {}) {
  const warnings = [];
  const loadingTask = pdfjs.getDocument({ data: bytes.slice() });
  const doc = await loadingTask.promise;

  let title;
  try {
    const meta = await doc.getMetadata();
    const info = meta?.info;
    if (info && typeof info.Title === "string" && info.Title.trim()) title = info.Title.trim();
  } catch {
    warnings.push("could not read PDF metadata");
  }

  const drafts = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    try {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const text = pageTextFromItems(content.items);
      drafts.push({ text, kind: "page", locator: `page:${pageNum}` });
      if (!text.trim()) warnings.push(`page ${pageNum} has no extractable text`);
    } catch (err) {
      warnings.push(`page ${pageNum} could not be read: ${err?.message ?? err}`);
    }
  }
  const pageCount = doc.numPages;
  await loadingTask.destroy();

  return makeResult(
    bytes,
    drafts,
    { sourceKind: "pdf", name, title, pageCount, capturedAt },
    warnings
  );
}

/** Short human form of a digest for the library panel. */
export function shortDigest(digest) {
  return String(digest ?? "").replace(/^sha256:/, "").slice(0, 10);
}

/** Human byte size. */
export function fmtBytes(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
