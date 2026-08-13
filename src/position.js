// jt — pure reading-continuity decisions. IndexedDB stays in db.js; this
// module validates positions, coalesces hot matcher updates per document, and
// ranks spoken document names without ever choosing a close tie.

import { normalize, phraseSimilarity } from "../vendor/jt-speech/fuzzy.js";

export function normalizePosition(position, doc, blockCount) {
  if (!position || !doc || position.docId !== doc.id || blockCount < 1) return null;
  if (!Number.isInteger(position.blockIndex) || position.blockIndex < 0) return null;
  return {
    docId: doc.id,
    revision: doc.revision ?? 1,
    blockIndex: Math.min(position.blockIndex, blockCount - 1),
    blockCount,
    updatedAt:
      typeof position.updatedAt === "string" && Number.isFinite(Date.parse(position.updatedAt))
        ? position.updatedAt
        : new Date(0).toISOString(),
  };
}

function ago(value, unit) {
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

export function relativeReadTime(iso, now = Date.now()) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "time unknown";
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return ago(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return ago(hours, "hour");
  return ago(Math.floor(hours / 24), "day");
}

/**
 * Coalesce updates independently for each document. `save` and `load` are the
 * IndexedDB boundary in the browser and tiny in-memory functions in unit tests.
 */
export function createPositionMemory({
  save,
  load,
  delay = 700,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const pending = new Map();
  const timers = new Map();

  async function flushDoc(docId) {
    const timer = timers.get(docId);
    if (timer !== undefined) clearTimer(timer);
    timers.delete(docId);
    const position = pending.get(docId);
    pending.delete(docId);
    if (position) await save(position);
    return position ?? null;
  }

  function remember(doc, blockIndex, blockCount) {
    if (!doc || !Number.isInteger(blockIndex) || blockIndex < 0 || blockCount < 1) return;
    pending.set(doc.id, {
      docId: doc.id,
      revision: doc.revision ?? 1,
      blockIndex: Math.min(blockIndex, blockCount - 1),
      blockCount,
      updatedAt: new Date(now()).toISOString(),
    });
    if (!timers.has(doc.id)) {
      timers.set(doc.id, setTimer(() => flushDoc(doc.id), delay));
    }
  }

  return {
    remember,
    async read(doc, blockCount) {
      if (pending.has(doc.id)) return normalizePosition(pending.get(doc.id), doc, blockCount);
      return normalizePosition(await load(doc.id), doc, blockCount);
    },
    flush: flushDoc,
    async flushAll() {
      return Promise.all([...pending.keys()].map(flushDoc));
    },
  };
}

function titleScore(title, spoken) {
  const a = normalize(title);
  const b = normalize(spoken);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    return 0.92 + 0.04 * (Math.min(a.length, b.length) / Math.max(a.length, b.length));
  }
  return phraseSimilarity(a, b);
}

export function matchDocumentName(docs, spokenName, { floor = 0.58, ambiguityGap = 0.08 } = {}) {
  const ranked = docs
    .map((document, order) => ({ document, order, score: titleScore(document.title, spokenName) }))
    .filter((item) => item.score >= floor)
    .sort((a, b) => b.score - a.score || a.order - b.order);
  if (!ranked.length) return { kind: "none" };
  const best = ranked[0];
  if (best.score === 1) {
    const exact = ranked.filter((item) => item.score === 1);
    if (exact.length > 1) {
      return { kind: "ambiguous", documents: exact.map((item) => item.document) };
    }
    return { kind: "match", document: best.document, score: 1 };
  }
  const tied = ranked.filter((item) => best.score - item.score < ambiguityGap);
  if (tied.length > 1) {
    return { kind: "ambiguous", documents: tied.map((item) => item.document) };
  }
  return { kind: "match", document: best.document, score: best.score };
}
