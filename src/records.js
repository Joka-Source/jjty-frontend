// jt — record factories. Pure functions, no DOM, no storage: importable from
// both the browser app and node tests. The objects returned by makeCursor and
// makeReceipt conform to contracts/cursor.schema.json and
// contracts/receipt.schema.json (additionalProperties: false — nothing extra
// may ride along on these).

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

export function anchorIdFor(docId, blockIndex) {
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
  at = nowIso(),
}) {
  const cursor = {
    schemaVersion: SCHEMA_VERSION,
    id: rid("cur"),
    anchorId: anchorIdFor(docId, blockIndex),
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
  undoRoute = "undo from the history panel",
  at = nowIso(),
}) {
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
    arrival: "exact",
    undoRoute,
    repairRoute: "undo, then redo the act with corrected words",
    returnRoute: returnRouteFor(docId, revision, blockIndex),
  };
}

/** Plain-words labels for the three acts plus undo. Used in UI and records. */
export const ACT_LABELS = {
  highlight: "highlight this block",
  important: "mark this block important",
  note: "attach a spoken note to this block",
  undo: "undo a previous act",
};

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
  modality,
  evidence,
  confidence = null,
  matchedText = "",
  noteText = "",
  undoes = null,
  at = nowIso(),
}) {
  const span =
    blockEnd != null && blockEnd !== blockIndex
      ? `blocks ${blockIndex} to ${blockEnd}`
      : `block ${blockIndex}`;
  const intention =
    act === "undo"
      ? `undo the act recorded as ${undoes}`
      : `${ACT_LABELS[act]} (${span})`;
  const cursor = makeCursor({
    docId,
    revision,
    blockIndex,
    modality,
    evidence,
    intention,
    at,
  });
  const actionId = rid("act");
  const result =
    act === "highlight"
      ? `${span} highlighted`
      : act === "important"
        ? `${span} marked important`
        : act === "note"
          ? `note attached to ${span}: "${noteText}"`
          : `act ${undoes} reversed; ${span} restored`;
  const receipt = makeReceipt({
    docId,
    revision,
    blockIndex,
    actionId,
    result,
    undoRoute:
      act === "undo"
        ? "redo by performing the original act again"
        : "undo from the history panel",
    at,
  });
  return {
    id: rid("evt"),
    docId,
    kind: act === "undo" ? "undo" : "act",
    act,
    blockIndex,
    blockEnd,
    modality,
    evidence,
    confidence,
    matchedText,
    noteText,
    undone: false,
    undoes,
    createdAt: at,
    cursor,
    receipt,
  };
}
