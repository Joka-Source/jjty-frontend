import test from "node:test";
import assert from "node:assert/strict";

async function anchorApi() {
  return import("../src/anchors.js").catch(() => ({}));
}

const originalBlocks = [
  "Opening words stay here.",
  "The quick brown fox crosses the quiet yard at dusk.",
  "Closing words stay here.",
];
const originalDigest = `sha256:${"a".repeat(64)}`;

test("a durable anchor verifies its exact quote at the stored token span", async () => {
  const anchors = await anchorApi();
  assert.equal(typeof anchors.createAnchor, "function");
  assert.equal(typeof anchors.resolveAnchor, "function");
  const anchor = anchors.createAnchor({
    blockTexts: originalBlocks,
    blockIndex: 1,
    tokenStart: 1,
    tokenEnd: 3,
    docDigest: originalDigest,
  });
  assert.deepEqual(anchor, {
    blockIndex: 1,
    tokenStart: 1,
    tokenEnd: 3,
    quotedText: "quick brown fox",
    prefix: "The ",
    suffix: " crosses the quiet yard at dusk.",
    docDigest: originalDigest,
  });
  assert.deepEqual(anchors.resolveAnchor(anchor, { blockTexts: originalBlocks }), {
    arrival: "exact",
    blockIndex: 1,
    tokenStart: 1,
    tokenEnd: 3,
    quotedText: "quick brown fox",
  });
});

test("a prepended paragraph uniquely refinds the quote and reports refound", async () => {
  const anchors = await anchorApi();
  assert.equal(typeof anchors.createAnchor, "function");
  const anchor = anchors.createAnchor({
    blockTexts: originalBlocks,
    blockIndex: 1,
    tokenStart: 1,
    tokenEnd: 3,
    docDigest: originalDigest,
  });
  const moved = ["A newly inserted introduction.", ...originalBlocks];
  assert.deepEqual(anchors.resolveAnchor(anchor, { blockTexts: moved }), {
    arrival: "refound",
    blockIndex: 2,
    tokenStart: 1,
    tokenEnd: 3,
    quotedText: "quick brown fox",
  });
});

test("missing or context-tied text is lost instead of silently retargeted", async () => {
  const anchors = await anchorApi();
  assert.equal(typeof anchors.createAnchor, "function");
  const anchor = anchors.createAnchor({
    blockTexts: originalBlocks,
    blockIndex: 1,
    tokenStart: 1,
    tokenEnd: 3,
    docDigest: originalDigest,
  });
  assert.equal(
    anchors.resolveAnchor(anchor, {
      blockTexts: originalBlocks.map((text) => text.replace("quick brown fox", "slow red fox")),
    }).arrival,
    "lost",
  );
  const duplicated = [
    "The quick brown fox crosses the quiet yard at dusk.",
    "interlude",
    "The quick brown fox crosses the quiet yard at dusk.",
  ];
  assert.equal(anchors.resolveAnchor({ ...anchor, blockIndex: 8 }, { blockTexts: duplicated }).arrival, "lost");
});

test("legacy ordinal rows migrate visibly as approximate rather than exact", async () => {
  const anchors = await anchorApi();
  assert.equal(typeof anchors.migrateLegacyEntry, "function");
  const migrated = anchors.migrateLegacyEntry(
    { id: "evt-old", act: "highlight", blockIndex: 1, matchedText: originalBlocks[1] },
    { blockTexts: originalBlocks, docDigest: originalDigest },
  );
  assert.equal(migrated.migration, "legacy");
  assert.equal(migrated.arrival, "approximate");
  assert.equal(migrated.anchor.quotedText, originalBlocks[1]);
  assert.equal(migrated.anchor.docDigest, originalDigest);
});

test("PDF geometry is audit evidence and quote context still chooses the address", async () => {
  const anchors = await anchorApi();
  const geometry = {
    page: 2,
    x: 0.125,
    y: 0.25,
    width: 0.5,
    height: 0.04,
  };
  const anchor = anchors.createAnchor({
    blockTexts: originalBlocks,
    blockIndex: 1,
    tokenStart: 1,
    tokenEnd: 3,
    docDigest: originalDigest,
    geometry,
  });
  assert.deepEqual(anchor.geometry, geometry);

  const moved = ["A new page was inserted before the quote.", ...originalBlocks];
  assert.deepEqual(anchors.resolveAnchor(anchor, { blockTexts: moved }), {
    arrival: "refound",
    blockIndex: 2,
    tokenStart: 1,
    tokenEnd: 3,
    quotedText: "quick brown fox",
  });
});
