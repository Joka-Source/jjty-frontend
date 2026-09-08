import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchEngine, createJsEngine, withResponsiveCursor } from '../src/engine.js';

const blocks = ['The deposit is one months rent.', 'Report failures promptly to the landlord.'];
test('cursor follows a distinctive isolated word after cumulative unrelated reading', async () => {
  const {engine} = await createMatchEngine('js', blocks);
  assert.equal(engine.follow('The deposit is one months rent').blockIndex, 0);
  const jump=engine.follow('The deposit is one months rent and failures');
  assert.equal(jump?.blockIndex,1);
  assert.equal(jump.start,jump.end);
  assert.equal(jump.candidates.length,1);
  assert.equal(engine.follow('The deposit is one months rent and failures and failures')?.start,jump.start);
});
test('isolated common, numeric, short and repeated words do not recover', async () => {
  for(const word of ['the','one','1234','rent','failures']) {
    const {engine}=await createMatchEngine('js',['the one 1234 rent failures','rent failures']);
    assert.equal(engine.follow(word),null,word);
  }
});
test('full exact multiword phrase preserves original span and candidates',async()=>{
  const phrase='The deposit is one months rent';
  const raw=createJsEngine(blocks).follow(phrase);
  const {engine}=await createMatchEngine('js',blocks);
  assert.deepEqual(engine.follow(phrase),raw);
});

test('aligned confident fuzzy phrases keep their complete range',async()=>{
  const phrase='The depasit is one months rent';
  const raw=createJsEngine(blocks).follow(phrase);
  assert.ok(raw.confidence>=0.78);
  const {engine}=await createMatchEngine('js',blocks);
  assert.deepEqual(engine.follow(phrase),raw);
});
test('repeated jump word cannot recover to an arbitrary occurrence',async()=>{
  const {engine}=await createMatchEngine('js',[...blocks,'Review failures later.']);
  engine.follow('The deposit is one months rent');
  assert.equal(engine.follow('The deposit is one months rent and failures'),null);
});
test('shared adapter recovers exact suffixes over the real WASM kernel',async()=>{
  const {readFileSync}=await import('node:fs');
  const mod=await import('jt-core');
  mod.initSync({module:readFileSync(new URL('../node_modules/jt-core/jt_core_bg.wasm',import.meta.url))});
  const native=new mod.Engine(JSON.stringify(blocks));
  const engine=withResponsiveCursor({kind:'wasm',follow(text){
    const m=native.match_update(text);
    return m==null?null:{blockIndex:m.blockIndex,confidence:m.confidence,start:m.tokenStart,end:m.tokenEnd};
  },reset(){native.reset_position();}},blocks);
  try {
    assert.equal(engine.follow('The deposit is one months rent').blockIndex,0);
    const jump=engine.follow('The deposit is one months rent and failures');
    assert.equal(jump.blockIndex,1);assert.equal(jump.start,jump.end);
    engine.reset(); assert.equal(engine.follow('failures').start,jump.start);
    assert.equal(engine.follow('the'),null);
  } finally { native.free(); }
});
