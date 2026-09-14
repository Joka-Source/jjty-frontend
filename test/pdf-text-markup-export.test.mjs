import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as mupdf from 'mupdf';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {exportAnnotatedPdf} from '../src/pdf-annotations.js';
import {exportCombinedPdf} from '../src/pdf-combined.js';
import {inspectPdfForm} from '../src/pdf-forms.js';
import {createAnchor} from '../src/anchors.js';
import {ingestPdfBrowser} from '../src/ingest.js';
import {createMuPdfProvider} from '../src/pdf-engine.js';
async function source(name='jett-range.pdf') {
 const bytes=new Uint8Array(readFileSync(new URL(`./fixtures/${name}`,import.meta.url)));
 return {id:name,...await ingestPdfBrowser(createMuPdfProvider(mupdf),bytes,{name})};
}
function mark(doc,act,markupColor,id=act,range=false){
 const common={blockTexts:doc.blocks.map(b=>b.text),docDigest:doc.provenance.contentDigest};
 const anchor=createAnchor({...common,blockIndex:0,tokenStart:0,tokenEnd:2});
 return {id,docId:doc.id,kind:'act',act,markupColor,blockIndex:0,arrival:'exact',anchor,...(range?{blockEnd:2,rangeAnchor:{version:1,start:anchor,end:createAnchor({...common,blockIndex:2,tokenStart:0,tokenEnd:3})}}:{})};
}
async function read(bytes){
 const task=getDocument({data:bytes.slice(),standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname});
 try{const pdf=await task.promise,items=[];for(let i=1;i<=pdf.numPages;i++)for(const a of await(await pdf.getPage(i)).getAnnotations())items.push({page:i,...a});return items;}finally{await task.destroy();}
}
test('independent PDF.js reads overlapping native markup types, named colors and cross-page quads',async()=>{
 const doc=await source(),before=doc.sourceBytes.slice();
 const records=[mark(doc,'highlight',undefined),mark(doc,'underline','blue','underline',true),mark(doc,'strikethrough','red','strike',true),mark(doc,'highlight','green','green'),mark(doc,'highlight','pink','pink')];
 const saved=await read(await exportAnnotatedPdf(doc,records));
 assert.equal(saved.length,9);assert.deepEqual(doc.sourceBytes,before);
 for(const [type,color,count] of [['Highlight',[255,217,0],1],['Underline',[51,140,255],3],['StrikeOut',[230,51,51],3],['Highlight',[51,191,89],1],['Highlight',[255,89,166],1]]){
  const items=saved.filter(a=>a.subtype===type&&a.color.every((v,i)=>Math.abs(v-color[i])<=1));assert.equal(items.length,count);
  for(const a of items){assert.ok(a.quadPoints.length>=8);assert.ok(Array.from(a.quadPoints).every(Number.isFinite));}
 }
 const underline=saved.filter(a=>a.subtype==='Underline'),strike=saved.filter(a=>a.subtype==='StrikeOut');
 assert.deepEqual(underline.map(a=>a.page),[1,2,3]);assert.deepEqual(underline.map(a=>a.quadPoints),strike.map(a=>a.quadPoints),'overlaps retain identical source geometry');
 const undone=await read(await exportAnnotatedPdf(doc,[...records,{kind:'undo',act:'undo',docId:doc.id,undoes:'underline'}]));
 assert.equal(undone.filter(a=>a.subtype==='Underline').length,0);assert.equal(undone.filter(a=>a.subtype==='StrikeOut').length,3);
});
test('underline-only combined export retains color and changed form answers',async()=>{
 const doc=await source('jett-fillable.pdf'),schema=await inspectPdfForm(doc.sourceBytes),field=schema.fields.find(f=>f.name==='full_name');
 const result=await exportCombinedPdf({source:doc,committedRecords:[mark(doc,'underline','pink')],savedFormDraft:{sourceDigest:doc.provenance.contentDigest,values:{[field.key]:'Ada Example'}}});
 const saved=await read(result.bytes),underline=saved.find(a=>a.subtype==='Underline');
 assert.ok(underline);assert.equal(result.manifest.committedMarkCount,1);assert.equal(result.manifest.changedFieldCount,1);
 assert.equal(saved.find(a=>a.fieldName==='full_name').fieldValue,'Ada Example');
 assert.ok(underline.color.every((v,i)=>Math.abs(v-[255,89,166][i])<=1));
});
test('active invalid markup colors fail export and composition instead of dropping work',async()=>{
 const doc=await source();for(const act of ['highlight','underline','strikethrough']){
  const record=mark(doc,act,'not-a-color');
  await assert.rejects(exportAnnotatedPdf(doc,[record]));await assert.rejects(exportCombinedPdf({source:doc,committedRecords:[record],allowFormOnly:true}));
 }
});
test('serialized color or opacity corruption is rejected',async()=>{
 const doc=await source(),save=mupdf.PDFDocument.prototype.saveToBuffer;
 for(const corruption of ['color','opacity']){
  mupdf.PDFDocument.prototype.saveToBuffer=function(...args){const page=this.loadPage(0),items=page.getAnnotations();try{for(const a of items){if(corruption==='color')a.setColor([0,0,0]);else a.setOpacity(1);a.update();}page.update();return save.apply(this,args);}finally{items.forEach(a=>a.destroy());page.destroy();}};
  try{await assert.rejects(exportAnnotatedPdf(doc,[mark(doc,'underline','blue')]),/ANNOTATION_SERIALIZED_STYLE_FAILED/);}finally{mupdf.PDFDocument.prototype.saveToBuffer=save;}
 }
});
