import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {createAnchor,deriveRangeSegments} from '../src/anchors.js';
import highlight from '../src/registry/verbs/highlight.js';
test('one range entry clips endpoint DOM spans, covers middle, and reverses every segment',()=>{
 const texts=['Ignore head then selected start continues.','All middle content belongs.','Selected end then ignored tail.'];
 const docDigest='sha256:range-dom',rangeAnchor={version:1,start:createAnchor({blockTexts:texts,blockIndex:0,tokenStart:3,tokenEnd:4,docDigest}),end:createAnchor({blockTexts:texts,blockIndex:2,tokenStart:0,tokenEnd:1,docDigest})};
 const dom=new JSDOM('<main></main>'),oldDocument=globalThis.document,oldFilter=globalThis.NodeFilter;
 globalThis.document=dom.window.document;globalThis.NodeFilter=dom.window.NodeFilter;
 try{
  const blocks=texts.map((text,index)=>{const p=document.createElement('p');p.dataset.block=String(index);p.textContent=text;document.querySelector('main').append(p);return p;});
  const entry={id:'one-range',arrival:'exact',rangeAnchor,resolvedAnchor:rangeAnchor.start,resolvedSegments:deriveRangeSegments(rangeAnchor,{blockTexts:texts,docDigest})};
  for(const block of blocks)highlight.applyEffect(block,entry);
  assert.deepEqual(blocks.map(b=>b.querySelector('mark').textContent),['selected start continues','All middle content belongs','Selected end']);
  assert.equal(document.querySelectorAll('.hl-fallback').length,0);
  for(const block of blocks)highlight.reverseEffect(block,entry);
  assert.equal(document.querySelectorAll('mark').length,0);assert.deepEqual(blocks.map(b=>b.textContent),texts);
 }finally{globalThis.document=oldDocument;globalThis.NodeFilter=oldFilter;dom.window.close();}
});
