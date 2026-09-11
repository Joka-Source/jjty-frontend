const COLLECTIONS = ["documents", "records", "positions", "arrived", "spaceFeeds"];

export class BackupError extends Error {
  constructor(message) {
    super(message);
    this.name = "BackupError";
  }
}

export function parseBackup(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BackupError("that file is not valid JSON");
  }
  if (!value || value.format !== "jt-export") throw new BackupError("that file is not a jt export");
  for (const key of COLLECTIONS) {
    if (!Array.isArray(value[key])) throw new BackupError(`the jt export is missing ${key}`);
  }
  if (!value.settings || typeof value.settings !== "object") throw new BackupError("the jt export is missing settings");
  if (!value.spaces || typeof value.spaces !== "object") throw new BackupError("the jt export is missing spaces");
  if (typeof value.settings.lang !== "string" || !["calm", "usual", "lively"].includes(value.settings.motion) || !["js", "wasm"].includes(value.settings.engine)) {
    throw new BackupError("the jt export contains invalid settings");
  }

  const docIds = new Set();
  for (const doc of value.documents) {
    if (!doc || typeof doc.id !== "string" || typeof doc.text !== "string") throw new BackupError("the jt export contains an invalid document");
    if (docIds.has(doc.id)) throw new BackupError(`the jt export repeats document ${doc.id}`);
    docIds.add(doc.id);
  }
  for (const record of value.records) {
    if (!record || typeof record.id !== "string" || !docIds.has(record.docId)) throw new BackupError("the jt export contains a record without its document");
  }
  for (const position of value.positions) {
    if (!position || !docIds.has(position.docId)) throw new BackupError("the jt export contains a reading place without its document");
  }
  return value;
}
