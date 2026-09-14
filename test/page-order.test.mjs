import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePageOrder, parsePageSelection, allPagesIndices, MAX_PAGE_COUNT, MAX_ORDER_INPUT_LENGTH} from '../vendor/bentopdf/page-order.js';

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

test('selection preserves subset order and range order without requiring omitted pages',()=>{
 assert.deepEqual(parsePageSelection('3,1-2',5),[2,0,1]);
 assert.deepEqual(parsePageSelection(' 5 , 2 - 3 ',5),[4,1,2]);
 assert.deepEqual(parsePageSelection('2',5),[1]);
 assert.deepEqual(parsePageSelection('1',1),[0]);
 assert.throws(()=>parsePageOrder('2',5),RangeError,'order still requires complete permutation');
 const result=parsePageSelection('2',5);result[0]=99;
 assert.deepEqual(parsePageSelection('2',5),[1]);
});
test('selection refuses invalid or duplicate terms rather than skipping or truncating them',()=>{
 for(const input of ['', ' ', '1,,2', ',1', '1,', '1,1', '1-3,2', '0', '6',
  '2-1', '1-6','1.2', '1.0', '1e0', '+1', '-1', '01', '0x1', '1x', '1--3',
  '1-2-3', '1–3', 'NaN', 'Infinity', '١', '1 2', '999999999999999999999']) {
  assert.throws(()=>parsePageSelection(input,5),RangeError,input);
 }
 for(const input of [null,undefined,3,{},['1']])assert.throws(()=>parsePageSelection(input,5),TypeError);
 for(const count of [0,-1,1.5,NaN,Infinity,'3',null,MAX_PAGE_COUNT+1])assert.throws(()=>parsePageSelection('1',count),RangeError);
 assert.throws(()=>parsePageSelection('1'.repeat(MAX_ORDER_INPUT_LENGTH+1),5),RangeError);
 assert.throws(()=>parsePageSelection('1,'.repeat(MAX_PAGE_COUNT),MAX_PAGE_COUNT),RangeError);
 assert.deepEqual(parsePageSelection(`1-${MAX_PAGE_COUNT}`,MAX_PAGE_COUNT),allPagesIndices(MAX_PAGE_COUNT));
});
