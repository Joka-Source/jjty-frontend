import test from "node:test";
import assert from "node:assert/strict";
import { createLaterController } from "../model.mjs";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test("initial rejection settles as a visible retryable error", async () => {
  let calls = 0;
  const controller = createLaterController({
    fetchPage: async () => {
      calls += 1;
      if (calls === 1) throw new Error("offline");
      return { items: [{ id: "one", text: "first" }], nextCursor: "page-2" };
    },
  });
  await controller.load();
  assert.deepEqual(controller.state(), { tab: "saved", status: "error", items: [], nextCursor: null, error: "offline", failedRequest: { append: false, cursor: null } });
  await controller.retry();
  assert.equal(controller.state().status, "ready");
  assert.deepEqual(controller.state().items.map((item) => item.id), ["one"]);
});

test("pagination failure preserves items and cursor, then retry appends once", async () => {
  let failOlder = true;
  const controller = createLaterController({
    fetchPage: async ({ cursor }) => {
      if (!cursor) return { items: [{ id: "one", text: "first" }], nextCursor: "page-2" };
      if (failOlder) { failOlder = false; throw new Error("timeout"); }
      return { items: [{ id: "one", text: "duplicate" }, { id: "two", text: "second" }], nextCursor: null };
    },
  });
  await controller.load();
  await controller.loadOlder();
  assert.equal(controller.state().status, "error-older");
  assert.deepEqual(controller.state().items.map((item) => item.id), ["one"]);
  assert.equal(controller.state().nextCursor, "page-2");
  await controller.retry();
  assert.deepEqual(controller.state().items.map((item) => item.id), ["one", "two"]);
  assert.equal(controller.state().nextCursor, null);
});

test("a late response from an old tab cannot replace the current tab", async () => {
  const saved = deferred();
  const completed = deferred();
  const controller = createLaterController({ fetchPage: ({ tab }) => tab === "saved" ? saved.promise : completed.promise });
  const first = controller.load();
  const second = controller.selectTab("completed");
  completed.resolve({ items: [{ id: "done", text: "finished" }], nextCursor: null });
  await second;
  saved.resolve({ items: [{ id: "stale", text: "old tab" }], nextCursor: "wrong" });
  await first;
  assert.equal(controller.state().tab, "completed");
  assert.deepEqual(controller.state().items.map((item) => item.id), ["done"]);
  assert.equal(controller.state().nextCursor, null);
});
