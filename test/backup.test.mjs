import test from "node:test";
import assert from "node:assert/strict";
import { BackupError, parseBackup } from "../src/backup.js";

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
  assert.deepEqual(parseBackup(JSON.stringify(valid())), valid());
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
