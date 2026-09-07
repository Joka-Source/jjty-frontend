// jt — ingestion via jt-connectors. Every way material enters jt returns an
// IngestResult: blocks plus a non-optional provenance record (source kind,
// name, sha-256 content digest, byte size, capture time). Nothing enters as
// a stripped file.
//
// Text / markdown / paste use the vendored isomorphic connectors verbatim.
// PDF uses the selected browser engine (MuPDF with an explicit PDF.js fallback)
// and keeps the same block shape as jt-connectors' node PDF connector: one
// block per page with a "page:N" locator. The vendored makeResult keeps
// digests and provenance consistent.

import {
  ingestText as connectorText,
  ingestPaste,
  looksLikeMarkdownName,
  contentDigest,
  byteSize,
} from "jt-connectors";
import { makeResult } from "jt-connectors/src/core/result.ts";
import { createPdfJsMigrationAdapter } from "./pdf-engine.js";

export { ingestPaste, looksLikeMarkdownName, contentDigest, byteSize };

// The readable blocks are derived. Retain the exact input for export/recovery.
export async function ingestText(text, options = {}) {
  const readable = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const result = await connectorText(readable, options);
  const sourceBytes = options.rawBytes?.slice() ?? new TextEncoder().encode(text);
  return { ...result, sourceBytes, provenance: { ...result.provenance,
    contentDigest: await contentDigest(sourceBytes), byteSize: sourceBytes.byteLength,
  } };
}

const PDF_REFUSALS = Object.freeze({
  encrypted: {
    kind: "encrypted",
    message:
      "this PDF is encrypted. enter its password in another reader, then save an unlocked copy for jt.",
  },
  corrupt: {
    kind: "corrupt",
    message: "this PDF is corrupt or not a valid PDF. try the original file or download it again.",
  },
  imageOnly: {
    kind: "image-only",
    message:
      "this PDF has no text layer. its pages can still be viewed, but jt cannot anchor acts to the image.",
  },
  engineUnavailable: {
    kind: "engine-unavailable",
    message: "this PDF needs MuPDF, but MuPDF is not available on this device.",
  },
});

function pdfLoadRefusal(error) {
  const name = String(error?.name ?? "");
  const message = String(error?.message ?? "");
  return /password/i.test(name) || /password/i.test(message)
    ? PDF_REFUSALS.encrypted
    : PDF_REFUSALS.corrupt;
}

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
 * Ingest raw PDF bytes in the browser. The application passes an engine
 * adapter. Legacy callers may still pass the PDF.js module during migration;
 * it is normalized into the explicitly reported PDF.js adapter here.
 */
export async function ingestPdfBrowser(
  pdfEngineOrPdfJs,
  bytes,
  { name, capturedAt, requirePrimary = false } = {},
) {
  const warnings = [];
  const engine = typeof pdfEngineOrPdfJs?.open === "function"
    ? pdfEngineOrPdfJs
    : createPdfJsMigrationAdapter(pdfEngineOrPdfJs);
  if (requirePrimary && engine.report?.activeEngine !== "mupdf") {
    const result = await makeResult(
      bytes,
      [],
      { sourceKind: "pdf", name, capturedAt },
      warnings,
    );
    return {
      ...result,
      sourceBytes: bytes.slice(),
      pdfEngine: engine.report,
      refusal: PDF_REFUSALS.engineUnavailable,
    };
  }
  let loadingTask;
  let doc;
  try {
    const opened = await engine.open(bytes.slice());
    loadingTask = opened.loadingTask;
    doc = opened.document;
  } catch (error) {
    const result = await makeResult(
      bytes,
      [],
      { sourceKind: "pdf", name, capturedAt },
      warnings,
    );
    return {
      ...result,
      sourceBytes: bytes.slice(),
      pdfEngine: engine.report,
      refusal: pdfLoadRefusal(error),
    };
  }

  let title;
  try {
    const meta = await doc.getMetadata();
    const info = meta?.info;
    if (info && typeof info.Title === "string" && info.Title.trim()) title = info.Title.trim();
  } catch {
    warnings.push("could not read PDF metadata");
  }

  const drafts = [];
  let pagesInspected = 0;
  let pageReadFailures = 0;
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    try {
      const page = await doc.getPage(pageNum);
      try {
        const content = await page.getTextContent();
        pagesInspected++;
        const text = typeof content.nativeText === "string"
          ? content.nativeText
          : pageTextFromItems(content.items);
        drafts.push({ text, kind: "page", locator: `page:${pageNum}` });
        if (!text.trim()) warnings.push(`page ${pageNum} has no extractable text`);
      } finally {
        await page.cleanup?.();
      }
    } catch (err) {
      pageReadFailures++;
      warnings.push(`page ${pageNum} could not be read: ${err?.message ?? err}`);
    }
  }
  const pageCount = doc.numPages;
  await loadingTask?.destroy?.();

  const result = await makeResult(
    bytes,
    drafts,
    { sourceKind: "pdf", name, title, pageCount, capturedAt },
    warnings
  );
  if (result.blocks.length) {
    return { ...result, sourceBytes: bytes.slice(), pdfEngine: engine.report };
  }
  const refusal = pagesInspected === 0 && (pageReadFailures > 0 || pageCount === 0)
    ? PDF_REFUSALS.corrupt
    : PDF_REFUSALS.imageOnly;
  return { ...result, sourceBytes: bytes.slice(), pdfEngine: engine.report, refusal };
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
