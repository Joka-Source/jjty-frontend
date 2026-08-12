// Spoken mathematics: pure control, translation, and local document helpers.
// The translator is the vendored rule engine; no dataset or network service is
// involved.

import { normalize } from "../vendor/jt-speech/fuzzy.js";
import { spokenMathToLatex } from "../vendor/jt-speech/math/spokenMathToLatex.js";
import { contentDigest, byteSize } from "./ingest.js";
import { rid, nowIso } from "./records.js";

const ENTER_PHRASES = new Set(["math mode", "start math mode", "enter math mode"]);
const EXIT_PHRASES = new Set(["exit math mode", "stop math mode", "leave math mode"]);

/** Return a math-mode control represented by this final segment, or null. */
export function mathControl(text, active) {
  const phrase = normalize(String(text ?? ""));
  if (!active && ENTER_PHRASES.has(phrase)) return "enter";
  if (active && EXIT_PHRASES.has(phrase)) return "exit";
  if (active && phrase === "keep that") return "keep";
  return null;
}

/** Preserve the recognizer words alongside the vendored rule-engine result. */
export function translateSpokenMath(text) {
  const speech = String(text ?? "").trim();
  const result = spokenMathToLatex(speech);
  return {
    speech,
    latex: result.latex,
    unparsed: [...result.unparsed],
  };
}

function expressionBlock(expression) {
  return {
    text: expression.speech,
    kind: "spoken-math",
    mathLatex: expression.latex,
    mathUnparsed: [...expression.unparsed],
  };
}

/**
 * Create or append to the one local spoken-mathematics document. Content
 * provenance is recomputed after each append while the original capture time
 * remains stable.
 */
export async function makeSpokenMathDocument(existing, expression, { id, at = nowIso() } = {}) {
  const blocks = [...(existing?.blocks ?? []), expressionBlock(expression)];
  const text = blocks.map((block) => block.text).join("\n\n");
  const capturedAt = existing?.provenance?.capturedAt ?? at;
  return {
    id: existing?.id ?? id ?? rid("doc"),
    title: "spoken mathematics",
    text,
    blocks,
    provenance: {
      ...(existing?.provenance ?? {}),
      sourceKind: "spoken",
      createdBy: "voice",
      contentDigest: await contentDigest(text),
      byteSize: byteSize(text),
      capturedAt,
      ...(existing ? { updatedAt: at } : {}),
    },
    warnings: [],
    createdAt: existing?.createdAt ?? at,
    revision: existing ? existing.revision + 1 : 1,
  };
}

