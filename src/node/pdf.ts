/**
 * PDF connector. Node-only (uses the pdfjs-dist legacy build, which runs
 * without a browser). One block per page, page number in the block locator
 * and page count in provenance.
 */

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { DraftBlock, makeResult } from "../core/result.js";
import { IngestResult } from "../core/types.js";

export interface PdfIngestOptions {
  name?: string;
  uri?: string;
  capturedAt?: string;
}

/** Ingest raw PDF bytes. Throws on inputs that are not a readable PDF. */
export async function ingestPdf(
  bytes: Uint8Array,
  opts: PdfIngestOptions = {}
): Promise<IngestResult> {
  const warnings: string[] = [];

  // pdfjs transfers the buffer to its worker; hand it a copy so the caller's
  // bytes stay intact for hashing.
  const loadingTask = getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;

  let title: string | undefined;
  try {
    const meta = await doc.getMetadata();
    const info = meta.info as Record<string, unknown> | undefined;
    if (info && typeof info.Title === "string" && info.Title.trim()) {
      title = info.Title.trim();
    }
  } catch {
    warnings.push("could not read PDF metadata");
  }

  const drafts: DraftBlock[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    try {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const parts: string[] = [];
      for (const item of content.items) {
        if ("str" in item) {
          parts.push(item.str);
          if (item.hasEOL) parts.push("\n");
        }
      }
      const text = parts
        .join(" ")
        .replace(/[ \t]*\n[ \t]*/g, "\n")
        .replace(/[ \t]{2,}/g, " ");
      drafts.push({ text, kind: "page", locator: `page:${pageNum}` });
      if (!text.trim()) {
        warnings.push(`page ${pageNum} has no extractable text`);
      }
    } catch (err) {
      warnings.push(
        `page ${pageNum} could not be read: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  const pageCount = doc.numPages;
  await loadingTask.destroy();

  return makeResult(
    bytes,
    drafts,
    {
      sourceKind: "pdf",
      name: opts.name,
      uri: opts.uri,
      title,
      pageCount,
      capturedAt: opts.capturedAt,
    },
    warnings
  );
}
