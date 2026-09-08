import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';import {createHash}from'node:crypto';
import * as mupdf from'mupdf';import {exportCombinedPdf}from'../src/pdf-combined.js';import {inspectPdfForm}from'../src/pdf-forms.js';import {ingestPdfBrowser}from'../src/ingest.js';import {createMuPdfProvider}from'../src/pdf-engine.js';import {createAnchor}from'../src/anchors.js';
const fixture=new Uint8Array(readFileSync(new URL('./fixtures/jett-fillable.pdf',import.meta.url))),hash=b=>'sha256:'+createHash('sha256').update(b).digest('hex');
async function setup({existing=true,overlap=false}={}){
 const native=new mupdf.PDFDocument(fixture);let buffer,input;
 try{if(existing){const page=native.loadPage(0),note=page.createAnnotation('Text');try{note.setName('existing-note');note.setContents('Original reviewer note.');note.setRect(overlap?[52,140,72,160]:[4,40,24,60]);note.update();page.update();}finally{note.destroy();page.destroy();}}
 buffer=native.saveToBuffer({compress:true});input=new Uint8Array(buffer.asUint8Array());}finally{buffer?.destroy();native.destroy();}
 const source={id:'combined-fixture',...await ingestPdfBrowser(createMuPdfProvider(mupdf),input,{name:'combined.pdf'})},schema=await inspectPdfForm(input);
 const values=Object.fromEntries(schema.fields.map(f=>[f.key,f.name==='full_name'?'Ada Example':f.value]));
 const savedFormDraft={sourceDigest:source.provenance.contentDigest,values};
 const record={id:'heading-highlight',docId:source.id,kind:'act',act:'highlight',blockIndex:0,arrival:'exact',anchor:createAnchor({blockTexts:source.blocks.map(b=>b.text),blockIndex:0,tokenStart:0,tokenEnd:2,docDigest:source.provenance.contentDigest})};
 return{source,savedFormDraft,committedRecords:[record]};
}
test('combined export preserves original and local annotations with changed form values',async()=>{
 const request=await setup(),before=structuredClone(request),sourceHash=hash(request.source.sourceBytes);
 const {bytes,manifest}=await exportCombinedPdf(request);
 assert.equal(manifest.sourceDigest,sourceHash);assert.equal(manifest.outputDigest,hash(bytes));assert.equal(manifest.changedFieldCount,1);assert.equal(manifest.localAnnotationCount,1);assert.equal(manifest.annotationCount,2);
 assert.equal(manifest.fields.find(f=>f.name==='full_name').value,'Ada Example');assert.ok(manifest.annotations.some(a=>a.id==='existing-note'&&a.contents==='Original reviewer note.'));assert.ok(manifest.annotations.some(a=>a.id==='jett:heading-highlight'));
 assert.deepEqual(request,before);assert.equal(hash(request.source.sourceBytes),sourceHash);
});
test('all-field draft ignores unchanged required checkbox and supports explicit form-only after undo',async()=>{
 const request=await setup();request.committedRecords.push({id:'undo',kind:'undo',act:'undo',docId:request.source.id,undoes:'heading-highlight'});
 await assert.rejects(exportCombinedPdf(request),/NO_EXPORTABLE_ANNOTATIONS/);
 const {manifest}=await exportCombinedPdf({...request,allowFormOnly:true});assert.equal(manifest.localAnnotationCount,0);assert.equal(manifest.committedMarkCount,0);assert.equal(manifest.changedFieldCount,1);assert.equal(manifest.annotationCount,1);
});
test('wrong draft and source digest refuse composition without altering inputs',async()=>{
 const request=await setup();
 await assert.rejects(exportCombinedPdf({...request,savedFormDraft:{...request.savedFormDraft,sourceDigest:'sha256:wrong'}}),/COMBINED_DRAFT_DIGEST_MISMATCH/);
 await assert.rejects(exportCombinedPdf({...request,source:{...request.source,provenance:{contentDigest:'sha256:wrong'}}}),/COMBINED_SOURCE_DIGEST_MISMATCH/);
});
test('annotations on changed widgets refuse unsafe composition',async()=>{
 const request=await setup({overlap:true});await assert.rejects(exportCombinedPdf(request),/COMBINED_MARK_OVERLAPS_CHANGED_WIDGET/);
});
test('final combined readback detects original annotation lost during form serialization',async()=>{
 const request=await setup(),save=mupdf.PDFDocument.prototype.saveToBuffer;let writes=0;
 mupdf.PDFDocument.prototype.saveToBuffer=function(...args){
  if(++writes===2){const page=this.loadPage(0);const items=[...page.getAnnotations()];try{for(const a of items)if(a.getName()==='existing-note')page.deleteAnnotation(a);}finally{for(const a of items)a.destroy();page.destroy();}}
  return save.apply(this,args);
 };
 try{await assert.rejects(exportCombinedPdf(request),/COMBINED_ANNOTATIONS_CHANGED/);}finally{mupdf.PDFDocument.prototype.saveToBuffer=save;}
});
test('full draft rejects inconsistent shared widgets even if one retains its old value',async()=>{
 const request=await setup(),fields=(await inspectPdfForm(request.source.sourceBytes)).fields.filter(f=>f.name==='reference');
 request.savedFormDraft.values[fields[0].key]='changed-only-on-one-widget';
 await assert.rejects(exportCombinedPdf(request),/CONFLICTING_SHARED_FORM_VALUES/);
});
test('field schema drift introduced by annotation serialization is detected',async()=>{
 const request=await setup(),save=mupdf.PDFDocument.prototype.saveToBuffer;let writes=0;
 mupdf.PDFDocument.prototype.saveToBuffer=function(...args){
  if(++writes===1){const trailer=this.getTrailer(),field=trailer.get('Root','AcroForm','Fields',0);try{field.put('Ff',1);}finally{field.destroy();trailer.destroy();}}
  return save.apply(this,args);
 };
 try{await assert.rejects(exportCombinedPdf(request),/COMBINED_FIELD_SCHEMA_CHANGED/);}finally{mupdf.PDFDocument.prototype.saveToBuffer=save;}
});
