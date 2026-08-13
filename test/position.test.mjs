import test from "node:test";
import assert from "node:assert/strict";
import {
  createPositionMemory,
  normalizePosition,
  relativeReadTime,
  matchDocumentName,
} from "../src/position.js";

test("position memory coalesces rapid writes per document and keeps the newest block", async () => {
  const writes = [];
  const timers = [];
  const memory = createPositionMemory({
    save: async (position) => writes.push(position),
    load: async () => null,
    delay: 600,
    now: () => Date.parse("2026-08-13T06:30:00.000Z"),
    setTimer: (fn) => {
      timers.push(fn);
      return fn;
    },
    clearTimer: () => {},
  });
  const river = { id: "doc-river", revision: 2 };
  const atlas = { id: "doc-atlas", revision: 1 };

  memory.remember(river, 1, 8);
  memory.remember(river, 4, 8);
  memory.remember(atlas, 2, 3);

  assert.equal(writes.length, 0, "writes should wait for the throttle window");
  assert.equal(timers.length, 2, "each document gets an independent pending write");
  await Promise.all(timers.map((run) => run()));
  assert.deepEqual(writes, [
    {
      docId: "doc-river",
      revision: 2,
      blockIndex: 4,
      blockCount: 8,
      updatedAt: "2026-08-13T06:30:00.000Z",
    },
    {
      docId: "doc-atlas",
      revision: 1,
      blockIndex: 2,
      blockCount: 3,
      updatedAt: "2026-08-13T06:30:00.000Z",
    },
  ]);
});

test("position normalization rejects broken rows and clamps a surviving place", () => {
  const doc = { id: "doc-river", revision: 3 };
  assert.equal(normalizePosition(null, doc, 5), null);
  assert.equal(normalizePosition({ docId: "other", blockIndex: 2 }, doc, 5), null);
  assert.equal(normalizePosition({ docId: "doc-river", blockIndex: -1 }, doc, 5), null);
  assert.equal(normalizePosition({ docId: "doc-river", blockIndex: 2 }, doc, 0), null);
  assert.deepEqual(
    normalizePosition(
      {
        docId: "doc-river",
        revision: 1,
        blockIndex: 99,
        blockCount: 100,
        updatedAt: "2026-08-13T05:00:00.000Z",
      },
      doc,
      5
    ),
    {
      docId: "doc-river",
      revision: 3,
      blockIndex: 4,
      blockCount: 5,
      updatedAt: "2026-08-13T05:00:00.000Z",
    }
  );
});

test("relative read time stays plain and relative", () => {
  const now = Date.parse("2026-08-13T06:30:00.000Z");
  assert.equal(relativeReadTime("2026-08-13T06:29:35.000Z", now), "just now");
  assert.equal(relativeReadTime("2026-08-13T06:26:00.000Z", now), "4 minutes ago");
  assert.equal(relativeReadTime("2026-08-13T04:30:00.000Z", now), "2 hours ago");
  assert.equal(relativeReadTime("2026-08-10T06:30:00.000Z", now), "3 days ago");
});

test("document-name matching chooses exact titles, exposes ties, and rejects weak guesses", () => {
  const docs = [
    { id: "survey", title: "River Survey" },
    { id: "summary", title: "River Summary" },
    { id: "atlas", title: "Field Atlas" },
  ];
  assert.deepEqual(matchDocumentName(docs, "river survey"), {
    kind: "match",
    document: docs[0],
    score: 1,
  });
  const ambiguous = matchDocumentName(docs, "river");
  assert.equal(ambiguous.kind, "ambiguous");
  assert.deepEqual(ambiguous.documents.map((d) => d.id), ["survey", "summary"]);
  const duplicate = matchDocumentName(
    [
      { id: "atlas-1", title: "Field Atlas" },
      { id: "atlas-2", title: "Field Atlas" },
    ],
    "field atlas"
  );
  assert.equal(duplicate.kind, "ambiguous");
  assert.deepEqual(duplicate.documents.map((d) => d.id), ["atlas-1", "atlas-2"]);
  assert.deepEqual(matchDocumentName(docs, "quarterly taxes"), { kind: "none" });
});
