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

test('named phrase refuses clipping, while exact words target their complete span', async () => {
  const {decidePhraseTarget} = await targetingApi();
  assert.equal(typeof decidePhraseTarget, 'function');
  const blocks = ['The tenant shall pay a late charge on overdue rent.'];
  for (const phrase of ['pay a late charge tomorrow', '', '!!!']) {
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


test('near source wording requires confirmation even with one unique candidate', async () => {
  const {decidePhraseTarget} = await targetingApi();
  const decision = decidePhraseTarget(['The tenant pays a late charge.'], 'a lead charge');
  assert.equal(decision.kind, 'ask');
  assert.equal(decision.matchType, 'suggestion');
  assert.equal(decision.candidates.length, 1);
  const target = decision.candidates[0];
  assert.deepEqual([target.blockIndex,target.tokenStart,target.tokenEnd,target.quotedText], [0,3,5,'a late charge']);
  assert.ok(target.score < 1);
  assert.equal(target.matchType, 'suggestion');
  assert.match(target.explanation, /lead.*late/);
  assert.equal(decision.truncated, false);
  // Exact source wording always wins, even when a nearby alternative exists.
  assert.equal(decidePhraseTarget(['a lead charge; a late charge'], 'a lead charge').kind, 'commit');
});

test('near suggestions refuse unrelated, shortened, numeric, negation and multiword guesses', async () => {
  const {decidePhraseTarget} = await targetingApi();
  for (const phrase of ['a huge charge','a lead fee','lead charge','a lead charge tomorrow','a 100 charge','not late charge','a lead']) {
    assert.deepEqual(decidePhraseTarget(['A late charge.'],phrase), {kind:'none'},phrase);
  }
  assert.deepEqual(decidePhraseTarget(['The fee is 200 dollars.'], 'the fee is 100 dollars'), {kind:'none'});
  assert.deepEqual(decidePhraseTarget(['a late', 'charge'], 'a lead charge'), {kind:'none'});
  assert.deepEqual(decidePhraseTarget(['this shall late'], 'this shall lead'), {kind:'none'});
  assert.equal(decidePhraseTarget(['a late charge'], 'a late chsrge').kind, 'ask');
  assert.deepEqual(decidePhraseTarget(['one two three four five six seven eight nine ten eleven twelve late'], 'one two three four five six seven eight nine ten eleven twelve lead'), {kind:'none'});
});

test('suggestions preserve repeated same-block occurrences and honestly cap a long candidate list', async () => {
  const {decidePhraseTarget} = await targetingApi();
  const repeated = decidePhraseTarget(['A late charge; a late charge.'], 'a lead charge');
  assert.equal(repeated.kind, 'ask');
  assert.deepEqual(repeated.candidates.map(c=>c.tokenStart), [0,3]);
  const capped = decidePhraseTarget(['a late charge. '.repeat(20)], 'a lead charge');
  assert.equal(capped.kind, 'ask');
  assert.equal(capped.candidates.length, 8);
  assert.equal(capped.truncated, true);
  assert.deepEqual(decidePhraseTarget(['x'.repeat(200001) + ' a late charge'], 'a lead charge'), {kind:'none'});
});
