import { tokenizeWithSpans } from "./match.js";

const CONTEXT_CHARS = 40;

function quoteAt(text, tokenStart, tokenEnd) {
  const tokens = tokenizeWithSpans(text);
  const first = tokens[tokenStart];
  const last = tokens[tokenEnd];
  if (!first || !last || tokenEnd < tokenStart) return null;
  return {
    tokenStart,
    tokenEnd,
    quotedText: text.slice(first.start, last.end),
    charStart: first.start,
    charEnd: last.end,
  };
}

export function createAnchor({ blockTexts, blockIndex, tokenStart, tokenEnd, docDigest, geometry }) {
  const text = String(blockTexts[blockIndex] ?? "");
  const quote = quoteAt(text, tokenStart, tokenEnd);
  if (!quote) return null;
  return {
    blockIndex,
    tokenStart,
    tokenEnd,
    quotedText: quote.quotedText,
    prefix: text.slice(Math.max(0, quote.charStart - CONTEXT_CHARS), quote.charStart),
    suffix: text.slice(quote.charEnd, quote.charEnd + CONTEXT_CHARS),
    docDigest: String(docDigest ?? ""),
    ...(geometry ? { geometry: { ...geometry } } : {}),
  };
}

function commonPrefix(a, b) {
  const limit = Math.min(a.length, b.length);
  let count = 0;
  while (count < limit && a[count] === b[count]) count++;
  return count;
}

function commonSuffix(a, b) {
  const limit = Math.min(a.length, b.length);
  let count = 0;
  while (count < limit && a[a.length - 1 - count] === b[b.length - 1 - count]) count++;
  return count;
}

function occurrenceSpan(text, charStart, quotedText) {
  const charEnd = charStart + quotedText.length;
  const tokens = tokenizeWithSpans(text);
  const tokenStart = tokens.findIndex((token) => token.start === charStart);
  let tokenEnd = -1;
  for (let i = tokenStart; i >= 0 && i < tokens.length; i++) {
    if (tokens[i].end === charEnd) {
      tokenEnd = i;
      break;
    }
    if (tokens[i].end > charEnd) break;
  }
  if (tokenStart < 0 || tokenEnd < tokenStart) return null;
  return { tokenStart, tokenEnd };
}

export function resolveAnchor(anchor, { blockTexts }) {
  if (!anchor?.quotedText) return { arrival: "lost" };
  const storedText = String(blockTexts[anchor.blockIndex] ?? "");
  const storedQuote = quoteAt(storedText, anchor.tokenStart, anchor.tokenEnd);
  if (storedQuote?.quotedText === anchor.quotedText) {
    return {
      arrival: "exact",
      blockIndex: anchor.blockIndex,
      tokenStart: anchor.tokenStart,
      tokenEnd: anchor.tokenEnd,
      quotedText: anchor.quotedText,
    };
  }

  const occurrences = [];
  for (const [blockIndex, rawText] of blockTexts.entries()) {
    const text = String(rawText ?? "");
    let from = 0;
    while (from <= text.length - anchor.quotedText.length) {
      const charStart = text.indexOf(anchor.quotedText, from);
      if (charStart < 0) break;
      const span = occurrenceSpan(text, charStart, anchor.quotedText);
      if (span) {
        const charEnd = charStart + anchor.quotedText.length;
        const prefix = text.slice(Math.max(0, charStart - CONTEXT_CHARS), charStart);
        const suffix = text.slice(charEnd, charEnd + CONTEXT_CHARS);
        occurrences.push({
          blockIndex,
          ...span,
          quotedText: anchor.quotedText,
          contextScore:
            commonSuffix(prefix, String(anchor.prefix ?? "")) +
            commonPrefix(suffix, String(anchor.suffix ?? "")),
        });
      }
      from = charStart + Math.max(1, anchor.quotedText.length);
    }
  }
  occurrences.sort((a, b) => b.contextScore - a.contextScore || a.blockIndex - b.blockIndex);
  if (
    occurrences.length === 1 ||
    (occurrences.length > 1 && occurrences[0].contextScore > occurrences[1].contextScore)
  ) {
    const { contextScore: _score, ...found } = occurrences[0];
    return { arrival: "refound", ...found };
  }
  return { arrival: "lost" };
}

export function migrateLegacyEntry(entry, { blockTexts, docDigest }) {
  if (entry.anchor) return { ...entry };
  const text = String(blockTexts[entry.blockIndex] ?? "");
  const tokens = tokenizeWithSpans(text);
  if (!text || tokens.length === 0) {
    return { ...entry, migration: "legacy", arrival: "lost" };
  }
  return {
    ...entry,
    migration: "legacy",
    arrival: "approximate",
    anchor: {
      blockIndex: entry.blockIndex,
      tokenStart: 0,
      tokenEnd: tokens.length - 1,
      quotedText: text,
      prefix: "",
      suffix: "",
      docDigest: String(docDigest ?? ""),
    },
    resolvedAnchor: {
      blockIndex: entry.blockIndex,
      tokenStart: 0,
      tokenEnd: tokens.length - 1,
      quotedText: text,
    },
  };
}
