/**
 * Plain text / markdown connector. Isomorphic.
 *
 * - Plain text: paragraphs split on blank lines.
 * - Markdown: heading detection (# ... and setext underlines), fenced code
 *   blocks kept whole as code blocks, list items split out, blockquotes kept.
 */

import { DraftBlock, makeResult, ProvenanceInput } from "../core/result.js";
import { IngestResult } from "../core/types.js";

export interface TextIngestOptions {
  /** File or logical name; used for provenance and markdown detection. */
  name?: string;
  uri?: string;
  /** Force treating input as markdown (otherwise inferred from name). */
  markdown?: boolean;
  capturedAt?: string;
}

const MD_EXTENSIONS = /\.(md|markdown|mdown|mkd)$/i;

export function looksLikeMarkdownName(name?: string): boolean {
  return !!name && MD_EXTENSIONS.test(name);
}

function splitParagraphs(text: string): DraftBlock[] {
  return text
    .split(/\n[ \t]*\n+/)
    .map((p) => ({ text: p, kind: "paragraph" as const }));
}

function markdownToDrafts(text: string, warnings: string[]): { drafts: DraftBlock[]; title?: string } {
  const drafts: DraftBlock[] = [];
  let title: string | undefined;
  const lines = text.split("\n");
  let i = 0;
  let para: string[] = [];

  const flushPara = () => {
    const joined = para.join("\n");
    if (joined.trim()) drafts.push({ text: joined, kind: "paragraph" });
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    const fence = /^(```|~~~)(.*)$/.exec(line);
    if (fence) {
      flushPara();
      const marker = fence[1];
      const body: string[] = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        if (lines[i].startsWith(marker)) {
          closed = true;
          i++;
          break;
        }
        body.push(lines[i]);
        i++;
      }
      if (!closed) warnings.push("unclosed code fence; captured to end of input");
      drafts.push({ text: body.join("\n"), kind: "code" });
      continue;
    }

    // ATX heading
    const atx = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (atx) {
      flushPara();
      const level = atx[1].length;
      const headingText = atx[2];
      drafts.push({ text: headingText, kind: "heading", locator: `h${level}` });
      if (!title && level === 1) title = headingText.trim();
      i++;
      continue;
    }

    // setext heading (underline under a single text line)
    if (i + 1 < lines.length && line.trim() && para.length === 0) {
      const under = lines[i + 1];
      if (/^=+\s*$/.test(under) || /^-{2,}\s*$/.test(under)) {
        const level = under.trim().startsWith("=") ? 1 : 2;
        drafts.push({ text: line, kind: "heading", locator: `h${level}` });
        if (!title && level === 1) title = line.trim();
        i += 2;
        continue;
      }
    }

    // list item
    const li = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      drafts.push({ text: li[1], kind: "list-item" });
      i++;
      continue;
    }

    // blockquote
    if (/^\s*>/.test(line)) {
      flushPara();
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      drafts.push({ text: quote.join("\n"), kind: "quote" });
      continue;
    }

    // blank line = paragraph break
    if (!line.trim()) {
      flushPara();
      i++;
      continue;
    }

    para.push(line);
    i++;
  }
  flushPara();
  return { drafts, title };
}

/** Ingest a plain-text or markdown string (or its raw bytes). */
export async function ingestText(
  input: string | Uint8Array,
  opts: TextIngestOptions = {}
): Promise<IngestResult> {
  const text = typeof input === "string" ? input : new TextDecoder().decode(input);
  const isMarkdown = opts.markdown ?? looksLikeMarkdownName(opts.name);
  const warnings: string[] = [];

  let drafts: DraftBlock[];
  let title: string | undefined;
  if (isMarkdown) {
    const md = markdownToDrafts(text, warnings);
    drafts = md.drafts;
    title = md.title;
  } else {
    drafts = splitParagraphs(text);
  }

  const prov: ProvenanceInput = {
    sourceKind: isMarkdown ? "markdown" : "text",
    name: opts.name,
    uri: opts.uri,
    title,
    capturedAt: opts.capturedAt,
  };
  return makeResult(input, drafts, prov, warnings);
}
