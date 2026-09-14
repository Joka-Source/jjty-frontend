import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {TEXT_MARKUP_ACTS,MARKUP_COLORS,normalizeMarkupColor,markupColorRgb} from '../src/text-markup.js';
import {makeActEntry} from '../src/records.js';
import {verbRegistry} from '../src/registry/index.js';
import {createAnchor,deriveRangeSegments} from '../src/anchors.js';
import {validateCursor,validateReceipt} from './validate.mjs';
import {encodeLibraryBackup,decodeLibraryBackup} from '../src/library-backup.js';
import {createHash} from 'node:crypto';

test('text markup records retain actual act and validated color outside schema-pure receipts',()=>{
 assert.equal(normalizeMarkupColor(undefined),'yellow');assert.deepEqual(markupColorRgb(null),[1,.85,0]);
 for(const invalid of ['purple','RED','',0,{},[1,0,0]])assert.throws(()=>normalizeMarkupColor(invalid),/color/);
 for(const act of TEXT_MARKUP_ACTS)for(const color of MARKUP_COLORS){
  const entry=makeActEntry({docId:'doc',revision:1,blockIndex:0,act,markupColor:color.id,modality:'pointer',evidence:'Selected words'});
  assert.equal(entry.act,act);assert.equal(entry.verbId,act);assert.equal(entry.markupColor,color.id);
  assert.ok(validateCursor(entry.cursor));assert.ok(validateReceipt(entry.receipt));assert.equal(entry.cursor.markupColor,undefined);assert.equal(entry.receipt.markupColor,undefined);
  const range=makeActEntry({docId:'doc',revision:1,blockIndex:0,verbId:`${act}-range`,markupColor:color.id,modality:'pointer',evidence:'Selected range'});
  assert.equal(range.act,act);assert.equal(range.verbId,`${act}-range`);assert.equal(verbRegistry.get(`${act}-range`).effectVerbId,act);
  assert.throws(()=>makeActEntry({docId:'doc',revision:1,blockIndex:0,act,markupColor:'oops'}),/color/);
 }
});

test('overlapping PDF text markup keeps item identity and survives independent undo in either order',()=>{
 const dom=new JSDOM('<div class="pdf-text-layer" data-block="0"><span data-pdf-item="0">Alpha beta </span><span data-pdf-item="1">gamma delta.</span></div>');
 const before={document:globalThis.document,NodeFilter:globalThis.NodeFilter};globalThis.document=dom.window.document;globalThis.NodeFilter=dom.window.NodeFilter;
 try{
  const block=document.querySelector('div');block.dataset.blockText=block.textContent;const items=[...block.children];
  for(const order of [[0,1,2],[2,1,0]]){
   const entries=TEXT_MARKUP_ACTS.map((act,index)=>({id:`m${index}`,act,markupColor:MARKUP_COLORS[index].id,arrival:'exact',resolvedAnchor:{blockIndex:0,tokenStart:index===0?0:1,tokenEnd:index===2?3:2}}));
   for(const entry of entries)verbRegistry.get(entry.act).applyEffect(block,entry);
   assert.equal(block.textContent,'Alpha beta gamma delta.');assert.equal(block.querySelector('[data-markup="underline"]').style.textDecorationLine,'underline');assert.equal(block.querySelector('[data-markup="strikethrough"]').style.textDecorationLine,'line-through');
   assert.equal(block.querySelector('[data-markup="highlight"]').style.backgroundColor,'rgba(255, 217, 0, 0.4)');
   assert.equal(block.querySelector('[data-markup="underline"]').style.textDecorationColor,'rgba(51, 191, 89, 0.4)');
   assert.equal(block.querySelector('[data-markup="strikethrough"]').style.textDecorationColor,'rgba(51, 140, 255, 0.4)');
   for(const index of order){verbRegistry.get(entries[index].act).reverseEffect(block,entries[index]);assert.equal(block.querySelector(`[data-entry="m${index}"]`),null);assert.equal(block.textContent,'Alpha beta gamma delta.');assert.deepEqual([...block.children],items);}
  }
 }finally{Object.assign(globalThis,before);dom.window.close();}
});

test('backup round trip retains every markup color and rejects malformed style before restore',async()=>{
 const text='Alpha beta gamma delta.',sourceBytes=new TextEncoder().encode(text),digest='sha256:'+createHash('sha256').update(sourceBytes).digest('hex'),at='2026-09-09T00:00:00.000Z';
 const doc={id:'markup-backup',title:'Markup',text,sourceBytes,createdAt:at,revision:1,blocks:[{text,index:0,kind:'paragraph'}],provenance:{contentDigest:digest,byteSize:sourceBytes.length,sourceKind:'text',capturedAt:at}};
 const anchor=createAnchor({blockTexts:[text],blockIndex:0,tokenStart:0,tokenEnd:1,docDigest:digest});
 const records=TEXT_MARKUP_ACTS.map((act,index)=>makeActEntry({docId:doc.id,revision:1,blockIndex:0,act,markupColor:MARKUP_COLORS[index].id,anchor,modality:'pointer',evidence:'Selected words',at}));
 const restored=await decodeLibraryBackup(await encodeLibraryBackup({docs:[doc],records,positions:[]}));
 assert.deepEqual(restored.records.map(({act,markupColor})=>({act,markupColor})),records.map(({act,markupColor})=>({act,markupColor})));
 records[0].markupColor='oops';await assert.rejects(encodeLibraryBackup({docs:[doc],records,positions:[]}),/BACKUP_INVALID_MARKUP_COLOR/);
 delete records[0].markupColor;const legacy=await decodeLibraryBackup(await encodeLibraryBackup({docs:[doc],records,positions:[]}));assert.equal(legacy.records[0].markupColor,undefined);assert.equal(normalizeMarkupColor(legacy.records[0].markupColor),'yellow');
});

test('each range effect clips endpoints and reverses all segments accurately',()=>{
 const texts=['Prefix selected start here.','Middle words.','Selected end suffix.'],docDigest='sha256:range';
 const rangeAnchor={version:1,start:createAnchor({blockTexts:texts,blockIndex:0,tokenStart:1,tokenEnd:2,docDigest}),end:createAnchor({blockTexts:texts,blockIndex:2,tokenStart:0,tokenEnd:1,docDigest})};
 const dom=new JSDOM('<main/>'),before={document:globalThis.document,NodeFilter:globalThis.NodeFilter};globalThis.document=dom.window.document;globalThis.NodeFilter=dom.window.NodeFilter;
 try{for(const act of TEXT_MARKUP_ACTS){
  const blocks=texts.map((text,index)=>{const block=document.createElement('p');block.dataset.block=String(index);block.textContent=text;return block;});
  const entry={id:'range',act,markupColor:'red',arrival:'exact',resolvedSegments:deriveRangeSegments(rangeAnchor,{blockTexts:texts,docDigest})},verb=verbRegistry.get(act);
  blocks.forEach(block=>verb.applyEffect(block,entry));assert.deepEqual(blocks.map(block=>block.querySelector('mark').textContent),['selected start here','Middle words','Selected end']);blocks.forEach(block=>verb.reverseEffect(block,entry));assert.deepEqual(blocks.map(block=>block.textContent),texts);
 }}finally{Object.assign(globalThis,before);dom.window.close();}
});

test('normalized single-block markup ranges keep source identity across backup restore',async()=>{
 const text='Alpha beta gamma delta.',originalBytes=new TextEncoder().encode(text),sourceBytes=new TextEncoder().encode(`${text}\n`),hash=bytes=>'sha256:'+createHash('sha256').update(bytes).digest('hex'),at='2026-09-09T00:00:00.000Z';
 const anchor=createAnchor({blockTexts:[text],blockIndex:0,tokenStart:0,tokenEnd:1,docDigest:hash(originalBytes)});
 const doc={id:'changed-range-source',title:'Markup',text,sourceBytes,createdAt:at,revision:2,blocks:[{text,index:0,kind:'paragraph'}],provenance:{contentDigest:hash(sourceBytes),byteSize:sourceBytes.length,sourceKind:'text',capturedAt:at}};
 const records=TEXT_MARKUP_ACTS.map(act=>makeActEntry({docId:doc.id,revision:1,blockIndex:0,verbId:`${act}-range`,anchor,modality:'pointer',evidence:'Selected range',at}));
 const restored=await decodeLibraryBackup(await encodeLibraryBackup({docs:[doc],records,positions:[]}));
 for(const record of restored.records){assert.equal(record.arrival,'lost',record.verbId);assert.equal(record.resolvedAnchor,undefined);}
});
