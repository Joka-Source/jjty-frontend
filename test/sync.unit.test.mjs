// jt-sync integration units: spoken words -> pair code, and the moment
// envelope built from a kept act (blocks + cursor + receipt + provenance,
// never a bare file). Hashing runs the vendored canonical sha-256.
import test from "node:test";
import assert from "node:assert/strict";
import { codeFromSpoken, momentFromEntry } from "../src/sync.js";
import { makeActEntry } from "../src/records.js";

test("spoken recipient words become a valid pair code — or honestly nothing", () => {
  assert.equal(codeFromSpoken("amber brook cedar"), "amber-brook-cedar");
  assert.equal(codeFromSpoken("  Amber   Brook  CEDAR "), "amber-brook-cedar");
  assert.equal(codeFromSpoken("priya"), null); // a name, not a code
  assert.equal(codeFromSpoken("amber brook"), null); // two words only
  assert.equal(codeFromSpoken(""), null);
});

test("a kept act becomes a full moment: blocks, records, provenance", async () => {
  const entry = makeActEntry({
    docId: "doc-1",
    revision: 1,
    blockIndex: 3,
    blockEnd: 4,
    act: "highlight",
    modality: "voice",
    evidence: "highlight from rent is due to the deposit",
  });
  const doc = {
    id: "doc-1",
    title: "a short lease",
    revision: 1,
    text: "irrelevant here",
    provenance: { contentDigest: "sha256:" + "ab".repeat(32) },
  };
  const blockTexts = ["a", "b", "c", "rent is due…", "the deposit…"];
  const m = await momentFromEntry(entry, doc, blockTexts);
  assert.equal(m.blocks.length, 2, "range act should carry both blocks");
  assert.deepEqual(
    m.blocks.map((b) => b.content),
    ["rent is due…", "the deposit…"]
  );
  assert.equal(m.blocks[0].anchorId, "anc-doc-1-b3");
  assert.equal(m.cursor, entry.cursor, "the intention record travels verbatim");
  assert.equal(m.receipt, entry.receipt, "the proof record travels verbatim");
  assert.equal(m.provenance.sourceDigest, doc.provenance.contentDigest);
  assert.equal(m.provenance.sourceTitle, "a short lease");
  assert.equal(m.provenance.sourceRevision, "r1");
});

test("without stored provenance the digest is computed, never omitted", async () => {
  const entry = makeActEntry({
    docId: "doc-2",
    revision: 1,
    blockIndex: 0,
    act: "note",
    modality: "voice",
    evidence: "add a note test",
    noteText: "test",
  });
  const doc = { id: "doc-2", title: "t", revision: 1, text: "some text" };
  const m = await momentFromEntry(entry, doc, ["some text"]);
  assert.match(m.provenance.sourceDigest, /^sha256:[0-9a-f]{64}$/);
});
