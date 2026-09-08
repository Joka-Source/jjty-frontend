import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';import * as mupdf from'mupdf';
import {rotatePdfPages}from'../src/pdf-rotation.js';import {fillPdfForm,inspectPdfForm}from'../src/pdf-forms.js';
const original=new Uint8Array(readFileSync(new URL('./fixtures/jett-fillable.pdf',import.meta.url)));
function edit(bytes,fn,options={}){const doc=new mupdf.PDFDocument(bytes.slice());doc.disableJS();try{fn(doc);const buffer=doc.saveToBuffer(options);try{return new Uint8Array(buffer.asUint8Array());}finally{buffer.destroy();}}finally{doc.destroy();}}
function native(bytes){const doc=new mupdf.PDFDocument(bytes),pages=[];try{for(let i=0;i<doc.countPages();i++){const page=doc.loadPage(i),obj=page.getObject(),angle=obj.getInheritable('Rotate'),annots=obj.get('Annots'),contents=obj.get('Contents');try{
 const annotations=[];for(let n=0;n<annots.length;n++){const a=annots.get(n),rect=a.get('Rect'),v=a.get('V'),q=a.get('QuadPoints'),text=a.get('Contents');try{annotations.push({rect:rect.toString(),value:v.toString(),quads:q.toString(),contents:text.toString()});}finally{for(const item of [text,q,v,rect,a])item.destroy();}}
 let content='';if(contents.isStream()){const b=contents.readStream();try{content=Array.from(b.asUint8Array()).join(',');}finally{b.destroy();}}
 pages.push({angle:angle.isNull()?0:angle.asNumber(),annotations,content,bounds:page.getBounds()});
 }finally{for(const item of [contents,annots,angle,obj,page])item.destroy();}}return pages;}finally{doc.destroy();}}
test('rotation keeps exact source immutable and preserves native fields, annotations and content',async()=>{
 const schema=await inspectPdfForm(original),key=schema.fields.find(f=>f.name==='full_name').key;
 const filled=await fillPdfForm(original,{[key]:'Rotation reader'});
 const marked=edit(filled,doc=>{const page=doc.loadPage(0),note=page.createAnnotation('Text');try{note.setContents('Unicode नमस्ते\nLiteral <script>');note.setRect([20,20,40,40]);note.setName('existing-note');page.update();}finally{note.destroy();page.destroy();}});
 const before=marked.slice(),data=native(marked);const output=await rotatePdfPages(marked,[{pageIndex:0,quarterTurns:1}]);
 assert.deepEqual(marked,before);const after=native(output);assert.equal(after[0].angle,90);assert.equal(after[1].angle,data[1].angle);
 for(let i=0;i<data.length;i++){assert.deepEqual(after[i].annotations,data[i].annotations);assert.equal(after[i].content,data[i].content);}
 assert.equal((await inspectPdfForm(output)).fields.find(f=>f.name==='full_name').value,'Rotation reader');
 assert.deepEqual(after[0].bounds.slice(2),[data[0].bounds[3],data[0].bounds[2]]);
});
test('inherited rotations change only requested leaf and normalize negative/full-turn values',async()=>{
 const inherited=edit(original,doc=>{const page=doc.loadPage(0),obj=page.getObject(),parent=obj.get('Parent');try{parent.put('Rotate',-90);for(let i=0;i<doc.countPages();i++){const p=doc.loadPage(i),o=p.getObject();try{o.delete('Rotate');}finally{o.destroy();p.destroy();}}}finally{parent.destroy();obj.destroy();page.destroy();}});
 const output=await rotatePdfPages(inherited,[{pageIndex:0,quarterTurns:5}]);const pages=native(output);assert.equal(pages[0].angle,0);assert.equal(pages[1].angle,-90);
 const again=await rotatePdfPages(output,[{pageIndex:0,quarterTurns:-1}]);assert.equal(native(again)[0].angle,270);
 assert.deepEqual(await rotatePdfPages(original,[]),original);
});
test('invalid pages, duplicate requests, fractional turns and malformed inherited angles fail closed',async()=>{
 await assert.rejects(rotatePdfPages(new Array(3),[]),/ROTATION_INVALID_BYTES/);
 for(const changes of [[{pageIndex:-1,quarterTurns:1}],[{pageIndex:100,quarterTurns:1}],[{pageIndex:0,quarterTurns:0.5}],[{pageIndex:0,quarterTurns:1},{pageIndex:0,quarterTurns:2}]])await assert.rejects(rotatePdfPages(original,changes),/ROTATION_/);
 const malformed=edit(original,doc=>{const page=doc.loadPage(0),obj=page.getObject();try{obj.put('Rotate',45);}finally{obj.destroy();page.destroy();}});await assert.rejects(rotatePdfPages(malformed,[{pageIndex:0,quarterTurns:1}]),/ROTATION_INVALID_EXISTING_ANGLE/);
});
test('signature protection, dynamic forms and encryption remain uneditable',async()=>{
 for(const key of ['Perms','XFA','CO']){
 const bytes=edit(original,doc=>{const trailer=doc.getTrailer(),root=trailer.get('Root'),form=root.get('AcroForm');try{if(key==='Perms')root.put('Perms',{});else form.put(key,key==='CO'?[1]:'dynamic');}finally{form.destroy();root.destroy();trailer.destroy();}});
 await assert.rejects(rotatePdfPages(bytes,[{pageIndex:0,quarterTurns:1}]),/ROTATION_DOCUMENT_RESTRICTED/);
 }
 const encrypted=edit(original,()=>{},{encrypt:'aes-256','owner-password':'owner','user-password':'reader'});await assert.rejects(rotatePdfPages(encrypted,[{pageIndex:0,quarterTurns:1}]),/ROTATION_DOCUMENT_RESTRICTED/);
});

test('serialized rotation or unrelated content loss is rejected, never returned as success',async()=>{
 const save=mupdf.PDFDocument.prototype.saveToBuffer;
 mupdf.PDFDocument.prototype.saveToBuffer=function(){return new mupdf.Buffer(original);};
 try{await assert.rejects(rotatePdfPages(original,[{pageIndex:0,quarterTurns:1}]),/ROTATION_READBACK_FAILED/);}finally{mupdf.PDFDocument.prototype.saveToBuffer=save;}
 const changed=edit(original,doc=>{const page=doc.loadPage(0),obj=page.getObject();try{obj.put('Rotate',90);const stream=doc.addStream('q Q',{});try{obj.put('Contents',stream);}finally{stream.destroy();}}finally{obj.destroy();page.destroy();}});
 mupdf.PDFDocument.prototype.saveToBuffer=function(){return new mupdf.Buffer(changed);};
 try{await assert.rejects(rotatePdfPages(original,[{pageIndex:0,quarterTurns:1}]),/ROTATION_CONTENT_CHANGED/);}finally{mupdf.PDFDocument.prototype.saveToBuffer=save;}
});
test('page assembly permission is checked independently of form editing permission',async()=>{
 const permission=mupdf.PDFDocument.prototype.hasPermission;
 mupdf.PDFDocument.prototype.hasPermission=function(name){return name!=='assemble';};
 try{await assert.rejects(rotatePdfPages(original,[{pageIndex:0,quarterTurns:1}]),/ROTATION_PERMISSION_DENIED/);}finally{mupdf.PDFDocument.prototype.hasPermission=permission;}
});
