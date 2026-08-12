// jt — the act engine. Applies acts to the open document's DOM, writes the
// paired cursor + receipt records to IndexedDB, and reverses acts on undo
// (undo itself is an act with its own records — the trail never thins).

import { makeActEntry } from "./records.js";
import { putRecord, getRecords } from "./db.js";

export function createActEngine({ getBlocks, getDoc, onChange, onApply, renderMath }) {
  // In-memory mirror of this document's history, newest last.
  let entries = [];

  async function load(docId) {
    entries = await getRecords(docId);
    // Re-apply surviving effects so a reload shows the same document state.
    for (const e of entries) {
      if (e.kind === "act" && !e.undone) applyEffect(e);
    }
    onChange?.(entries);
    return entries;
  }

  function* affectedBlocks(entry) {
    const blocks = getBlocks();
    const from = entry.blockIndex;
    const to = entry.blockEnd ?? entry.blockIndex;
    for (let i = from; i <= to; i++) {
      if (blocks[i]) yield blocks[i];
    }
  }

  function applyEffect(entry, { confirm = false } = {}) {
    for (const p of affectedBlocks(entry)) {
      if (entry.act === "highlight") p.classList.add("hl");
      if (entry.act === "important") p.classList.add("important");
      if (entry.act === "note") {
        const note = document.createElement("span");
        note.className = "note";
        note.dataset.entry = entry.id;
        note.textContent = entry.noteText;
        p.appendChild(note);
      }
      if (entry.act === "math") {
        const math = document.createElement("span");
        math.className = "kept-math";
        math.dataset.entry = entry.id;
        math.dataset.latex = entry.mathLatex;
        if (renderMath) renderMath(math, entry);
        else math.textContent = entry.mathLatex;
        p.appendChild(math);
      }
      if (confirm) onApply?.(p, entry);
    }
  }

  function reverseEffect(entry) {
    for (const p of affectedBlocks(entry)) {
      if (entry.act === "highlight") p.classList.remove("hl");
      if (entry.act === "important") p.classList.remove("important");
      if (entry.act === "note") {
        p.querySelector(`.note[data-entry="${entry.id}"]`)?.remove();
      }
      if (entry.act === "math") {
        p.querySelector(`.kept-math[data-entry="${entry.id}"]`)?.remove();
      }
    }
  }

  /**
   * Perform an act on a block. Returns the persisted history entry.
   * act: "highlight" | "important" | "note"
   */
  async function perform(
    act,
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
    } = {}
  ) {
    const doc = getDoc();
    if (!doc || blockIndex < 0) return null;
    const entry = makeActEntry({
      docId: doc.id,
      revision: doc.revision,
      blockIndex,
      blockEnd,
      act,
      modality,
      evidence,
      confidence,
      matchedText,
      noteText,
      mathSpeech,
      mathLatex,
      mathUnparsed,
    });
    applyEffect(entry, { confirm: true });
    await putRecord(entry);
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
      modality,
      evidence,
      undoes: target.id,
    });
    await putRecord(undoEntry);
    entries.push(undoEntry);
    onChange?.(entries);
    return undoEntry;
  }

  return {
    load,
    perform,
    undo,
    get entries() {
      return entries;
    },
  };
}
