import test from "node:test";
import assert from "node:assert/strict";

async function targetingApi() {
  return import("../src/targeting.js").catch(() => ({}));
}

const first = {
  blockIndex: 1,
  tokenStart: 2,
  tokenEnd: 5,
  quotedText: "shared target phrase here",
  score: 0.92,
};

test("an uncertain target asks even when it barely clears acceptance", async () => {
  const targeting = await targetingApi();
  assert.equal(typeof targeting.decideTarget, "function");
  const result = targeting.decideTarget({
    score: 0.7,
    target: { ...first, score: 0.7 },
    candidates: [{ ...first, score: 0.7 }],
  });
  assert.equal(result.kind, "ask");
  assert.match(result.reason, /confidence/i);
});

test("close target scores in different blocks ask instead of using proximity", async () => {
  const targeting = await targetingApi();
  assert.equal(typeof targeting.decideTarget, "function");
  const second = { ...first, blockIndex: 4, score: 0.9 };
  const result = targeting.decideTarget({
    score: 0.92,
    target: first,
    candidates: [first, second],
  });
  assert.equal(result.kind, "ask");
  assert.match(result.reason, /more than one passage/i);
  assert.deepEqual(result.candidates.map(({ blockIndex }) => blockIndex), [1, 4]);
});

test("a strong unique target commits its exact span", async () => {
  const targeting = await targetingApi();
  assert.equal(typeof targeting.decideTarget, "function");
  assert.deepEqual(
    targeting.decideTarget({ score: 0.93, target: first, candidates: [first] }),
    { kind: "commit", target: { ...first, score: 0.93 } },
  );
});

test('named phrase refuses ASR substitutions and clipping, while exact words target their complete span', async () => {
  const {decidePhraseTarget} = await targetingApi();
  assert.equal(typeof decidePhraseTarget, 'function');
  const blocks = ['The tenant shall pay a late charge on overdue rent.'];
  for (const phrase of ['a lead charge', 'pay a late charge tomorrow', '', '!!!']) {
    assert.deepEqual(decidePhraseTarget(blocks, phrase), {kind:'none'}, phrase);
  }
  assert.deepEqual(decidePhraseTarget(blocks, 'a late charge'), {
    kind:'commit',target:{blockIndex:0,tokenStart:4,tokenEnd:6,quotedText:'a late charge',score:1}
  });
});

test('named phrase retains every exact occurrence, including repeated words within one block', async () => {
  const {decidePhraseTarget} = await targetingApi();
  const decision = decidePhraseTarget(['A late charge; a late charge.', 'A late charge.'], 'a late charge');
  assert.equal(decision.kind, 'ask');
  assert.deepEqual(decision.candidates.map(c=>[c.blockIndex,c.tokenStart,c.tokenEnd]), [[0,0,2],[0,3,5],[1,0,2]]);
});
