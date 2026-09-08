import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';import * as mupdf from'mupdf';import {getDocument}from'pdfjs-dist/legacy/build/pdf.mjs';
import {reorderPdfPages}from'../src/pdf-reorder.js';import {fillPdfForm,inspectPdfForm}from'../src/pdf-forms.js';
const plain=new Uint8Array(readFileSync(new URL('./fixtures/jett-annotations.pdf',import.meta.url))),forms=new Uint8Array(readFileSync(new URL('./fixtures/jett-fillable.pdf',import.meta.url)));
function edit(bytes,fn,options={}){const doc=new mupdf.PDFDocument(bytes.slice());doc.disableJS();try{fn(doc);const buffer=doc.saveToBuffer(options);try{return new Uint8Array(buffer.asUint8Array());}finally{buffer.destroy();}}finally{doc.destroy();}}
async function read(bytes){const task=getDocument({data:bytes.slice(),standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname});try{const pdf=await task.promise,pages=[];for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),text=await page.getTextContent(),annotations=await page.getAnnotations();pages.push({text:text.items.filter(i=>'str'in i).map(i=>i.str).join('|'),view:page.view,rotate:page.rotate,annotations:annotations.map(a=>({subtype:a.subtype,contents:a.contentsObj?.str??'',rect:a.rect,fieldName:a.fieldName,fieldValue:a.fieldValue}))});}return {pages,fields:await pdf.getFieldObjects()};}finally{await task.destroy();}}
test('complete permutation preserves physical page content and rotated geometry with independent PDF.js readback',async()=>{
 const original=plain.slice(),before=await read(plain),order=[2,0,1];const output=await reorderPdfPages(plain,order),after=await read(output);
 assert.deepEqual(plain,original);assert.deepEqual(after.pages,order.map(i=>before.pages[i]));assert.deepEqual(await reorderPdfPages(plain,[0,1,2]),plain);
});
test('filled forms and existing annotations remain on their original pages after reorder',async()=>{
 const schema=await inspectPdfForm(forms),key=schema.fields.find(f=>f.name==='full_name').key;const filled=await fillPdfForm(forms,{[key]:'Reordered reader'});
 const marked=edit(filled,doc=>{const page=doc.loadPage(0),note=page.createAnnotation('Text');try{note.setName('reorder-note');note.setContents('Unicode नमस्ते\nOriginal page one');note.setRect([20,20,40,40]);page.update();}finally{note.destroy();page.destroy();}});
 const original=marked.slice(),before=await read(marked);const output=await reorderPdfPages(marked,[1,0]),after=await read(output);
 assert.deepEqual(marked,original);assert.deepEqual(after.pages,[before.pages[1],before.pages[0]]);assert.equal(after.fields.full_name[0].value,'Reordered reader');
 assert.equal((await inspectPdfForm(output)).fields.find(f=>f.name==='full_name').value,'Reordered reader');
});
test('missing, duplicate, fractional, sparse and out-of-bounds page orders fail before mutation',async()=>{
 for(const order of [[],[0,1],[0,1,1],[0,1,3],[0,1,-1],[0,1,2.5],new Array(3),null])await assert.rejects(reorderPdfPages(plain,order),/REORDER_INVALID_ORDER/);
 await assert.rejects(reorderPdfPages(new Array(3),[0]),/REORDER_INVALID_BYTES/);
});
test('protected, encrypted, dynamic and unverified advanced structures fail closed',async()=>{
 for(const key of ['Perms','XFA','CO','PageLabels','Outlines','Names','StructTreeRoot','Dests','OpenAction']){
 const modified=edit(forms,doc=>{const trailer=doc.getTrailer(),root=trailer.get('Root'),form=root.get('AcroForm');try{if(key==='XFA')form.put(key,'dynamic');else if(key==='CO')form.put(key,[1]);else root.put(key,{});}finally{form.destroy();root.destroy();trailer.destroy();}});
 await assert.rejects(reorderPdfPages(modified,[1,0]),/REORDER_(DOCUMENT_RESTRICTED|ADVANCED_STRUCTURE_UNSUPPORTED)/);
 }
 const encrypted=edit(forms,()=>{},{encrypt:'aes-256','owner-password':'owner','user-password':''});await assert.rejects(reorderPdfPages(encrypted,[1,0]),/REORDER_DOCUMENT_RESTRICTED/);
});
test('reopened unchanged or corrupted output cannot masquerade as a successful reorder',async()=>{
 const save=mupdf.PDFDocument.prototype.saveToBuffer;mupdf.PDFDocument.prototype.saveToBuffer=function(){return new mupdf.Buffer(plain);};
 try{await assert.rejects(reorderPdfPages(plain,[2,0,1]),/REORDER_CONTENT_CHANGED/);}finally{mupdf.PDFDocument.prototype.saveToBuffer=save;}
});

test('assembly denial and populated signature fields reject reordering',async()=>{
 const permission=mupdf.PDFDocument.prototype.hasPermission;mupdf.PDFDocument.prototype.hasPermission=function(name){return name!=='assemble';};
 try{await assert.rejects(reorderPdfPages(plain,[2,0,1]),/REORDER_PERMISSION_DENIED/);}finally{mupdf.PDFDocument.prototype.hasPermission=permission;}
 const signed=edit(forms,doc=>{const trailer=doc.getTrailer(),root=trailer.get('Root'),form=root.get('AcroForm'),fields=form.get('Fields'),sig=doc.newDictionary(),name=doc.newName('Sig');try{sig.put('FT',name);sig.put('V',{ByteRange:[0,10,20,30]});fields.push(sig);}finally{for(const object of [name,sig,fields,form,root,trailer])object.destroy();}});
 await assert.rejects(reorderPdfPages(signed,[1,0]),/REORDER_DOCUMENT_RESTRICTED/);
});
