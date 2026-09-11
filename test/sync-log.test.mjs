import test from "node:test";
import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { IndexedDbLogStore } from "../packages/jt-sync/src/log-indexeddb.ts";
import { IndexedDbOutboxStore } from "../packages/jt-sync/src/outbox-indexeddb.ts";

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

test("delivery-log recovery is atomic and scoped to one device", async () => {
  const databaseName = `jt-sync-log-replace-${crypto.randomUUID()}`;
  const deviceA = new IndexedDbLogStore({ indexedDB, databaseName, deviceId: "device-a" });
  const deviceB = new IndexedDbLogStore({ indexedDB, databaseName, deviceId: "device-b" });
  await deviceA.append(entry);
  await deviceB.append({ ...entry, moment: { ...entry.moment, transport: { ...entry.moment.transport, momentId: "other" } } });
  const restored = [{ ...entry, logSeq: 0, moment: { ...entry.moment, transport: { ...entry.moment.transport, momentId: "restored" } } }];
  await deviceA.replaceAll(restored);
  assert.deepEqual((await deviceA.readAll()).map((row) => row.moment.transport.momentId), ["restored"]);
  assert.deepEqual((await deviceB.readAll()).map((row) => row.moment.transport.momentId), ["other"]);
});

test("an unsent moment survives reload until verified delivery removes it", async () => {
  const options = {
    indexedDB,
    databaseName: `jt-sync-outbox-test-${crypto.randomUUID()}`,
    deviceId: "device-a",
  };
  const queued = {
    id: "outbox-1",
    createdAt: "2026-09-10T12:00:00.000Z",
    attemptCount: 0,
    lastError: null,
    moment: {
      blocks: [{ kind: "text", content: "Keep this", anchorId: "anchor-1" }],
      cursor: { cursor_id: "cursor-1" },
      receipt: { receipt_id: "receipt-1" },
      provenance: { sourceId: "doc-1" },
      transport: { momentId: "outbox-1" },
    },
  };
  const first = new IndexedDbOutboxStore(options);
  await first.put(queued);
  await first.recordFailure(queued.id, "relay unavailable");

  const afterReload = new IndexedDbOutboxStore(options);
  const pending = await afterReload.readAll();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].attemptCount, 1);
  assert.equal(pending[0].lastError, "relay unavailable");

  await afterReload.remove(queued.id);
  assert.deepEqual(await new IndexedDbOutboxStore(options).readAll(), []);
});

test("outbox replacement is atomic and scoped to one device", async () => {
  const databaseName = `jt-sync-outbox-replace-${crypto.randomUUID()}`;
  const deviceA = new IndexedDbOutboxStore({ indexedDB, databaseName, deviceId: "device-a" });
  const deviceB = new IndexedDbOutboxStore({ indexedDB, databaseName, deviceId: "device-b" });
  const queued = (id) => ({ id, createdAt: `2026-09-10T12:00:0${id.at(-1)}.000Z`, attemptCount: 0, lastError: null, moment: { transport: { momentId: id } } });
  await deviceA.put(queued("old-1"));
  await deviceB.put(queued("other-2"));
  await deviceA.replaceAll([queued("new-3"), queued("new-4")]);
  assert.deepEqual((await deviceA.readAll()).map((entry) => entry.id), ["new-3", "new-4"]);
  assert.deepEqual((await deviceB.readAll()).map((entry) => entry.id), ["other-2"]);
});
