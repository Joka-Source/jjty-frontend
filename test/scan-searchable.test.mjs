import test from 'node:test';import assert from 'node:assert/strict';import * as m from 'mupdf';
import {createScanSession,MemoryScanStore} from '../packages/jt-scan/session.js';
function image(){const p=new m.Pixmap(m.ColorSpace.DeviceRGB,[0,0,300,400],false);p.clear(240);try{return new Uint8Array(p.asPNG());}finally{p.destroy();}}
test('positioned OCR is searchable without changing visible page pixels',async()=>{
 const source=image(),make=async ocr=>{const s=await createScanSession({store:new MemoryScanStore(),ocr});await s.addPage(source);return s.finish();};
 const plain=await make(),recognized=await make(async()=>({text:'SCAN SOURCE 2026',lines:[{text:'SCAN SOURCE 2026',bounds:[.1,.2,.8,.1]}]}));
 const a=new m.PDFDocument(plain.pdfBytes),b=new m.PDFDocument(recognized.pdfBytes);let ap,bp,ar,br,st;
 try{ap=a.loadPage(0);bp=b.loadPage(0);st=bp.toStructuredText();assert.match(st.asText(),/SCAN SOURCE 2026/);assert.equal(recognized.ocr.status,'searchable');ar=ap.toPixmap(m.Matrix.identity,m.ColorSpace.DeviceRGB,false);br=bp.toPixmap(m.Matrix.identity,m.ColorSpace.DeviceRGB,false);assert.deepEqual(br.getPixels(),ar.getPixels());}finally{st?.destroy();ar?.destroy();br?.destroy();ap?.destroy();bp?.destroy();a.destroy();b.destroy();}
});
test('invalid OCR geometry is never silently embedded',async()=>{
 const s=await createScanSession({store:new MemoryScanStore(),ocr:async()=>({text:'outside',lines:[{text:'outside',bounds:[0,0,3,1]}]})});await s.addPage(image());const out=await s.finish();assert.notEqual(out.ocr.status,'searchable');assert.ok(out.diagnostics.some(d=>d.code==='OCR_NOT_EMBEDDED'));
});
test('unsupported script remains an explicit sidecar rather than a corrupt text layer',async()=>{
 const s=await createScanSession({store:new MemoryScanStore(),ocr:async()=>({text:'नमस्ते',lines:[{text:'नमस्ते',bounds:[.1,.1,.8,.1]}]})});await s.addPage(image());const out=await s.finish();assert.equal(out.ocr.status,'sidecar-only');assert.equal(out.ocr.pages[0].text,'नमस्ते');assert.ok(out.diagnostics.some(d=>d.code==='OCR_NOT_EMBEDDED'));
});
