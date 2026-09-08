import test from "node:test";
import assert from "node:assert/strict";
import {
  createReaderSession,
  normalizeReaderView,
  READER_SESSION_KEY,
} from "../src/reader-session.js";
import { fitPdfScale, createPdfReadingModel } from "../src/pdf-reading.js";
const doc = (id) => ({
  id,
  revision: 1,
  provenance: { contentDigest: `digest-${id}` },
});
function store() {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key),
    setItem: (key, value) => entries.set(key, value),
  };
}
test("ordered tabs and independent source-bound view metadata survive reload and close without deleting saved views", () => {
  const storage = store(),
    session = createReaderSession({ storage });
  session.open(doc("a"));
  session.update(doc("a"), {
    pageNumber: 3,
    pageOffset: 0.35,
    zoomMode: "custom",
    zoom: 1.5,
    workspace: "fill",
    search: "Invoice",
  });
  session.open(doc("b"));
  session.update(doc("b"), { workspace: "organize", bentoTool: "ocr" });
  const loaded = createReaderSession({ storage });
  assert.deepEqual(loaded.snapshot().tabs, ["a", "b"]);
  assert.equal(loaded.snapshot().activeId, "b");
  assert.equal(loaded.get(doc("a")).pageNumber, 3);
  assert.equal(loaded.get(doc("a")).workspace, "fill");
  assert.equal(loaded.get(doc("b")).bentoTool, "ocr");
  loaded.close("a");
  assert.deepEqual(loaded.snapshot().tabs, ["b"]);
  loaded.open(doc("a"));
  assert.equal(loaded.get(doc("a")).zoom, 1.5);
  assert.equal(loaded.get({ ...doc("a"), revision: 2 }).pageNumber, 1);
  assert.equal(loaded.get({ ...doc("a"), revision: 2 }).search, "");
});
test("opening many documents never silently closes existing tabs", () => {
  const storage = store(),
    session = createReaderSession({ storage });
  for (let i = 0; i < 30; i++) session.open(doc(String(i)));
  assert.equal(session.snapshot().tabs.length, 30);
  assert.equal(createReaderSession({ storage }).snapshot().tabs.length, 30);
});
test("invalid session data is normalized and missing documents pruned", () => {
  const storage = store();
  storage.setItem(
    READER_SESSION_KEY,
    JSON.stringify({
      version: 1,
      tabs: ["a", "a", null, 2, "b"],
      activeId: "missing",
      views: {
        a: { pageNumber: -1, zoom: 100, workspace: "destroy" },
        missing: { pageNumber: 5 },
      },
    }),
  );
  const session = createReaderSession({ storage });
  session.reconcile([doc("a")]);
  assert.deepEqual(session.snapshot().tabs, ["a"]);
  assert.equal(session.snapshot().activeId, "a");
  assert.equal(session.get(doc("a")).workspace, "read");
  assert.equal(session.get(doc("a")).zoom, 2.5);
  assert.equal(session.snapshot().views.missing, undefined);
  assert.equal(normalizeReaderView(null).pageNumber, 1);
});
test("blocked storage preserves live tabs and reports recoverable continuity failure", () => {
  const errors = [];
  const session = createReaderSession({
    storage: {
      getItem() {
        throw Error("denied");
      },
      setItem() {
        throw Error("quota");
      },
    },
    onError: (error) => errors.push(error),
  });
  session.open(doc("a"));
  session.update(doc("a"), { pageNumber: 4 });
  assert.equal(session.get(doc("a")).pageNumber, 4);
  assert.deepEqual(session.snapshot().tabs, ["a"]);
  assert.match(errors.at(-1), /documents are safe/);
});
test("fit width uses widest actual page and supports phone scales below75percent", () => {
  const fit = fitPdfScale(358, [800, 500]);
  assert.equal(fit, 358 / 800);
  const model = createPdfReadingModel({ pages: [], zoom: fit, minZoom: 0.05 });
  assert.equal(model.zoom, fit);
  assert.equal(fitPdfScale(0, [800]), null);
  assert.equal(fitPdfScale(500, []), null);
  assert.equal(fitPdfScale(900, [800]), 1.125);
});
