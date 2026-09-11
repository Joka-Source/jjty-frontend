import test from "node:test";
import assert from "node:assert/strict";
import { restoreDeviceBackup } from "../src/restore-coordinator.js";

const backup = { transport: { queued: [{ id: "restored" }] }, documents: [{ id: "new" }] };

function harness({ failData = false, failRollback = false } = {}) {
  const calls = [];
  let outbox = [{ id: "prior" }];
  return {
    calls,
    readOutbox: () => outbox,
    dependencies: {
      applyLocal: () => calls.push("apply-local"),
      revertLocal: () => calls.push("revert-local"),
      getOutbox: async () => (calls.push("get-outbox"), structuredClone(outbox)),
      replaceOutbox: async (entries) => {
        calls.push(`replace-outbox:${entries[0]?.id ?? "empty"}`);
        if (failRollback && entries[0]?.id === "prior") throw new Error("rollback storage unavailable");
        outbox = structuredClone(entries);
      },
      replaceAllData: async () => {
        calls.push("replace-data");
        if (failData) throw new Error("document transaction failed");
      },
    },
  };
}

test("same-device restore applies local settings, outbox, then application data", async () => {
  const h = harness();
  await restoreDeviceBackup({ backup, restoreQueued: true, ...h.dependencies });
  assert.deepEqual(h.calls, ["apply-local", "get-outbox", "replace-outbox:restored", "replace-data"]);
  assert.deepEqual(h.readOutbox(), [{ id: "restored" }]);
});

test("failed application-data transaction compensates local state and outbox", async () => {
  const h = harness({ failData: true });
  await assert.rejects(
    () => restoreDeviceBackup({ backup, restoreQueued: true, ...h.dependencies }),
    (error) => error.message === "restore failed; the previous data was recovered. document transaction failed" && error.recovered === true,
  );
  assert.deepEqual(h.calls, ["apply-local", "get-outbox", "replace-outbox:restored", "replace-data", "revert-local", "replace-outbox:prior"]);
  assert.deepEqual(h.readOutbox(), [{ id: "prior" }]);
});

test("failed compensation reports a mixed recovery state instead of claiming success", async () => {
  const h = harness({ failData: true, failRollback: true });
  await assert.rejects(
    () => restoreDeviceBackup({ backup, restoreQueued: true, ...h.dependencies }),
    (error) => error.message.includes("recovery is incomplete") && error.message.includes("rollback storage unavailable") && error.recovered === false,
  );
  assert.deepEqual(h.readOutbox(), [{ id: "restored" }]);
});
