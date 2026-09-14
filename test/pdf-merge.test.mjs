import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as m from 'mupdf';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {mergePdfDocuments,inspectPdfMerge} from '../src/pdf-merge.js';
const plain=new Uint8Array(readFileSync(new URL('./fixtures/jett-annotations.pdf',import.meta.url)));
function edit(bytes,fn,options={}){const doc=new m.PDFDocument(bytes.slice());doc.disableJS();try{fn(doc);const buffer=doc.saveToBuffer(options);try{return new Uint8Array(buffer.asUint8Array());}finally{buffer.destroy();}}finally{doc.destroy();}}
async function read(bytes){const task=getDocument({data:bytes.slice(),standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname});try{const pdf=await task.promise,pages=[];for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);pages.push({text:(await page.getTextContent()).items.map(v=>v.str??'').join('|'),view:page.view,rotate:page.rotate,annotations:(await page.getAnnotations()).map(v=>({type:v.subtype,rect:v.rect,contents:v.contentsObj?.str,url:v.url}))});}return {pages,outlines:await pdf.getOutline()};}finally{await task.destroy();}}
function marked(){return edit(plain,doc=>{const page=doc.loadPage(1),note=page.createAnnotation('Text'),highlight=page.createAnnotation('Highlight');try{note.setContents('Merged नमस्ते');note.setName('merge-note');note.setRect([20,20,40,40]);highlight.setQuadPoints([[48,90,160,90,48,108,160,108]]);highlight.setName('merge-highlight');page.update();}finally{note.destroy();highlight.destroy();page.destroy();}});}

test('merges complete inputs in order with blank/rotated pages independently read by PDF.js',async()=>{
 const second=edit(plain,doc=>{const page=doc.loadPage(1),object=page.getObject();try{object.put('Rotate',180);}finally{object.destroy();page.destroy();}}),a=plain.slice(),b=second.slice();
 assert.deepEqual(await inspectPdfMerge([plain,second]),{allowed:true,reason:null,totalPages:6});
 const output=await mergePdfDocuments([plain,second]);
 assert.deepEqual((await read(output)).pages,[...(await read(plain)).pages,...(await read(second)).pages]);
 assert.deepEqual(plain,a);assert.deepEqual(second,b);assert.notEqual(output.buffer,plain.buffer);
});

test('native notes and highlight appearances survive grafting and serialization',async()=>{
 const input=marked(),before=input.slice();const result=await mergePdfDocuments([input,plain]);
 assert.deepEqual((await read(result)).pages,[...(await read(input)).pages,...(await read(plain)).pages]);assert.deepEqual(input,before);
});

test('annotation page ownership and local links point into their own source section',async()=>{
 const input=edit(plain,doc=>{const page=doc.loadPage(1),other=doc.loadPage(2),object=page.getObject(),target=other.getObject(),link=doc.addObject({}),type=doc.newName('Link'),fit=doc.newName('Fit');try{link.put('Subtype',type);link.put('Rect',[30,30,90,60]);link.put('P',object);link.put('Dest',[target,fit]);object.put('Annots',[link]);}finally{for(const v of[fit,type,link,target,object,other,page])v.destroy();}});
 const result=await mergePdfDocuments([input,input]);const doc=new m.PDFDocument(result);try{
  for(const start of[0,3]){const page=doc.loadPage(start+1),target=doc.loadPage(start+2),object=page.getObject(),targetObject=target.getObject(),annots=object.get('Annots'),link=annots.get(0),owner=link.get('P'),dest=link.get('Dest'),to=dest.get(0);try{assert.equal(owner.asIndirect(),object.asIndirect());assert.equal(to.asIndirect(),targetObject.asIndirect());}finally{for(const v of[to,dest,owner,link,annots,targetObject,object,target,page])v.destroy();}}
 }finally{doc.destroy();}
 const task=getDocument({data:result.slice(),standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname});try{const pdf=await task.promise;for(const [pageNo,target]of[[2,2],[5,5]]){const annots=await(await pdf.getPage(pageNo)).getAnnotations();assert.equal(await pdf.getPageIndex(annots[0].dest[0]),target);}}finally{await task.destroy();}
});

test('local outline titles and destinations are combined with source page offsets',async()=>{
 const input=edit(plain,doc=>{const trailer=doc.getTrailer(),root=trailer.get('Root'),tree=doc.addObject({Count:1}),chapter=doc.addObject({}),title=doc.newString('नमस्ते chapter'),fit=doc.newName('Fit');try{tree.put('First',chapter);tree.put('Last',chapter);chapter.put('Parent',tree);chapter.put('Title',title);chapter.put('Dest',[2,fit]);root.put('Outlines',tree);}finally{for(const v of[fit,title,chapter,tree,root,trailer])v.destroy();}});
 const output=await mergePdfDocuments([input,input]);const parsed=await read(output);assert.deepEqual(parsed.outlines.map(v=>[v.title,v.dest]),[['नमस्ते chapter',[2,{name:'Fit'}]],['नमस्ते chapter',[5,{name:'Fit'}]]]);
});

test('invalid inputs and protected/form/catalog structures refuse explicitly',async()=>{
 for(const inputs of[[],[plain],new Array(2),[plain,new Array(2)]])await assert.rejects(mergePdfDocuments(inputs),/MERGE_INVALID/);
 const forms=new Uint8Array(readFileSync(new URL('./fixtures/jett-fillable.pdf',import.meta.url)));
 assert.equal((await inspectPdfMerge([plain,forms])).reason,'MERGE_CATALOG_UNSUPPORTED');
 const encrypted=edit(plain,()=>{},{encrypt:'aes-256','owner-password':'owner','user-password':''});assert.equal((await inspectPdfMerge([plain,encrypted])).reason,'MERGE_DOCUMENT_RESTRICTED');
 for(const key of['Names','StructTreeRoot','OCProperties','PageLabels']){const input=edit(plain,doc=>{const trailer=doc.getTrailer(),root=trailer.get('Root');try{root.put(key,{});}finally{root.destroy();trailer.destroy();}});const status=await inspectPdfMerge([plain,input]);assert.equal(status.allowed,false);assert.equal(status.inputIndex,1);assert.equal(status.detail,key);}
});

test('a corrupted serialized merge is refused instead of returned',async()=>{
 const save=m.PDFDocument.prototype.saveToBuffer;m.PDFDocument.prototype.saveToBuffer=()=>new m.Buffer(plain);try{await assert.rejects(mergePdfDocuments([plain,plain]),/MERGE_CONTENT_CHANGED/);}finally{m.PDFDocument.prototype.saveToBuffer=save;}
});

test('inherited page geometry and first-source metadata survive the new page tree',async()=>{
 const input=edit(plain,doc=>{const page=doc.loadPage(0),object=page.getObject(),parent=object.get('Parent'),trailer=doc.getTrailer(),root=trailer.get('Root'),info=trailer.get('Info'),title=doc.newString('First source title');try{parent.put('Rotate',90);object.delete('Rotate');info.put('Title',title);trailer.put('Info',info);root.put('ViewerPreferences',{HideToolbar:true});}finally{for(const v of[title,info,root,trailer,parent,object,page])v.destroy();}});
 const padded=new Uint8Array(input.length+16);padded.set(input,8);const view=padded.subarray(8,8+input.length),before=padded.slice();
 const output=await mergePdfDocuments([view,plain]);assert.deepEqual((await read(output)).pages,[...(await read(input)).pages,...(await read(plain)).pages]);assert.deepEqual(padded,before);
 const task=getDocument({data:output.slice()});try{const pdf=await task.promise;assert.equal((await pdf.getMetadata()).info.Title,'First source title');assert.equal((await pdf.getViewerPreferences()).get('HideToolbar'),true);}finally{await task.destroy();}
});

test('correct page count alone cannot pass serialized preservation verification',async()=>{
 const valid=await mergePdfDocuments([plain,plain]);const changed=edit(valid,doc=>{const page=doc.loadPage(4),object=page.getObject();try{object.put('Rotate',180);}finally{object.destroy();page.destroy();}});
 const save=m.PDFDocument.prototype.saveToBuffer;m.PDFDocument.prototype.saveToBuffer=()=>new m.Buffer(changed);try{await assert.rejects(mergePdfDocuments([plain,plain]),/MERGE_CONTENT_CHANGED/);}finally{m.PDFDocument.prototype.saveToBuffer=save;}
 const permission=m.PDFDocument.prototype.hasPermission;m.PDFDocument.prototype.hasPermission=()=>false;try{assert.equal((await inspectPdfMerge([plain,plain])).reason,'MERGE_PERMISSION_DENIED');await assert.rejects(mergePdfDocuments([plain,plain]),/MERGE_PERMISSION_DENIED/);}finally{m.PDFDocument.prototype.hasPermission=permission;}
});

test('native-created blank PDFs merge without rejecting constructor metadata',async()=>{
 const doc=new m.PDFDocument();let bytes;try{const page=doc.addPage([0,0,240,320],90,{},'');try{doc.insertPage(-1,page);}finally{page.destroy();}const buffer=doc.saveToBuffer();try{bytes=new Uint8Array(buffer.asUint8Array());}finally{buffer.destroy();}}finally{doc.destroy();}
 const output=await mergePdfDocuments([bytes,plain]);assert.deepEqual((await read(output)).pages,[...(await read(bytes)).pages,...(await read(plain)).pages]);
});
