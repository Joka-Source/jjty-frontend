import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import * as mupdf from 'mupdf';
import {exportAnnotatedPdf} from '../src/pdf-annotations.js';
import {createAnchor} from '../src/anchors.js';
import {tokenizeWithSpans} from '../src/match.js';
import {ingestPdfBrowser} from '../src/ingest.js';
import {createMuPdfProvider} from '../src/pdf-engine.js';
const bytes=new Uint8Array(readFileSync(new URL('./fixtures/jett-annotations.pdf',import.meta.url)));
const hash=b=>createHash('sha256').update(b).digest('hex');
async function source(){return {id:'annotation-fixture',...await ingestPdfBrowser(createMuPdfProvider(mupdf),bytes,{name:'jett-annotations.pdf'})};}
function mark(doc,{blockIndex=0,start=3,end=6,act='highlight',id='second-orchard',...extra}={}){
 const anchor=createAnchor({blockTexts:doc.blocks.map(b=>b.text),blockIndex,tokenStart:start,tokenEnd:end,docDigest:doc.provenance.contentDigest});
 return {id,docId:doc.id,kind:'act',act,blockIndex,arrival:'exact',anchor,...extra};
}
function readAnnotations(b){const d=new mupdf.PDFDocument(b),result=[];try{for(let i=0;i<d.countPages();i++){const p=d.loadPage(i);try{for(const a of p.getAnnotations()){try{result.push({pageIndex:i,type:a.getType(),name:a.getName(),contents:a.getContents(),rect:a.getType()==='Text'?a.getRect():null,quads:a.getType()==='Highlight'?a.getQuadPoints():null});}finally{a.destroy();}}}finally{p.destroy();}}return result;}finally{d.destroy();}}
test('exact repeated phrase maps to second occurrence after blank first page; saves standard annotations',async()=>{
 const doc=await source();assert.equal(doc.blocks[0].locator,'page:2');
 const tokens=tokenizeWithSpans(doc.blocks[0].text);assert.equal(tokens[7].text,'The');
 const records=[mark(doc,{start:7,end:10}),mark(doc,{id:'note',act:'note',start:7,end:10,noteText:'Check the harvest date.'})];
 const before=hash(bytes),out=await exportAnnotatedPdf(doc,records), annotations=readAnnotations(out);
 assert.equal(hash(bytes),before);assert.equal(readAnnotations(bytes).length,0);assert.equal(annotations.length,2);
 const highlight=annotations.find(a=>a.type==='Highlight');assert.equal(highlight.pageIndex,1);assert.equal(highlight.name,'jett:second-orchard');assert.equal(highlight.quads.length,1,'one smooth band for one selected line');assert.equal(highlight.contents,'The orchard is ready');
 assert.ok(highlight.quads.every(q=>Math.min(q[1],q[3],q[5],q[7])>120),'second baseline650 maps below first baseline680 in native coordinates');
 const note=annotations.find(a=>a.type==='Text');assert.equal(note.contents,'Check the harvest date.');assert.ok(note.rect[0]>=0&&note.rect[2]<48,'note is in clear page margin, not over selected text');
});
test('rotated page uses native character quads and undo records remove effects',async()=>{
 const doc=await source(),b=doc.blocks.findIndex(b=>b.locator==='page:3');
 const undone=mark(doc,{id:'undone'}),rotated=mark(doc,{id:'rotated',blockIndex:b,start:3,end:5,act:'important'});
 const out=await exportAnnotatedPdf(doc,[undone,rotated,{id:'undo',docId:doc.id,kind:'undo',act:'undo',undoes:'undone'}]);
 const annotations=readAnnotations(out);assert.equal(annotations.length,1);assert.equal(annotations[0].pageIndex,2);
 assert.equal(annotations[0].contents,'Important: Rotated orchard passage');assert.equal(annotations[0].quads.length,1,'rotated text remains one native band');assert.ok(annotations[0].quads.every(q=>q.every(Number.isFinite)));
});
test('tampered source, quote, digest, approximate anchors and page text refuse export',async()=>{
 const doc=await source(),record=mark(doc);
 await assert.rejects(exportAnnotatedPdf({...doc,provenance:{contentDigest:'sha256:bad'}},[record]),/SOURCE_DIGEST_MISMATCH/);
 await assert.rejects(exportAnnotatedPdf(doc,[{...record,arrival:'approximate'}]),/ANCHOR_NOT_EXACT/);
 await assert.rejects(exportAnnotatedPdf(doc,[{...record,anchor:{...record.anchor,quotedText:'wrong'}}]),/QUOTE_MISMATCH/);
 await assert.rejects(exportAnnotatedPdf(doc,[{...record,anchor:{...record.anchor,docDigest:'wrong'}}]),/ANCHOR_NOT_EXACT/);
 const changed=structuredClone(doc);changed.blocks[0].text+=' Added text';
 await assert.rejects(exportAnnotatedPdf(changed,[record]),/PAGE_TEXT_MISMATCH/);
 await assert.rejects(exportAnnotatedPdf(doc,[{...record,blockEnd:1}]),/RANGE_UNSUPPORTED/);
});
test('unsupported and undone acts cannot manufacture exportable annotations; IDs remain unique',async()=>{
 const doc=await source(),record=mark(doc);
 await assert.rejects(exportAnnotatedPdf(doc,[{...record,undone:true}]),/NO_EXPORTABLE/);
 await assert.rejects(exportAnnotatedPdf(doc,[{...record,act:'quote'}]),/NO_EXPORTABLE/);
 await assert.rejects(exportAnnotatedPdf(doc,[record,record]),/DUPLICATE_ID/);
});
test('raw native token equality rejects normalization-only matches and object bytes remain supported',async()=>{
 const doc=await source(),changed=structuredClone(doc);changed.blocks[0].text=changed.blocks[0].text.replace('The orchard','THE orchard');
 await assert.rejects(exportAnnotatedPdf(changed,[mark(changed)]),/PAGE_TEXT_MISMATCH/);
 const out=await exportAnnotatedPdf({...doc,sourceBytes:{...doc.sourceBytes}},[mark(doc)]);assert.equal(readAnnotations(out).length,1);
});
test('serialized missing annotations are detected instead of reporting success',async()=>{
 const doc=await source(),save=mupdf.PDFDocument.prototype.saveToBuffer;
 mupdf.PDFDocument.prototype.saveToBuffer=function(){return new mupdf.Buffer(bytes);};
 try{await assert.rejects(exportAnnotatedPdf(doc,[mark(doc)]),/SERIALIZED_READBACK_FAILED/);}finally{mupdf.PDFDocument.prototype.saveToBuffer=save;}
});
test('encrypted and populated signature sources reject annotations without changing originals',async()=>{
 for(const signed of [false,true]){
  const doc=await source(),pdf=new mupdf.PDFDocument(bytes);let buffer;
  try{
   if(signed){const root=pdf.getTrailer().get('Root'),form=pdf.newDictionary(),fields=pdf.newArray(),sig=pdf.newDictionary(),value=pdf.newDictionary(),ft=pdf.newName('Sig');
    try{sig.put('FT',ft);value.put('ByteRange',[0,10,20,30]);sig.put('V',value);fields.push(sig);form.put('Fields',fields);root.put('AcroForm',form);}finally{root.destroy();form.destroy();fields.destroy();sig.destroy();value.destroy();ft.destroy();}}
   buffer=pdf.saveToBuffer(signed?{}:{encrypt:'aes-256','owner-password':'test-owner','user-password':''});doc.sourceBytes=new Uint8Array(buffer.asUint8Array());
  }finally{buffer?.destroy();pdf.destroy();}
  doc.provenance.contentDigest='sha256:'+hash(doc.sourceBytes);const before=hash(doc.sourceBytes);
  await assert.rejects(exportAnnotatedPdf(doc,[mark(doc)]),/DOCUMENT_RESTRICTED/);assert.equal(hash(doc.sourceBytes),before);
 }
});
test('multiline anchor produces native quads on both text lines',async()=>{
 const doc=await source(),tokens=tokenizeWithSpans(doc.blocks[0].text),end=tokens.findIndex(t=>t.token==='winter');
 const record=mark(doc,{id:'multiline',start:11,end});assert.match(record.anchor.quotedText,/autumn\.\nBeyond/);
 const out=await exportAnnotatedPdf(doc,[record]),annotation=readAnnotations(out)[0];
 const lineTops=new Set(annotation.quads.map(q=>Math.round(Math.min(q[1],q[3],q[5],q[7]))));
 assert.equal(annotation.quads.length,2,'exactly one smooth band per compatible native line');assert.equal(lineTops.size,2);assert.equal(annotation.contents,record.anchor.quotedText);
});
test('annotation permission denial fails closed before writing',async()=>{
 const doc=await source(),permission=mupdf.PDFDocument.prototype.hasPermission;
 mupdf.PDFDocument.prototype.hasPermission=function(kind){return kind==='annotate'?false:permission.call(this,kind);};
 try{await assert.rejects(exportAnnotatedPdf(doc,[mark(doc)]),/ANNOTATION_PERMISSION_DENIED/);}finally{mupdf.PDFDocument.prototype.hasPermission=permission;}
});
test('notes avoid existing annotations and other notes on the same passage',async()=>{
 const doc=await source(),first=mark(doc,{id:'note-one',act:'note',noteText:'First note'}),second=mark(doc,{id:'note-two',act:'note',noteText:'Second note'});
 const output=await exportAnnotatedPdf(doc,[first,second]);
 const restored={id:doc.id,...await ingestPdfBrowser(createMuPdfProvider(mupdf),output,{name:'with-notes.pdf'})};
 const third=mark(restored,{id:'note-three',act:'note',noteText:'Third note'});
 const final=await exportAnnotatedPdf(restored,[third]),notes=readAnnotations(final).filter(a=>a.type==='Text');
 assert.equal(notes.length,3);
 for(let i=0;i<notes.length;i++)for(let j=i+1;j<notes.length;j++){
  const a=notes[i].rect,b=notes[j].rect;
  assert.ok(a[2]<=b[0]||b[2]<=a[0]||a[3]<=b[1]||b[3]<=a[1],`${notes[i].name} overlaps ${notes[j].name}`);
 }
});
