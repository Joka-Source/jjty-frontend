const COLLECTIONS = ["documents", "records", "positions", "arrived", "spaceFeeds"];
const ENCRYPTED_FORMAT = "jt-encrypted-export";
const ENCRYPTED_VERSION = 1;
const PBKDF2_ITERATIONS = 310000;

export class BackupError extends Error {
  constructor(message) {
    super(message);
    this.name = "BackupError";
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw new BackupError("the encrypted jt export is damaged");
  }
}

async function deriveBackupKey(passphrase, salt, usage) {
  if (typeof passphrase !== "string" || passphrase.length < 12) {
    throw new BackupError("the backup passphrase must be at least 12 characters");
  }
  const material = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    [usage]
  );
}

export async function encryptBackup(plaintext, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(passphrase, salt, "encrypt");
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)
  ));
  return JSON.stringify({
    format: ENCRYPTED_FORMAT,
    version: ENCRYPTED_VERSION,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: PBKDF2_ITERATIONS, salt: bytesToBase64(salt) },
    cipher: { name: "AES-GCM", iv: bytesToBase64(iv) },
    ciphertext: bytesToBase64(ciphertext),
  }, null, 2);
}

export async function decryptBackup(text, passphrase) {
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new BackupError("that file is not valid JSON");
  }
  if (!envelope || envelope.format !== ENCRYPTED_FORMAT) throw new BackupError("that file is not an encrypted jt export");
  if (envelope.version !== ENCRYPTED_VERSION) throw new BackupError("that file uses an unsupported encrypted jt export version");
  if (envelope.kdf?.name !== "PBKDF2" || envelope.kdf.hash !== "SHA-256" || envelope.kdf.iterations !== PBKDF2_ITERATIONS ||
      envelope.cipher?.name !== "AES-GCM" || typeof envelope.kdf.salt !== "string" ||
      typeof envelope.cipher.iv !== "string" || typeof envelope.ciphertext !== "string") {
    throw new BackupError("the encrypted jt export has invalid security parameters");
  }
  const salt = base64ToBytes(envelope.kdf.salt);
  const iv = base64ToBytes(envelope.cipher.iv);
  if (salt.length !== 16 || iv.length !== 12) throw new BackupError("the encrypted jt export has invalid security parameters");
  try {
    const key = await deriveBackupKey(passphrase, salt, "decrypt");
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, base64ToBytes(envelope.ciphertext));
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError("the encrypted jt export could not be decrypted; check the passphrase and file");
  }
}

export function isEncryptedBackup(text) {
  try {
    return JSON.parse(text)?.format === ENCRYPTED_FORMAT;
  } catch {
    return false;
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
  const transport = value.transport ?? { deviceId: null, queued: [], log: [] };
  if (transport.deviceId !== null && typeof transport.deviceId !== "string") throw new BackupError("the jt export contains an invalid transport identity");
  if (!Array.isArray(transport.queued) || transport.queued.some((entry) => !entry || typeof entry.id !== "string" || !entry.moment)) {
    throw new BackupError("the jt export contains an invalid outbound queue");
  }
  const log = transport.log ?? [];
  if (!Array.isArray(log) || log.some((entry, index) =>
    !entry || entry.logSeq !== index || typeof entry.appendedAt !== "string" ||
    typeof entry.contentHash !== "string" || !entry.moment
  )) throw new BackupError("the jt export contains an invalid delivery log sequence");
  return { ...value, transport: { ...transport, log } };
}

export async function verifyTransportLog(entries) {
  for (const entry of entries) {
    if (await envelopeHash(entry.moment) !== entry.contentHash) {
      throw new BackupError(`delivery evidence ${entry.logSeq} content hash does not match its moment`);
    }
  }
  return entries;
}
import { envelopeHash } from "../packages/jt-sync/src/hash.ts";
