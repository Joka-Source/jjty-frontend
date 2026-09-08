// jt — record factories. Pure functions, no DOM, no storage: importable from
// both the browser app and node tests. The objects returned by makeCursor and
// makeReceipt conform to contracts/cursor.schema.json and
// contracts/receipt.schema.json (additionalProperties: false — nothing extra
// may ride along on these).

import { verbRegistry } from "./registry/index.js";

export const SCHEMA_VERSION = "0.1.0";

export function nowIso() {
  return new Date().toISOString();
}

let seq = 0;
export function rid(prefix) {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

export function anchorIdFor(docId, blockIndex, anchor = null) {
  if (anchor) {
    const digest = String(anchor.docDigest ?? "").replace(/^sha256:/, "").slice(0, 12) || "no-digest";
    return `anc-${docId}-${digest}-b${blockIndex}-t${anchor.tokenStart}-${anchor.tokenEnd}`;
  }
  return `anc-${docId}-b${blockIndex}`;
}

export function returnRouteFor(docId, revision, blockIndex) {
  return `open://${docId}/r${revision}#b${blockIndex}`;
}

/**
 * A cursor record: the person's act at an exact position, with evidence.
 * @returns object conforming to cursor.schema.json
 */
export function makeCursor({
  docId,
  revision,
  blockIndex,
  modality, // "voice" | "pointer"
  evidence, // what was captured (words heard / control clicked)
  intention, // plain-words statement of what the system believes is wanted
  alternatives = [],
  anchor = null,
  historyEvents = [],
  at = nowIso(),
}) {
  const cursor = {
    schemaVersion: SCHEMA_VERSION,
    id: rid("cur"),
    anchorId: anchorIdFor(docId, blockIndex, anchor),
    sourceId: docId,
    originModality: modality,
    capturedEvidence: evidence,
    proposedIntention: intention,
    state: "durable-result",
    authorityRequired: "the person at this device",
    destination: `${docId} at block ${blockIndex}`,
    persistenceState: "saved locally (IndexedDB)",
    receiptState: "received",
    history: [
      { at, event: `${modality} input captured` },
      { at, event: "intention resolved and applied" },
      ...historyEvents.map((event) => ({ at, event })),
    ],
    undoAvailable: true,
    repairRoute: "undo from the history panel, returning to the same block",
    returnRoute: returnRouteFor(docId, revision, blockIndex),
  };
  if (alternatives.length) cursor.alternatives = alternatives;
  return cursor;
}

/**
 * A receipt record: durable proof of what actually happened.
 * @returns object conforming to receipt.schema.json
 */
export function makeReceipt({
  docId,
  revision,
  blockIndex,
  actionId,
  result,
  arrival,
  undoRoute = "undo from the history panel",
  at = nowIso(),
}) {
  if (!new Set(["exact", "refound", "approximate", "lost"]).has(arrival)) {
    throw new TypeError("arrival must describe the actual resolution path");
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    id: rid("rcp"),
    sourceId: docId,
    sourceRevision: `r${revision}`,
    actionId,
    executor: "jt-web",
    host: "jt-web (browser)",
    result,
    occurredAt: at,
    authority: "the person at this device",
    arrival,
    undoRoute,
    repairRoute: "undo, then redo the act with corrected words",
    returnRoute: returnRouteFor(docId, revision, blockIndex),
  };
}

/**
 * Build the full app-level history entry for an act: wrapper + schema-pure
 * cursor and receipt. `undoes` is the id of the entry being reversed, for
 * kind "undo".
 */
export function makeActEntry({
  docId,
  revision,
  blockIndex,
  blockEnd = null, // inclusive range end, for two-anchor highlights
  act, // "highlight" | "important" | "note" | "undo"
  verbId = null,
  modality,
  evidence,
  confidence = null,
  matchedText = "",
  noteText = "",
  mathSpeech = "",
  mathLatex = "",
  mathUnparsed = [],
  anchor = null,
  rangeAnchor = null,
  resolvedSegments = null,
  arrival = null,
  targetChoice = null,
  undoes = null,
  at = nowIso(),
}) {
  const verb = verbRegistry.resolve(verbId ?? act);
  if (!verb?.recordAct) throw new TypeError(`unknown record verb: ${verbId ?? act}`);
  const storedAct = verb.recordAct;
  const resolvedArrival = arrival ?? (anchor ? "exact" : "approximate");
  const span =
    blockEnd != null && blockEnd !== blockIndex
      ? `blocks ${blockIndex} to ${blockEnd}`
      : `block ${blockIndex}`;
  const target = rangeAnchor
    ? `from “${rangeAnchor.start.quotedText}” to “${rangeAnchor.end.quotedText}”`
    : anchor?.quotedText
    ? `“${anchor.quotedText}” in block ${blockIndex}`
    : span;
  const wording = { target, span, undoes, noteText, mathLatex };
  const intention = verb.recordDescription(wording);
  const cursor = makeCursor({
    docId,
    revision,
    blockIndex,
    modality,
    evidence,
    intention,
    anchor,
    alternatives: targetChoice?.candidates ?? [],
    historyEvents: targetChoice?.asked
      ? [`target was uncertain; person chose “${targetChoice.chosen}”`]
      : [],
    at,
  });
  const actionId = rid("act");
  const result = verb.recordResult(wording);
  const receipt = makeReceipt({
    docId,
    revision,
    blockIndex,
    actionId,
    result,
    arrival: resolvedArrival,
    undoRoute: verb.undoRoute ?? "undo from the history panel",
    at,
  });
  const entry = {
    id: rid("evt"),
    docId,
    kind: verb.historyKind ?? "act",
    act: storedAct,
    verbId: verb.id,
    blockIndex,
    blockEnd,
    modality,
    evidence,
    confidence,
    matchedText,
    anchor: rangeAnchor ? structuredClone(anchor) : anchor,
    resolvedAnchor: resolvedSegments?.[0] ? structuredClone(resolvedSegments[0]) : anchor,
    ...(rangeAnchor ? { rangeAnchor: structuredClone(rangeAnchor), resolvedSegments: structuredClone(resolvedSegments) } : {}),
    arrival: resolvedArrival,
    targetChoice,
    noteText,
    undone: false,
    undoes,
    createdAt: at,
    cursor,
    receipt,
  };
  verb.extendEntry?.(entry, { mathSpeech, mathLatex, mathUnparsed });
  return entry;
}

/** A reading return is durable evidence but not an undoable content act. */
export function makeReturnEntry({
  docId,
  revision,
  blockIndex,
  modality,
  evidence,
  matchedText = "",
  at = nowIso(),
}) {
  const verb = verbRegistry.get("return");
  if (typeof verb?.createReturnEntry !== "function") {
    throw new TypeError("return verb cannot create its record");
  }
  return verb.createReturnEntry(
    { docId, revision, blockIndex, modality, evidence, matchedText, at },
    { makeCursor, makeReceipt, rid },
  );
}
