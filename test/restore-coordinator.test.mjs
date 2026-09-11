import test from "node:test";
import assert from "node:assert/strict";
import { restoreDeviceBackup } from "../src/restore-coordinator.js";

const backup = { transport: { queued: [{ id: "restored" }], log: [{ logSeq: 0 }] }, documents: [{ id: "new" }] };

function harness({ failData = false, failRollback = false } = {}) {
  const calls = [];
  let outbox = [{ id: "prior" }];
  let log = [{ logSeq: 9 }];
  return {
    calls,
    readOutbox: () => outbox,
    readLog: () => log,
    dependencies: {
      applyLocal: () => calls.push("apply-local"),
      revertLocal: () => calls.push("revert-local"),
      getOutbox: async () => (calls.push("get-outbox"), structuredClone(outbox)),
      replaceOutbox: async (entries) => {
        calls.push(`replace-outbox:${entries[0]?.id ?? "empty"}`);
        if (failRollback && entries[0]?.id === "prior") throw new Error("rollback storage unavailable");
        outbox = structuredClone(entries);
      },
      getDeliveryLog: async () => (calls.push("get-log"), structuredClone(log)),
      replaceDeliveryLog: async (entries) => {
        calls.push(`replace-log:${entries[0]?.logSeq ?? "empty"}`);
        log = structuredClone(entries);
      },
      replaceAllData: async () => {
        calls.push("replace-data");
        if (failData) throw new Error("document transaction failed");
      },
    },
  };
}

test("same-device restore applies local settings, outbox, delivery log, then application data", async () => {
  const h = harness();
  await restoreDeviceBackup({ backup, restoreQueued: true, ...h.dependencies });
  assert.deepEqual(h.calls, ["apply-local", "get-outbox", "replace-outbox:restored", "get-log", "replace-log:0", "replace-data"]);
  assert.deepEqual(h.readOutbox(), [{ id: "restored" }]);
});

test("foreign-device transport evidence is not installed", async () => {
  const h = harness();
  await restoreDeviceBackup({ backup, restoreQueued: false, ...h.dependencies });
  assert.deepEqual(h.calls, ["apply-local", "replace-data"]);
  assert.deepEqual(h.readOutbox(), [{ id: "prior" }]);
  assert.deepEqual(h.readLog(), [{ logSeq: 9 }]);
});

test("failed application-data transaction compensates local state and outbox", async () => {
  const h = harness({ failData: true });
  await assert.rejects(
    () => restoreDeviceBackup({ backup, restoreQueued: true, ...h.dependencies }),
    (error) => error.message === "restore failed; the previous data was recovered. document transaction failed" && error.recovered === true,
  );
  assert.deepEqual(h.calls, ["apply-local", "get-outbox", "replace-outbox:restored", "get-log", "replace-log:0", "replace-data", "revert-local", "replace-outbox:prior", "replace-log:9"]);
  assert.deepEqual(h.readOutbox(), [{ id: "prior" }]);
  assert.deepEqual(h.readLog(), [{ logSeq: 9 }]);
});

test("failed compensation reports a mixed recovery state instead of claiming success", async () => {
  const h = harness({ failData: true, failRollback: true });
  await assert.rejects(
    () => restoreDeviceBackup({ backup, restoreQueued: true, ...h.dependencies }),
    (error) => error.message.includes("recovery is incomplete") && error.message.includes("rollback storage unavailable") && error.recovered === false,
  );
  assert.deepEqual(h.readOutbox(), [{ id: "restored" }]);
});
