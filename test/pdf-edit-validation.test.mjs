import {readFileSync} from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';import * as m from 'mupdf';
import {inspectEditSource,assertEditRegion,verifyEditedPdf,EDIT_PIXEL_POLICY} from '../src/pdf-edit-validation.js';
function fixture({text='Hello world',outside='Unchanged footer',paint=false,rotate=0,tagged=false,annotation=false,crop=false}={}){
 const doc=new m.PDFDocument(),font=new m.Font('Helvetica'),f=doc.addSimpleFont(font);let page,object,buffer,ann,trailer,root;
 try{
  object=doc.addPage([0,0,300,400],rotate,{Font:{F1:f}},`BT /F1 16 Tf 40 285 Td (${text}) Tj ET BT /F1 12 Tf 40 70 Td (${outside}) Tj ET ${paint?'0 0 1 rg 250 20 20 20 re f':''}`);doc.insertPage(-1,object);if(crop)object.put('CropBox',[20,30,280,380]);
  if(tagged){trailer=doc.getTrailer();root=trailer.get('Root');root.put('StructTreeRoot',{});}
  if(annotation){page=doc.loadPage(0);ann=page.createAnnotation('Text');ann.setRect([45,95,65,115]);ann.setContents('Keep this note');ann.update();page.update();}
  buffer=doc.saveToBuffer();return new Uint8Array(buffer.asUint8Array());
 }finally{buffer?.destroy();ann?.destroy();page?.destroy();root?.destroy();trailer?.destroy();object?.destroy();f.destroy();font.destroy();doc.destroy();}
}
const before={x:40,top:310,w:150,h:40,text:'Hello world'},after={...before,text:'Hola world'};
test('independent readback accepts exact replacement and returns owned bytes',async()=>{
 const a=fixture(),b=fixture({text:after.text});const saved=await verifyEditedPdf(a,b,{pageIndex:0,before,after});assert.deepEqual(saved,b);assert.notEqual(saved,b);assert.deepEqual(a,fixture());assert.equal(EDIT_PIXEL_POLICY.channelTolerance,2);
});
test('text loss, changed surrounding text and collateral pixels fail independently',async()=>{
 const a=fixture();await assert.rejects(verifyEditedPdf(a,fixture(),{pageIndex:0,before,after}),/EDIT_REPLACEMENT_TEXT_MISMATCH/);
 await assert.rejects(verifyEditedPdf(a,fixture({text:after.text,outside:'Changed footer'}),{pageIndex:0,before,after}),/EDIT_SURROUNDING_TEXT_CHANGED/);
 await assert.rejects(verifyEditedPdf(a,fixture({text:after.text,paint:true}),{pageIndex:0,before,after}),/EDIT_OUTSIDE_PIXELS_CHANGED/);
});
test('page rotation changes and tagged input are rejected',async()=>{
 await assert.rejects(verifyEditedPdf(fixture(),fixture({text:after.text,rotate:90}),{pageIndex:0,before,after}),/EDIT_PAGE_SEMANTICS_CHANGED/);
 const metadata=await inspectEditSource(fixture({tagged:true}));assert.ok(metadata.restrictions.includes('tagged-document'));assert.throws(()=>assertEditRegion(metadata,0,before,after),/EDIT_DOCUMENT_RESTRICTED/);
});
test('both original and proposed rectangles protect annotations and widgets',async()=>{
 const metadata=await inspectEditSource(fixture({annotation:true}));assert.throws(()=>assertEditRegion(metadata,0,before,after),/EDIT_REGION_OVERLAPS_ANNOTATION/);
 const clean=await inspectEditSource(fixture());clean.pages[0].widgets=[[210,90,250,125]];
 assert.throws(()=>assertEditRegion(clean,0,before,{...after,x:205}),/EDIT_REGION_OUTSIDE_PAGE/);
 assert.throws(()=>assertEditRegion(clean,0,before,{...after,x:180,w:80}),/EDIT_REGION_OVERLAPS_WIDGET/);
 assert.throws(()=>assertEditRegion(clean,0,{...before,x:NaN},after),/EDIT_REGION_INVALID/);
});
test('native transforms preserve crop and each physical rotation coordinate system',async()=>{
 for(const rotate of [0,90,180,270]){
  const metadata=await inspectEditSource(fixture({rotate,crop:true}));const r=assertEditRegion(metadata,0,before,after);assert.equal(r.beforeRect.length,4);assert.ok(r.beforeRect.every(Number.isFinite));
  const expected=rotate%180?[40,150]:[150,40];assert.deepEqual([r.beforeRect[2]-r.beforeRect[0],r.beforeRect[3]-r.beforeRect[1]],expected);
 }
});

test('actual native widget metadata prevents editing its region',async()=>{
 const raw=new Uint8Array(readFileSync(new URL('./fixtures/jett-fillable.pdf',import.meta.url))),metadata=await inspectEditSource(raw);
 assert.equal(metadata.restrictions.length,0);const index=metadata.pages.findIndex(p=>p.widgets.length),page=metadata.pages[index],r=page.widgets[0],t=page.transform,det=t[0]*t[3]-t[1]*t[2];
 const points=[[r[0],r[1]],[r[2],r[3]]].map(([x,y])=>[(t[3]*(x-t[4])-t[2]*(y-t[5]))/det,(-t[1]*(x-t[4])+t[0]*(y-t[5]))/det]);
 const x=Math.min(...points.map(p=>p[0])),top=Math.max(...points.map(p=>p[1])),w=Math.abs(points[1][0]-points[0][0]),h=Math.abs(points[1][1]-points[0][1]);
 assert.throws(()=>assertEditRegion(metadata,index,{x,top,w,h,text:'before'},{x,top,w,h,text:'after'}),/EDIT_REGION_OVERLAPS_WIDGET/);
});
test('native annotation and form semantic changes cannot hide behind unchanged outside text',async()=>{
 const a=fixture(),d=new m.PDFDocument(fixture({text:after.text}));let p,n,buffer;let changed;
 try{p=d.loadPage(0);n=p.createAnnotation('Text');n.setRect([230,240,250,260]);n.setContents('Unexpected note');n.update();p.update();buffer=d.saveToBuffer();changed=new Uint8Array(buffer.asUint8Array());}finally{buffer?.destroy();n?.destroy();p?.destroy();d.destroy();}
 await assert.rejects(verifyEditedPdf(a,changed,{pageIndex:0,before,after}),/EDIT_PAGE_SEMANTICS_CHANGED/);
 const {inspectPdfForm,fillPdfForm}=await import('../src/pdf-forms.js');const form=new Uint8Array(readFileSync(new URL('./fixtures/jett-fillable.pdf',import.meta.url)));
 const schema=await inspectPdfForm(form),field=schema.fields.find(f=>f.type==='text'&&!f.readOnly&&!f.unsupported.length),edited=await fillPdfForm(form,{[field.key]:'Unexpected'});
 const empty={x:1,top:20,w:5,h:5,text:'unused'};
 await assert.rejects(verifyEditedPdf(form,edited,{pageIndex:0,before:empty,after:empty}),/EDIT_FORMS_CHANGED/);
});

function linked(bytes,uri,rect=[225,240,265,260]){
 const doc=new m.PDFDocument(bytes);let page,link,buffer;
 try{page=doc.loadPage(0);link=page.createLink(rect,uri);buffer=doc.saveToBuffer();return new Uint8Array(buffer.asUint8Array());}
 finally{buffer?.destroy();link?.destroy();page?.destroy();doc.destroy();}
}
test('native links are preserved independently of annotation API and protect both edit bounds',async()=>{
 const a=linked(fixture(),'https://example.com/original'),b=linked(fixture({text:after.text}),'https://example.com/original');
 const metadata=await inspectEditSource(a);assert.equal(metadata.pages[0].annotations.length,0);assert.equal(metadata.pages[0].links.length,1);
 await verifyEditedPdf(a,b,{pageIndex:0,before,after});
 for(const wrong of [fixture({text:after.text}),linked(fixture({text:after.text}),'https://example.com/changed')])await assert.rejects(verifyEditedPdf(a,wrong,{pageIndex:0,before,after}),/EDIT_PAGE_SEMANTICS_CHANGED/);
 const intersecting=await inspectEditSource(linked(fixture(),'https://example.com',[45,100,80,120]));assert.throws(()=>assertEditRegion(intersecting,0,before,after),/EDIT_REGION_OVERLAPS_LINK/);
 const proposed=await inspectEditSource(linked(fixture(),'https://example.com',[205,100,240,120]));assert.throws(()=>assertEditRegion(proposed,0,before,{...after,x:170,w:100}),/EDIT_REGION_OVERLAPS_LINK/);
});

function angledFixture({text='Hello world',paint=false,outside='A'}={}){
 const doc=new m.PDFDocument(),font=new m.Font('Helvetica'),ref=doc.addSimpleFont(font);let object,buffer;
 try{object=doc.addPage([0,0,300,400],0,{Font:{F1:ref}},`BT /F1 16 Tf .70710678 .70710678 -.70710678 .70710678 80 200 Tm (${text}) Tj ET BT /F1 3 Tf 70 270 Td (${outside}) Tj ET ${paint?'0 0 1 rg 70 265 4 4 re f':''}`);doc.insertPage(-1,object);buffer=doc.saveToBuffer();return new Uint8Array(buffer.asUint8Array());}
 finally{buffer?.destroy();object?.destroy();ref.destroy();font.destroy();doc.destroy();}
}
test('45 degree edit uses padded polygons, rejecting changed pixels and text inside the bounding box but outside the paragraph',async()=>{
 const c=Math.SQRT1_2,quad=[[-3,20],[110,20],[110,-6],[-3,-6]].flatMap(([x,y])=>[80+c*x-c*y,200+c*x+c*y]);
 const start={quad,text:'Hello world'},end={quad,text:'Hola world'},a=angledFixture(),b=angledFixture({text:end.text});
 assert.deepEqual(await verifyEditedPdf(a,b,{pageIndex:0,before:start,after:end}),b);
 await assert.rejects(verifyEditedPdf(a,angledFixture({text:end.text,paint:true}),{pageIndex:0,before:start,after:end}),/EDIT_OUTSIDE_PIXELS_CHANGED/);
 await assert.rejects(verifyEditedPdf(a,angledFixture({text:end.text,outside:'B'}),{pageIndex:0,before:start,after:end}),/EDIT_SURROUNDING_TEXT_CHANGED/);
 const meta=await inspectEditSource(a);
 for(const invalid of [[0,0,10,10,0,10,10,0],[0,0,1,1,2,2,3,3],[0,0,10,0,10,NaN,0,10]])assert.throws(()=>assertEditRegion(meta,0,{quad:invalid},end),/EDIT_REGION_INVALID/);
});
