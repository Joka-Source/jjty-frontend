import test from 'node:test';
import assert from 'node:assert/strict';
import {findRangeTargets} from '../src/range-targets.js';

test('range endpoints preserve every complete occurrence and its original word offsets',()=>{
  const blocks=['Before: the orchard is ready. Later, the orchard is ready again.','THE ORCHARD IS READY.'];
  const matches=findRangeTargets(blocks,'the orchard is ready');
  assert.deepEqual(matches.map(m=>[m.blockIndex,m.tokenStart,m.tokenEnd]),[[0,1,4],[0,6,9],[1,0,3]]);
  assert.equal(matches[2].quotedText,'THE ORCHARD IS READY');
});
test('range endpoints never shorten an absent phrase to manufacture a match',()=>{
  assert.deepEqual(findRangeTargets(['The orchard is ready.'],'The orchard is ready on Mars'),[]);
  assert.deepEqual(findRangeTargets(['The orchard','is ready.'],'The orchard is ready'),[]);
  assert.deepEqual(findRangeTargets(['The orchard is ready.'],'?!'),[]);
});
