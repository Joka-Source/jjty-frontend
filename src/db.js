// jt — IndexedDB persistence. Four stores:
//   docs:    { id, title, text, createdAt, revision }
//   records: { id, docId, kind, act, blockIndex, confidence, matchedText,
//              noteText, undone, undoes, createdAt, cursor, receipt }
//   inbox:   verified moments received from another device
//   positions: { docId, revision, blockIndex, blockCount, updatedAt }
// The `cursor` and `receipt` fields are schema-pure records conforming to
// jt-contracts cursor.schema.json / receipt.schema.json. Everything else is
// app-level evidence for the history panel.

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
    const out = fn(s);
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function putDoc(doc) {
  const db = await openDb();
  return tx(db, "docs", "readwrite", (s) => s.put(doc));
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

export async function putRecord(entry) {
  const db = await openDb();
  return tx(db, "records", "readwrite", (s) => s.put(entry));
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
