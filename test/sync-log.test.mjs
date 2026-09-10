import test from "node:test";
import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { IndexedDbLogStore } from "../packages/jt-sync/src/log-indexeddb.ts";

const entry = {
  logSeq: 0,
  appendedAt: "2026-09-10T12:00:00.000Z",
  contentHash: "sha256:kept-moment",
  moment: {
    blocks: [{ kind: "text", content: "Keep this", anchorId: "anchor-1" }],
    cursor: { cursor_id: "cursor-1" },
    receipt: { receipt_id: "receipt-1" },
    provenance: { sourceId: "doc-1" },
    transport: {
      momentId: "moment-1",
      fromDeviceId: "device-a",
      sentAt: "2026-09-10T12:00:00.000Z",
      seq: 0,
      protocol: "jt-sync/0",
    },
  },
};

test("verified moment log survives a new store instance for the same device", async () => {
  const options = {
    indexedDB,
    databaseName: `jt-sync-test-${crypto.randomUUID()}`,
    deviceId: "device-a",
  };
  const firstSession = new IndexedDbLogStore(options);
  await firstSession.append(entry);

  const afterReload = new IndexedDbLogStore(options);

  assert.deepEqual(await afterReload.readAll(), [entry]);
  assert.equal(await afterReload.nextSeq(), 1);
});
