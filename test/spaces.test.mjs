import test from "node:test";
import assert from "node:assert/strict";
import {
  documentFromSpaceFeedItem,
  makeSpaceFeedItem,
  resolveSpaceName,
} from "../src/space-flow.js";
import { momentFromEntry } from "../src/sync.js";
import { makeActEntry } from "../src/records.js";
import { envelopeHash } from "jt-sync/src/hash.ts";

const spaces = [
  { id: "spc-cse-a", name: "CSE-A" },
  { id: "spc-cse-b", name: "CSE-B" },
  { id: "spc-drama", name: "Dramatics Club" },
];

test("space names resolve exactly or fuzzily without guessing between close matches", () => {
  const exact = resolveSpaceName("cse a", spaces);
  assert.equal(exact.kind, "match");
  assert.equal(exact.space.id, "spc-cse-a");

  const fuzzy = resolveSpaceName("dramatics clob", spaces);
  assert.equal(fuzzy.kind, "match");
  assert.equal(fuzzy.space.id, "spc-drama");
  assert.ok(fuzzy.score >= 0.72);

  const ambiguous = resolveSpaceName("cse", spaces);
  assert.equal(ambiguous.kind, "ambiguous");
  assert.deepEqual(
    ambiguous.candidates.map(({ space }) => space.id),
    ["spc-cse-a", "spc-cse-b"],
  );

  assert.deepEqual(resolveSpaceName("quantum lab", spaces), { kind: "none" });
  assert.deepEqual(resolveSpaceName("", spaces), { kind: "none" });
});

async function sourceMoment() {
  const entry = makeActEntry({
    docId: "doc-lease",
    revision: 3,
    blockIndex: 1,
    blockEnd: 2,
    act: "highlight",
    modality: "voice",
    evidence: "highlight from rent is due to the protected account",
    matchedText: "rent is due",
  });
  const doc = {
    id: "doc-lease",
    title: "A short lease",
    revision: 3,
    text: "opening\n\nrent is due\n\nthe protected account",
    provenance: {
      sourceKind: "text",
      contentDigest: `sha256:${"ab".repeat(32)}`,
      byteSize: 51,
      capturedAt: "2026-08-13T08:00:00.000Z",
    },
  };
  return momentFromEntry(entry, doc, ["opening", "rent is due", "the protected account"]);
}

test("space feed item preserves the source moment and hashes its validated space context", async () => {
  const source = await sourceMoment();
  source.spaceContext = {
    schemaVersion: "0.1.0",
    spaceId: "spc-origin",
    visibility: "space",
  };
  const originalProvenance = structuredClone(source.provenance);
  const originalSpaceContext = structuredClone(source.spaceContext);
  const context = {
    schemaVersion: "0.1.0",
    spaceId: "spc-cse-a",
    institutionId: "inst-1",
    visibility: "space",
  };
  const item = await makeSpaceFeedItem({
    moment: source,
    space: { id: "spc-cse-a", name: "CSE-A" },
    spaceContext: context,
    person: { id: "per-asha", name: "asha" },
    momentId: "spm-1",
    at: "2026-08-13T09:00:00.000Z",
    sourceContentHash: `sha256:${"cd".repeat(32)}`,
  });

  assert.equal(item.id, "spm-1");
  assert.equal(item.spaceId, "spc-cse-a");
  assert.equal(item.spaceName, "CSE-A");
  assert.equal(item.arrivedAt, "2026-08-13T09:00:00.000Z");
  assert.deepEqual(item.placedBy, { id: "per-asha", name: "asha" });
  assert.equal(item.sourceContentHash, `sha256:${"cd".repeat(32)}`);
  assert.deepEqual(item.sourceSpaceContext, originalSpaceContext);
  assert.deepEqual(item.moment.spaceContext, context);
  assert.deepEqual(item.moment.provenance, originalProvenance);
  assert.equal(
    item.moment.cursor.capturedEvidence,
    "highlight from rent is due to the protected account",
  );
  assert.equal(item.contentHash, await envelopeHash(item.moment));
  assert.deepEqual(source.spaceContext, originalSpaceContext, "placing into a space mutated the source moment");
});

test("keeping a feed excerpt creates a document with a new digest and intact original provenance", async () => {
  const source = await sourceMoment();
  const item = await makeSpaceFeedItem({
    moment: source,
    space: { id: "spc-cse-a", name: "CSE-A" },
    spaceContext: { schemaVersion: "0.1.0", spaceId: "spc-cse-a", visibility: "space" },
    person: { id: "per-asha", name: "asha" },
    momentId: "spm-2",
    at: "2026-08-13T09:00:00.000Z",
  });
  const doc = await documentFromSpaceFeedItem(item, {
    id: "doc-from-space",
    at: "2026-08-13T10:00:00.000Z",
  });

  assert.equal(doc.id, "doc-from-space");
  assert.equal(doc.title, "A short lease — from CSE-A");
  assert.equal(doc.text, "rent is due\n\nthe protected account");
  assert.deepEqual(
    doc.blocks.map(({ text, kind }) => ({ text, kind })),
    [
      { text: "rent is due", kind: "paragraph" },
      { text: "the protected account", kind: "paragraph" },
    ],
  );
  assert.equal(doc.revision, 1);
  assert.equal(doc.provenance.sourceKind, "space moment");
  assert.match(doc.provenance.contentDigest, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(doc.provenance.contentDigest, source.provenance.sourceDigest);
  assert.deepEqual(doc.provenance.original, source.provenance);
  assert.equal(doc.provenance.spaceImport.spaceId, "spc-cse-a");
  assert.equal(doc.provenance.spaceImport.spaceName, "CSE-A");
  assert.equal(doc.provenance.spaceImport.arrivedAt, "2026-08-13T09:00:00.000Z");
  assert.equal(doc.provenance.spaceImport.contentHash, item.contentHash);
  assert.equal(doc.provenance.spaceImport.sourceContentHash, null);
  assert.equal(doc.provenance.spaceImport.sourceSpaceContext, null);
  assert.deepEqual(doc.provenance.spaceImport.spaceContext, item.moment.spaceContext);
  assert.deepEqual(doc.provenance.spaceImport.moment, item.moment);
});
