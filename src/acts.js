// jt — the act engine. Applies acts to the open document's DOM, writes the
// paired cursor + receipt records to IndexedDB, and reverses acts on undo
// (undo itself is an act with its own records — the trail never thins).

import { makeActEntry, makeReturnEntry } from "./records.js";
import { putRecord, getRecords } from "./db.js";
import { contentDigest } from "./ingest.js";
import { createAnchor, migrateLegacyEntry, resolveAnchor } from "./anchors.js";
import { verbRegistry } from "./registry/index.js";
import { emitGlass } from "./glass-tap.js";

export function createActEngine({
  getBlocks,
  getBlockTexts = () => getBlocks().map((block) => block.textContent ?? ""),
  getDoc,
  onChange,
  onApply,
  renderMath,
  getAnchorGeometry = () => null,
}) {
  // In-memory mirror of this document's history, newest last.
  let entries = [];

  async function load(docId) {
    entries = await getRecords(docId);
    const doc = getDoc();
    const blockTexts = getBlockTexts();
    const docDigest =
      doc?.provenance?.contentDigest ?? (await contentDigest(doc?.text ?? blockTexts.join("\n\n")));
    for (let i = 0; i < entries.length; i++) {
      const original = entries[i];
      if (original.kind !== "act") continue;
      let entry = original.anchor
        ? { ...original }
        : migrateLegacyEntry(original, { blockTexts, docDigest });
      if (entry.migration !== "legacy" && entry.anchor) {
        const resolved = resolveAnchor(entry.anchor, { blockTexts, docDigest });
        entry.arrival = resolved.arrival;
        if (resolved.arrival === "lost") {
          delete entry.resolvedAnchor;
        } else {
          entry.resolvedAnchor = {
            blockIndex: resolved.blockIndex,
            tokenStart: resolved.tokenStart,
            tokenEnd: resolved.tokenEnd,
            quotedText: resolved.quotedText,
          };
          entry.blockIndex = resolved.blockIndex;
        }
      }
      if (entry.receipt) entry.receipt = { ...entry.receipt, arrival: entry.arrival };
      entries[i] = entry;
      if (JSON.stringify(entry) !== JSON.stringify(original)) await putRecord(entry);
    }
    // Re-apply surviving effects so a reload shows the same document state.
    for (const e of entries) {
      if (e.kind === "act" && !e.undone) applyEffect(e);
    }
    onChange?.(entries);
    return entries;
  }

  function* affectedBlocks(entry) {
    if (entry.arrival === "lost") return;
    const blocks = getBlocks();
    const from = entry.blockIndex;
    const to = entry.blockEnd ?? entry.blockIndex;
    for (let i = from; i <= to; i++) {
      if (blocks[i]) yield blocks[i];
    }
  }

  function applyEffect(entry, { confirm = false } = {}) {
    const verb = verbRegistry.resolve(entry.verbId ?? entry.act);
    const effectVerb = verbRegistry.get(verb?.effectVerbId) ?? verb;
    if (!effectVerb?.applyEffect) return;
    for (const p of affectedBlocks(entry)) {
      effectVerb.applyEffect(p, entry, { renderMath });
      if (confirm) onApply?.(p, entry);
    }
  }

  function reverseEffect(entry) {
    const verb = verbRegistry.resolve(entry.verbId ?? entry.act);
    const effectVerb = verbRegistry.get(verb?.effectVerbId) ?? verb;
    if (!effectVerb?.reverseEffect) return;
    for (const p of affectedBlocks(entry)) {
      effectVerb.reverseEffect(p, entry, { renderMath });
    }
  }

  /**
   * Perform an act on a block. Returns the persisted history entry.
   * verbId may be a canonical registry id or a stored-record alias.
   */
  async function perform(
    verbId,
    blockIndex,
    {
      modality,
      evidence,
      confidence,
      matchedText,
      noteText,
      blockEnd,
      mathSpeech,
      mathLatex,
      mathUnparsed,
      tokenStart,
      tokenEnd,
      targetChoice,
      arrival: requestedArrival,
    } = {}
  ) {
    const verb = verbRegistry.resolve(verbId);
    if (!verb?.recordAct) throw new TypeError(`verb cannot create an act: ${verbId}`);
    const doc = getDoc();
    if (!doc || blockIndex < 0) return null;
    const blockTexts = getBlockTexts();
    const docDigest =
      doc.provenance?.contentDigest ?? (await contentDigest(doc.text ?? blockTexts.join("\n\n")));
    const anchor =
      Number.isInteger(tokenStart) && Number.isInteger(tokenEnd)
        ? createAnchor({
            blockTexts,
            blockIndex,
            tokenStart,
            tokenEnd,
            docDigest,
            geometry: getAnchorGeometry(blockIndex, tokenStart, tokenEnd),
          })
        : null;
    const arrival = requestedArrival ?? (anchor ? "exact" : "approximate");
    const entry = makeActEntry({
      docId: doc.id,
      revision: doc.revision,
      blockIndex,
      blockEnd,
      act: verb.recordAct,
      verbId: verb.id,
      modality,
      evidence,
      confidence,
      matchedText: anchor?.quotedText ?? matchedText,
      noteText,
      mathSpeech,
      mathLatex,
      mathUnparsed,
      anchor,
      arrival,
      targetChoice,
    });
    applyEffect(entry, { confirm: true });
    await putRecord(entry);
    emitGlass({
      kind: "actCommitted",
      act: verb.id,
      input: evidence ?? "",
      target: {
        blockId: `${doc.id}-block-${blockIndex}`,
        blockIndex,
        ...(Number.isInteger(tokenStart) ? { start: tokenStart } : {}),
        ...(Number.isInteger(tokenEnd) ? { end: tokenEnd } : {}),
        ...(anchor?.quotedText ? { text: anchor.quotedText } : {}),
      },
    });
    entries.push(entry);
    onChange?.(entries);
    return entry;
  }

  /** Undo a specific entry (or, with no id, the latest not-yet-undone act). */
  async function undo(entryId, { modality = "voice", evidence = "undo" } = {}) {
    const doc = getDoc();
    if (!doc) return null;
    let target = null;
    if (entryId) {
      target = entries.find((e) => e.id === entryId && e.kind === "act" && !e.undone);
    } else {
      target = [...entries].reverse().find((e) => e.kind === "act" && !e.undone);
    }
    if (!target) return null;
    reverseEffect(target);
    target.undone = true;
    target.cursor = { ...target.cursor, undoAvailable: false };
    await putRecord(target);
    const undoEntry = makeActEntry({
      docId: doc.id,
      revision: doc.revision,
      blockIndex: target.blockIndex,
      blockEnd: target.blockEnd,
      act: "undo",
      verbId: "undo",
      modality,
      evidence,
      undoes: target.id,
    });
    await putRecord(undoEntry);
    emitGlass({
      kind: "actCommitted",
      act: "undo",
      input: evidence,
      target: { blockId: `${doc.id}-block-${target.blockIndex}`, blockIndex: target.blockIndex },
    });
    entries.push(undoEntry);
    onChange?.(entries);
    return undoEntry;
  }

  async function recordReturn(blockIndex, { modality, evidence, matchedText } = {}) {
    const doc = getDoc();
    if (!doc || blockIndex < 0) return null;
    const entry = makeReturnEntry({
      docId: doc.id,
      revision: doc.revision,
      blockIndex,
      modality,
      evidence,
      matchedText,
    });
    await putRecord(entry);
    emitGlass({
      kind: "actCommitted",
      act: "return",
      input: evidence ?? "",
      target: { blockId: `${doc.id}-block-${blockIndex}`, blockIndex },
    });
    entries.push(entry);
    onChange?.(entries);
    return entry;
  }

  return {
    load,
    perform,
    recordReturn,
    undo,
    get entries() {
      return entries;
    },
  };
}
