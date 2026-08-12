/**
 * .docx connector. Node-only (mammoth). Converts to HTML, then reuses the
 * shared HTML cleaner so structure (headings, lists, quotes) survives.
 */

import mammoth from "mammoth";
import { htmlToBlocks } from "../core/html.js";
import { makeResult } from "../core/result.js";
import { IngestResult } from "../core/types.js";

export interface DocxIngestOptions {
  name?: string;
  uri?: string;
  capturedAt?: string;
}

/** Ingest raw .docx bytes. Throws on inputs that are not a readable docx. */
export async function ingestDocx(
  bytes: Uint8Array,
  opts: DocxIngestOptions = {}
): Promise<IngestResult> {
  const warnings: string[] = [];
  const converted = await mammoth.convertToHtml({
    buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  });
  for (const msg of converted.messages) {
    warnings.push(`${msg.type}: ${msg.message}`);
  }

  const { drafts, title } = htmlToBlocks(converted.value);
  // First h1 heading doubles as title when the document metadata has none.
  const firstHeading = drafts.find((d) => d.kind === "heading")?.text.trim();

  return makeResult(
    bytes,
    drafts,
    {
      sourceKind: "docx",
      name: opts.name,
      uri: opts.uri,
      title: title ?? firstHeading,
      capturedAt: opts.capturedAt,
    },
    warnings
  );
}
