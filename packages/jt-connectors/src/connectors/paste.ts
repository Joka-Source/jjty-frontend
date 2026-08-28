/**
 * Clipboard / paste connector. Isomorphic.
 *
 * Takes what a paste event carries: text/html and/or text/plain. HTML is
 * cleaned into structured blocks (tags stripped, block structure kept);
 * plain text passes through as paragraphs.
 */

import { htmlToBlocks } from "../core/html.js";
import { makeResult } from "../core/result.js";
import { IngestResult } from "../core/types.js";

export interface PastePayload {
  /** Contents of the clipboard's text/html flavor, if present. */
  html?: string;
  /** Contents of the clipboard's text/plain flavor, if present. */
  text?: string;
}

export interface PasteIngestOptions {
  capturedAt?: string;
}

/** Ingest a paste payload. Prefers the HTML flavor when both are present. */
export async function ingestPaste(
  payload: PastePayload,
  opts: PasteIngestOptions = {}
): Promise<IngestResult> {
  if (payload.html === undefined && payload.text === undefined) {
    throw new Error("paste payload has neither html nor text");
  }

  const warnings: string[] = [];

  if (payload.html !== undefined && payload.html.trim() !== "") {
    const { drafts, title } = htmlToBlocks(payload.html);
    if (drafts.length === 0 && payload.text) {
      // HTML flavor was markup-only; fall back to the plain flavor
      warnings.push("html paste flavor had no text; used text/plain flavor");
      return makeResult(
        payload.text,
        payload.text.split(/\n[ \t]*\n+/).map((p) => ({ text: p, kind: "paragraph" as const })),
        { sourceKind: "paste", capturedAt: opts.capturedAt },
        warnings
      );
    }
    return makeResult(
      payload.html,
      drafts,
      { sourceKind: "paste", title, capturedAt: opts.capturedAt },
      warnings
    );
  }

  const text = payload.text ?? "";
  if (payload.html !== undefined && payload.html.trim() === "") {
    warnings.push("html paste flavor was empty; used text/plain flavor");
  }
  return makeResult(
    text,
    text.split(/\n[ \t]*\n+/).map((p) => ({ text: p, kind: "paragraph" as const })),
    { sourceKind: "paste", capturedAt: opts.capturedAt },
    warnings
  );
}
