// jt — IndexedDB persistence. Four stores:
//   docs:    { id, title, text, createdAt, revision }
//   records: { id, docId, kind, act, blockIndex, confidence, matchedText,
//              noteText, undone, undoes, createdAt, cursor, receipt }
//   inbox:   verified moments received from another device
//   positions: { docId, revision, blockIndex, blockCount, updatedAt }
// The `cursor` and `receipt` fields are schema-pure records conforming to
// jt-contracts cursor.schema.json / receipt.schema.json. Everything else is
// app-level evidence for the history panel.

import { emitGlass } from "./glass-tap.js";

const DB_NAME = "jt-web";
const DB_VERSION = 3;

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("docs")) {
        db.createObjectStore("docs", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("records")) {
        const s = db.createObjectStore("records", { keyPath: "id" });
        s.createIndex("docId", "docId");
      }
      if (!db.objectStoreNames.contains("inbox")) {
        db.createObjectStore("inbox", { keyPath: "momentId" });
      }
      if (!db.objectStoreNames.contains("spaceFeed")) {
        db.createObjectStore("spaceFeed", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("positions")) {
        db.createObjectStore("positions", { keyPath: "docId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
    try { out = fn(s); }
    catch (error) {
      // Synchronous failures must also roll back earlier queued writes.
      t.abort();
      reject(error);
    }
  });
}

// Read/patch/write in one transaction so queued whole-document saves cannot
// revert a title chosen through renameDocument.
async function updateDocument(id, patch) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('docs', 'readwrite');
    const store = transaction.objectStore('docs');
    let saved, failure;
    transaction.oncomplete = () => resolve(saved);
    transaction.onerror = event => { failure ??= event.target.error; };
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('DOCUMENT_SAVE_FAILED'));
    try {
      const request = store.get(id);
      request.onsuccess = () => {
        try { saved = patch(request.result); store.put(saved); }
        catch (error) { failure = error; transaction.abort(); }
      };
    } catch (error) { failure = error; transaction.abort(); }
  });
}

export async function putDocIfAbsent(doc) {
  const incoming = structuredClone(doc);
  return updateDocument(incoming.id, existing => existing || incoming);
}

export async function putDoc(doc) {
  const incoming = structuredClone(doc);
  await updateDocument(incoming.id, existing => {
    if (Number.isSafeInteger(existing?.titleRevision) && existing.titleRevision > 0) {
      incoming.title = existing.title;
      incoming.titleRevision = existing.titleRevision;
    } else {
      // The revision marker is minted only by renameDocument (or a validated
      // add-only backup restore); generic writes cannot claim rename authority.
      delete incoming.titleRevision;
    }
    return incoming;
  });
  return incoming.id;
}

export async function renameDocument(id, title) {
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200) {
    const error = new Error('DOCUMENT_TITLE_INVALID'); error.code = error.message; throw error;
  }
  const nextTitle = title.trim();
  if (typeof id !== 'string' || !id) {
    const error = new Error('DOCUMENT_NOT_FOUND'); error.code = error.message; throw error;
  }
  return updateDocument(id, existing => {
    if (!existing) { const error = new Error('DOCUMENT_NOT_FOUND'); error.code = error.message; throw error; }
    const revision = existing.titleRevision ?? 0;
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) {
      const error = new Error('DOCUMENT_TITLE_REVISION_INVALID'); error.code = error.message; throw error;
    }
    return { ...existing, title: nextTitle, titleRevision: revision + 1 };
  });
}

export async function getDocs() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("docs").objectStore("docs").getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function getDoc(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("docs").objectStore("docs").get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function putPosition(position) {
  const db = await openDb();
  return tx(db, "positions", "readwrite", (s) => s.put(position));
}

export async function getPosition(docId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("positions").objectStore("positions").get(docId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function getPositions() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("positions").objectStore("positions").getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function putRecords(entries) {
  try {
    const db = await openDb();
    await tx(db, "records", "readwrite", s => {
      for (const entry of entries) s.put(entry);
    });
  } catch (cause) {
    const error = new Error("The change could not be saved", { cause });
    error.name = "RecordSaveError";
    throw error;
  }
  for (const entry of entries) emitGlass({
    kind: "recordWritten",
    record: entry,
    schema: { name: "jt act", valid: null, errors: [] },
  });
}

export async function putRecord(entry) {
  await putRecords([entry]);
  return entry.id;
}

export async function putInbox(item) {
  const db = await openDb();
  return tx(db, "inbox", "readwrite", (s) => s.put(item));
}

export async function getInbox() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("inbox").objectStore("inbox").getAll();
    req.onsuccess = () => {
      const rows = req.result ?? [];
      rows.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function putSpaceFeed(item) {
  const db = await openDb();
  return tx(db, "spaceFeed", "readwrite", (s) => s.put(item));
}

/** Space moments are read in arrival order, never newest-first. */
export async function getSpaceFeed() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("spaceFeed").objectStore("spaceFeed").getAll();
    req.onsuccess = () => {
      const rows = req.result ?? [];
      rows.sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt) || a.id.localeCompare(b.id));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getRecords(docId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction("records")
      .objectStore("records")
      .index("docId")
      .getAll(docId);
    req.onsuccess = () => {
      const rows = req.result ?? [];
      rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

/** A coherent view of the three local-library stores, excluding network state. */
export async function readLibrarySnapshot() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['docs', 'records', 'positions'], 'readonly');
    const requests = Object.fromEntries(['docs', 'records', 'positions'].map(name =>
      [name, transaction.objectStore(name).getAll()]));
    transaction.oncomplete = () => resolve(Object.fromEntries(Object.entries(requests).map(([name, request]) => [name, request.result])));
    transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('BACKUP_SNAPSHOT_FAILED'));
  });
}

/** Validate first, then add everything atomically. A collision aborts all writes. */
export async function restoreLibrarySnapshot(snapshot) {
  const { validateLibrarySnapshot } = await import('./library-backup.js');
  const staged = await validateLibrarySnapshot(snapshot);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['docs', 'records', 'positions'], 'readwrite');
    transaction.oncomplete = () => resolve({ documents: staged.docs.length, records: staged.records.length, positions: staged.positions.length });
    let requestError;
    transaction.onerror = event => { requestError ??= event.target.error; };
    transaction.onabort = () => {
      const cause = requestError ?? transaction.error;
      const error = new Error(cause?.name === 'ConstraintError' ? 'BACKUP_ID_COLLISION' : 'BACKUP_RESTORE_FAILED', { cause });
      error.code = error.message;
      reject(error);
    };
    try {
      for (const name of ['docs', 'records', 'positions']) {
        const store = transaction.objectStore(name);
        for (const value of staged[name]) store.add(value);
      }
    } catch (cause) {
      transaction.abort();
      reject(new Error('BACKUP_RESTORE_FAILED', { cause }));
    }
  });
}
