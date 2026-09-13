import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from 'mupdf';
import {createScanSession,MemoryScanStore} from '../packages/jt-scan/session.js';
function image(){const p=new m.Pixmap(m.ColorSpace.DeviceRGB,[0,0,32,48],false);try{p.clear(230);return new Uint8Array(p.asPNG());}finally{p.destroy();}}
const processor=async bytes=>({bytes:bytes.slice(),mime:'image/png',width:32,height:48});
test('ordered pages become real PDF and custody copies survive caller mutation and recovery',async()=>{
 const store=new MemoryScanStore(),s=await createScanSession({store,processor,id:'fixture'}),a=image(),original=a.slice();
 const id=await s.addPage(a);a.fill(0);await s.addPage(image());
 const restored=await createScanSession({store,processor,id:'fixture'});
 const result=await restored.finish({title:'My scan'});assert.deepEqual(result.sourceAssets[0].bytes,original);assert.equal(result.sourceAssets[0].pageId,id);
 const d=new m.PDFDocument(result.pdfBytes);try{assert.equal(d.countPages(),2);}finally{d.destroy();}
 result.sourceAssets[0].bytes.fill(0);const again=await restored.finish();assert.deepEqual(again.sourceAssets[0].bytes,original);
 assert.equal(result.ocr.status,'unsupported');assert.equal(result.mime,'application/pdf');
});
test('failed checkpoint does not publish page and corrupt images cannot enter session',async()=>{
 const store=new MemoryScanStore(),s=await createScanSession({store,processor});
 await assert.rejects(s.addPage(new Uint8Array([1,2,3])),/SCAN_/);
 store.save=async()=>{throw new Error('quota');};await assert.rejects(s.addPage(image()),/quota/);assert.equal(s.pages.length,0);
});
test('cancel during processing retains originals and discards late derived result',async()=>{
 let release;const store=new MemoryScanStore(),s=await createScanSession({store,processor:bytes=>new Promise(r=>{release=()=>r({bytes,mime:'image/png',width:32,height:48});})});
 await s.addPage(image());const pending=s.finish();await new Promise(r=>setTimeout(r,5));s.cancel();release();await assert.rejects(pending,/SCAN_CANCELLED/);assert.equal(s.pages.length,1);
});
test('retake retains prior source as superseded and edits can be recovered',async()=>{
 const store=new MemoryScanStore(),s=await createScanSession({store,processor,id:'retake'});const id=await s.addPage(image());
 await s.editPage(id,{rotation:90,enhance:true});await s.retakePage(id,image());
 const r=await createScanSession({store,processor,id:'retake'});const out=await r.finish();assert.equal(out.sourceAssets.length,2);assert.equal(out.sourceAssets[0].status,'superseded');assert.equal(r.pages.length,1);
});
test('failure in OCR is honest and does not prevent saving readable image PDF',async()=>{
 const s=await createScanSession({store:new MemoryScanStore(),processor,ocr:async()=>{throw new Error('engine absent');}});await s.addPage(image());const out=await s.finish();assert.equal(out.ocr.status,'failed');assert.ok(out.pdfBytes.length>100);
});
test('restore refuses duplicate pages and broken source references before processing',async()=>{
 const store=new MemoryScanStore(),s=await createScanSession({store,processor,id:'invalid'});await s.addPage(image());
 const original=await store.load('invalid');
 for(const mutate of [v=>v.pages.push({...v.pages[0]}),v=>v.pages[0].assetId='missing',v=>v.pages[0].rotation=45,v=>v.assets[0].status='removed']){
  const state=structuredClone(original);mutate(state);await store.save('invalid',state);await assert.rejects(createScanSession({store,processor,id:'invalid'}),/SCAN_CHECKPOINT/);
 }
});
test('OCR provider cannot forge page identity or source provenance',async()=>{
 const s=await createScanSession({store:new MemoryScanStore(),processor,ocr:async()=>({text:'Read',pageId:'forged',sourceSha256:'forged'})});const id=await s.addPage(image());const out=await s.finish();assert.equal(out.ocr.pages[0].pageId,id);assert.equal(out.ocr.pages[0].sourceSha256,out.sourceAssets[0].sha256);
});
test('review gets a custody copy and page ordering persists',async()=>{
 const store=new MemoryScanStore(),s=await createScanSession({store,processor,id:'review'}),a=await s.addPage(image()),b=await s.addPage(image());
 const source=s.source(a);source.bytes.fill(0);assert.notEqual(s.source(a).bytes[0],0);await s.movePage(b,0);assert.deepEqual((await createScanSession({store,processor,id:'review'})).pages.map(p=>p.id),[b,a]);await assert.rejects(s.movePage(a,-1),/SCAN_ORDER/);
});
