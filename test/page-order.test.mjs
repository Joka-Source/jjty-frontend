import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePageOrder, allPagesIndices, MAX_PAGE_COUNT, MAX_ORDER_INPUT_LENGTH} from '../vendor/bentopdf/page-order.js';

test('Bento adaptation expands ranges into a complete zero-based order',()=>{
 assert.deepEqual(parsePageOrder('3,1-2',3),[2,0,1]);
 assert.deepEqual(parsePageOrder(' 3 , 1 - 2 ',3),[2,0,1]);
 assert.deepEqual(parsePageOrder('1',1),[0]);
 assert.deepEqual(parsePageOrder('1-1',1),[0]);
 assert.deepEqual(parsePageOrder('1-4',4),allPagesIndices(4));
 assert.deepEqual(parsePageOrder('4,3,2,1',4),[3,2,1,0]);
});
test('rejects missing, repeated, out-of-range and malformed pages atomically',()=>{
 for(const input of ['', ' ', '1,2', '1,2,2', '1-2,2-3', '0,1,2', '1,2,4',
   '3-1', '1,,2,3', ',1,2,3', '1,2,3,', '1.0,2,3', '1.5,2,3',
   '1e0,2,3', '+1,2,3', '-1,2,3', '01,2,3', '0x1,2,3', '1x,2,3',
   '1-2-3','1--3','1–3','1 2,3','NaN','Infinity','١,٢,٣', '1-999999999999999999999']) {
  assert.throws(()=>parsePageOrder(input,3),RangeError,input);
 }
 for(const input of [null,undefined,3,{},['1','2','3']]) assert.throws(()=>parsePageOrder(input,3),TypeError);
});
test('caps page count, input size and expansion before allocating unbounded ranges',()=>{
 for(const n of [0,-1,1.5,NaN,Infinity,'3',null,MAX_PAGE_COUNT+1,Number.MAX_SAFE_INTEGER]) {
  assert.throws(()=>parsePageOrder('1',n),RangeError);
  assert.throws(()=>allPagesIndices(n),RangeError);
 }
 assert.throws(()=>parsePageOrder(' '.repeat(MAX_ORDER_INPUT_LENGTH+1),1),RangeError);
 assert.throws(()=>parsePageOrder('1,'.repeat(MAX_PAGE_COUNT),MAX_PAGE_COUNT),RangeError);
 const order=parsePageOrder(`1-${MAX_PAGE_COUNT}`,MAX_PAGE_COUNT);
 assert.equal(order.length,MAX_PAGE_COUNT);assert.equal(order.at(-1),MAX_PAGE_COUNT-1);
});
test('returned models are fresh and failures do not leak partial orders',()=>{
 const first=parsePageOrder('3,1-2',3);first[0]=99;
 assert.deepEqual(parsePageOrder('3,1-2',3),[2,0,1]);
 assert.throws(()=>parsePageOrder('3,1-2,garbage',3));
 assert.deepEqual(allPagesIndices(3),[0,1,2]);
});
