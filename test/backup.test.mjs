import test from "node:test";
import assert from "node:assert/strict";
import { BackupError, decryptBackup, encryptBackup, parseBackup, verifyTransportLog } from "../src/backup.js";
import { envelopeHash } from "../packages/jt-sync/src/hash.ts";

const valid = () => ({
  format: "jt-export",
  version: "0.1.0",
  exportedAt: "2026-09-11T00:00:00.000Z",
  settings: { lang: "en-IN", motion: "calm", engine: "js" },
  documents: [{ id: "doc-1", text: "kept words", title: "kept", createdAt: "2026-09-11T00:00:00.000Z", revision: 1 }],
  records: [{ id: "act-1", docId: "doc-1" }],
  positions: [{ docId: "doc-1", blockIndex: 0 }],
  arrived: [],
  spaces: { seq: 0, institutions: [], cohorts: [], spaces: [], memberships: [] },
  spaceFeeds: [],
});

test("a complete jt export is accepted for restoration", () => {
  assert.deepEqual(parseBackup(JSON.stringify(valid())), { ...valid(), transport: { deviceId: null, queued: [], log: [] } });
});

test("device-bound queued sends are validated and old exports remain readable", () => {
  const backup = valid();
  backup.transport = { deviceId: "device-a", queued: [{ id: "moment-1", moment: { transport: { momentId: "moment-1" } } }] };
  assert.deepEqual(parseBackup(JSON.stringify(backup)).transport, { ...backup.transport, log: [] });
  backup.transport.queued = [{ id: "broken" }];
  assert.throws(() => parseBackup(JSON.stringify(backup)), /invalid outbound queue/);
});

test("device delivery evidence is structurally validated and old exports default to no log", async () => {
  const old = parseBackup(JSON.stringify(valid()));
  assert.deepEqual(old.transport.log, []);
  const backup = valid();
  const moment = { transport: { momentId: "moment-1", fromDeviceId: "device-a", seq: 0, sentAt: "2026-09-11T00:00:00.000Z", protocol: "jt-sync/0" } };
  backup.transport = { deviceId: "device-a", queued: [], log: [{ logSeq: 0, appendedAt: "2026-09-11T00:00:01.000Z", contentHash: await envelopeHash(moment), moment }] };
  const parsed = parseBackup(JSON.stringify(backup));
  await verifyTransportLog(parsed.transport.log);
  parsed.transport.log[0].contentHash = "sha256:" + "0".repeat(64);
  await assert.rejects(() => verifyTransportLog(parsed.transport.log), /content hash does not match/);
  backup.transport.log[0].logSeq = 2;
  assert.throws(() => parseBackup(JSON.stringify(backup)), /invalid delivery log sequence/);
});

test("corrupt, foreign and incomplete backups fail before mutation", () => {
  assert.throws(() => parseBackup("not json"), BackupError);
  assert.throws(() => parseBackup(JSON.stringify({ ...valid(), format: "other" })), /not a jt export/);
  const missing = valid(); delete missing.arrived;
  assert.throws(() => parseBackup(JSON.stringify(missing)), /missing arrived/);
  assert.throws(() => parseBackup(JSON.stringify({ ...valid(), settings: { lang: "en-IN", motion: "wild", engine: "js" } })), /invalid settings/);
});

test("records and reading places cannot restore without their document", () => {
  const orphanRecord = valid(); orphanRecord.records[0].docId = "missing";
  assert.throws(() => parseBackup(JSON.stringify(orphanRecord)), /record without its document/);
  const orphanPosition = valid(); orphanPosition.positions[0].docId = "missing";
  assert.throws(() => parseBackup(JSON.stringify(orphanPosition)), /reading place without its document/);
});

test("encrypted exports round-trip without exposing document text or passphrase", async () => {
  const plaintext = JSON.stringify(valid());
  const encrypted = await encryptBackup(plaintext, "a memorable long passphrase");
  assert.doesNotMatch(encrypted, /kept words|memorable long passphrase/);
  const envelope = JSON.parse(encrypted);
  assert.equal(envelope.format, "jt-encrypted-export");
  assert.equal(envelope.version, 1);
  assert.equal(envelope.kdf.name, "PBKDF2");
  assert.equal(envelope.kdf.iterations, 310000);
  assert.equal(envelope.cipher.name, "AES-GCM");
  assert.deepEqual(parseBackup(await decryptBackup(encrypted, "a memorable long passphrase")), { ...valid(), transport: { deviceId: null, queued: [], log: [] } });
});

test("encrypted exports reject short, wrong and tampered credentials", async () => {
  await assert.rejects(() => encryptBackup(JSON.stringify(valid()), "too short"), /at least 12 characters/);
  const encrypted = await encryptBackup(JSON.stringify(valid()), "correct horse battery");
  await assert.rejects(() => decryptBackup(encrypted, "incorrect horse battery"), /could not be decrypted/);
  const tampered = JSON.parse(encrypted);
  tampered.ciphertext = `${tampered.ciphertext.slice(0, -2)}AA`;
  await assert.rejects(() => decryptBackup(JSON.stringify(tampered), "correct horse battery"), /could not be decrypted/);
});

test("encrypted envelope validation fails before key derivation", async () => {
  await assert.rejects(() => decryptBackup(JSON.stringify({ format: "other" }), "a sufficiently long passphrase"), /not an encrypted jt export/);
  await assert.rejects(() => decryptBackup(JSON.stringify({ format: "jt-encrypted-export", version: 2 }), "a sufficiently long passphrase"), /unsupported encrypted jt export/);
});
