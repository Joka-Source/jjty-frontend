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

test('exact range derives first and last clipped spans with full middle blocks',async()=>{
 const {createAnchor,deriveRangeSegments}=await anchorApi();
 const blockTexts=['Ignore this start passage through the edge.','All middle words belong here.','Last passage then ignore this tail.'];
 const range={version:1,start:createAnchor({blockTexts,blockIndex:0,tokenStart:2,tokenEnd:3,docDigest:originalDigest}),end:createAnchor({blockTexts,blockIndex:2,tokenStart:0,tokenEnd:1,docDigest:originalDigest})};
 const segments=deriveRangeSegments(range,{blockTexts,docDigest:originalDigest});
 assert.deepEqual(segments.map(s=>s.quotedText),['start passage through the edge','All middle words belong here','Last passage']);
 assert.deepEqual(segments.map(s=>[s.blockIndex,s.tokenStart,s.tokenEnd]),[[0,2,6],[1,0,4],[2,0,1]]);
 const same={version:1,start:range.start,end:createAnchor({blockTexts,blockIndex:0,tokenStart:4,tokenEnd:5,docDigest:originalDigest})};
 assert.deepEqual(deriveRangeSegments(same,{blockTexts,docDigest:originalDigest}).map(s=>s.quotedText),['start passage through the']);
});
test('range validates both complete endpoint addresses and fails without refinding',async()=>{
 const {createAnchor,deriveRangeSegments}=await anchorApi();
 const make=()=>({version:1,start:createAnchor({blockTexts:originalBlocks,blockIndex:0,tokenStart:1,tokenEnd:2,docDigest:originalDigest}),end:createAnchor({blockTexts:originalBlocks,blockIndex:2,tokenStart:1,tokenEnd:2,docDigest:originalDigest})});
 for(const key of ['quotedText','prefix','suffix','docDigest'])for(const side of ['start','end']){
  const range=make();range[side][key]+=' changed';assert.throws(()=>deriveRangeSegments(range,{blockTexts:originalBlocks,docDigest:originalDigest}),/RANGE_ANCHOR_INVALID/);
 }
 const reversed=make();[reversed.start,reversed.end]=[reversed.end,reversed.start];assert.throws(()=>deriveRangeSegments(reversed,{blockTexts:originalBlocks,docDigest:originalDigest}),/RANGE_ANCHOR_INVALID/);
 assert.throws(()=>deriveRangeSegments(make(),{blockTexts:['new paragraph',...originalBlocks],docDigest:originalDigest}),/RANGE_ANCHOR_INVALID/);
});
test('same-block range rejects nested backward endpoint edges but permits identical endpoints',async()=>{
 const {createAnchor,deriveRangeSegments}=await anchorApi(),blockTexts=['one two three four five six'];
 const anchor=(tokenStart,tokenEnd)=>createAnchor({blockTexts,blockIndex:0,tokenStart,tokenEnd,docDigest:originalDigest});
 for(const [start,end] of [[anchor(1,4),anchor(2,3)],[anchor(2,3),anchor(1,4)]]) {
  assert.throws(()=>deriveRangeSegments({version:1,start,end},{blockTexts,docDigest:originalDigest}),/RANGE_ANCHOR_INVALID/);
 }
 const same=anchor(1,3);assert.equal(deriveRangeSegments({version:1,start:same,end:same},{blockTexts,docDigest:originalDigest})[0].quotedText,'two three four');
});
test('source-aware ordinary anchor resolution refuses exact quotes with a different digest',async()=>{
 const {createAnchor,resolveAnchor}=await anchorApi();
 const anchor=createAnchor({blockTexts:originalBlocks,blockIndex:1,tokenStart:1,tokenEnd:3,docDigest:originalDigest});
 assert.equal(resolveAnchor(anchor,{blockTexts:originalBlocks,docDigest:originalDigest}).arrival,'exact');
 assert.deepEqual(resolveAnchor(anchor,{blockTexts:originalBlocks,docDigest:'sha256:changed-source'}),{arrival:'lost'});
 assert.equal(resolveAnchor(anchor,{blockTexts:originalBlocks}).arrival,'exact','existing quote-only callers retain compatibility');
});
test('explicit source-change allowance reports refound even when the old span still matches',async()=>{
 const {createAnchor,resolveAnchor}=await anchorApi();
 const anchor=createAnchor({blockTexts:originalBlocks,blockIndex:1,tokenStart:1,tokenEnd:3,docDigest:originalDigest});
 const context={blockTexts:originalBlocks,docDigest:'sha256:new-revision',allowSourceChange:true};
 assert.equal(resolveAnchor(anchor,context).arrival,'refound');
 assert.deepEqual(resolveAnchor(anchor,{...context,allowSourceChange:false}),{arrival:'lost'});
 assert.equal(resolveAnchor(anchor,{...context,blockTexts:['new paragraph',...originalBlocks]}).arrival,'refound');
});
