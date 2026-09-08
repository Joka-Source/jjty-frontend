import { tokenizeWithSpans } from './match.js';
import { inspectPdfForm } from './pdf-forms.js';
import { deriveRangeSegments } from './anchors.js';
function fail(code) { const error=new Error(code);error.code=code;throw error; }
async function digest(bytes) { return 'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join(''); }
function nativeText(page) {
  const structured=page.toStructuredText("preserve-whitespace"); let text='',line=0;const chars=[];
  try { structured.walk({beginLine(){line++;},onChar(c,_origin,_font,_size,quad){const start=text.length;text+=c;chars.push({start,end:text.length,line,quad:[...quad]});},endLine(){text+='\n';}}); }
  finally { structured.destroy(); }
  return {text,chars,tokens:tokenizeWithSpans(text)};
}
function bands(characters) {
  const result=[];
  for(const character of characters) {
    const q=character.quad,previous=result.at(-1);
    if(previous && previous.line===character.line) {
      const p=previous.quad,dx=p[2]-p[0],dy=p[3]-p[1],length=Math.hypot(dx,dy);
      const nx=q[2]-q[0],ny=q[3]-q[1],nextLength=Math.hypot(nx,ny);
      if(length>0 && nextLength>0) {
        const ux=dx/length,uy=dy/length;
        const parallel=Math.abs(ux*ny/nextLength-uy*nx/nextLength)<0.001 && (ux*nx+uy*ny)>0;
        const aligned=Math.abs((q[0]-p[0])*(-uy)+(q[1]-p[1])*ux)<0.05
          && Math.abs((q[4]-p[4])*(-uy)+(q[5]-p[5])*ux)<0.05;
        const gap=(q[0]-p[2])*ux+(q[1]-p[3])*uy;
        const height=Math.hypot(p[4]-p[0],p[5]-p[1]);
        // Only join compatible adjacent glyphs on the same native text line.
        // Differing orientation, height, reversed order or large gaps stay separate.
        if(parallel && aligned && gap>=-0.5 && gap<=height*1.5) {
          previous.quad=[p[0],p[1],q[2],q[3],p[4],p[5],q[6],q[7]];continue;
        }
      }
    }
    result.push({line:character.line,quad:[...q]});
  }
  return result.map(item=>item.quad);
}
function boundsOf(q) { return [Math.min(q[0],q[2],q[4],q[6]),Math.min(q[1],q[3],q[5],q[7]),Math.max(q[0],q[2],q[4],q[6]),Math.max(q[1],q[3],q[5],q[7])]; }
function noteMargin(page,native,anchorQuad,obstacles=[]) {
  const [left,top,right,bottom]=page.getBounds(),size=20,pad=4,target=boundsOf(anchorQuad);
  if(right-left<size+pad*2 || bottom-top<size+pad*2) fail('ANNOTATION_NOTE_MARGIN_UNAVAILABLE');
  const clampY=y=>Math.max(top+pad,Math.min(y,bottom-pad-size));
  const textBoxes=[...native.chars.filter(c=>native.text.slice(c.start,c.end).trim()).map(c=>boundsOf(c.quad)),...obstacles];
  const clear=rect=>textBoxes.every(box=>rect[2]+pad<=box[0] || rect[0]-pad>=box[2] || rect[3]+pad<=box[1] || rect[1]-pad>=box[3]);
  const candidates=[];
  for(const x of [left+pad,right-pad-size]) {
    for(const y of [clampY(target[1]),...Array.from({length:Math.ceil((bottom-top)/24)},(_,i)=>clampY(top+pad+i*24))]) {
      const rect=[x,y,x+size,y+size];if(clear(rect))candidates.push(rect);
    }
  }
  candidates.sort((a,b)=>Math.hypot(a[0]-target[0],a[1]-target[1])-Math.hypot(b[0]-target[0],b[1]-target[1]));
  if(!candidates.length)fail('ANNOTATION_NOTE_MARGIN_UNAVAILABLE');return candidates[0];
}
/** Export surviving exact local marks onto a fresh copy of the preserved PDF. */
export async function exportAnnotatedPdf(source, records) {
  if(!source?.sourceBytes || !Array.isArray(source.blocks) || !Array.isArray(records)) fail('ANNOTATION_SOURCE_MISSING');
  const raw=source.sourceBytes;
  const bytes=(raw instanceof Uint8Array || raw instanceof ArrayBuffer || Array.isArray(raw))?new Uint8Array(raw).slice():new Uint8Array(Object.values(raw));
  const sourceDigest=await digest(bytes);
  if(source.provenance?.contentDigest!==sourceDigest) fail('ANNOTATION_SOURCE_DIGEST_MISMATCH');
  const restrictions=(await inspectPdfForm(bytes)).restrictions;
  if(restrictions.some(r=>['encrypted','signed-document','signature-protection','xfa-unsupported','calculated-form-unsupported'].includes(r))) fail('ANNOTATION_DOCUMENT_RESTRICTED');
  const undone=new Set(records.filter(r=>(r.kind==='act'||r.kind==='undo') && r.act==='undo' && r.docId===source.id).map(r=>r.undoes));
  const marks=records.filter(r=>r.kind==='act' && r.docId===source.id && ['highlight','note','important'].includes(r.act) && !r.undone && !undone.has(r.id));
  if(!marks.length) fail('NO_EXPORTABLE_ANNOTATIONS');
  const recordIds=new Set(),annotationNames=new Set(),segments=[],gapPages=new Set();
  for(const record of marks) {
    if(!record.id || recordIds.has(record.id)) fail('ANNOTATION_DUPLICATE_ID');recordIds.add(record.id);
    if(record.rangeAnchor) {
      if(record.act!=='highlight' || record.arrival!=='exact' || record.migration==='legacy') fail('ANNOTATION_ANCHOR_NOT_EXACT');
      let anchors;
      try { anchors=deriveRangeSegments(record.rangeAnchor,{blockTexts:source.blocks.map(block=>block.text),docDigest:sourceDigest}); }
      catch { fail('ANNOTATION_RANGE_ANCHOR_INVALID'); }
      if(!anchors.length || record.blockIndex!==anchors[0].blockIndex || (record.blockEnd??record.blockIndex)!==anchors.at(-1).blockIndex) fail('ANNOTATION_RANGE_UNSUPPORTED');
      let previousPage=null;
      for(const anchor of anchors) {
        const locator=/^page:([1-9]\d*)$/.exec(source.blocks[anchor.blockIndex]?.locator??'');
        const page=locator?Number(locator[1]):null;
        if(page===null || (previousPage!==null && page<=previousPage)) fail('ANNOTATION_RANGE_PAGE_GAP');
        // Inspect skipped physical pages below before accepting the range.
        // Ingestion intentionally omits blank blocks, but can also miss text.
        if(previousPage!==null)for(let skipped=previousPage+1;skipped<page;skipped++)gapPages.add(skipped-1);
        previousPage=page;
        segments.push({...record,anchor,blockIndex:anchor.blockIndex,blockEnd:anchor.blockIndex,
          annotationName:anchors.length===1?`jett:${record.id}`:`jett:${record.id}:range:${anchor.blockIndex}`});
      }
    } else segments.push({...record,annotationName:`jett:${record.id}`});
  }
  for(const segment of segments) {
    if(annotationNames.has(segment.annotationName))fail('ANNOTATION_DUPLICATE_ID');annotationNames.add(segment.annotationName);
  }
  const mupdf=await import('mupdf'),doc=new mupdf.PDFDocument(bytes),owned=[];
  const keep=o=>{owned.push(o);return o;};
  const expected=[];
  try {
    doc.disableJS(); if(!doc.hasPermission('annotate')) fail('ANNOTATION_PERMISSION_DENIED');
    for(const pageIndex of gapPages) {
      if(pageIndex>=doc.countPages())fail('ANNOTATION_RANGE_PAGE_GAP');
      const page=keep(doc.loadPage(pageIndex)),object=keep(page.getObject());
      if(nativeText(page).tokens.length)fail('ANNOTATION_RANGE_PAGE_GAP');
      // No text is insufficient: an image-only or vector page must not vanish
      // from an exact range. Only absent/empty content and no annotations are
      // accepted as physically blank, without guessing at drawing operators.
      const annotations=keep(object.get('Annots')),contents=keep(object.get('Contents'));
      if(!annotations.isNull() && annotations.length)fail('ANNOTATION_RANGE_PAGE_GAP');
      const streams=contents.isArray()?Array.from({length:contents.length},(_,i)=>keep(contents.get(i))):[contents];
      for(const stream of streams) {
        if(stream.isNull())continue;
        if(!stream.isStream())fail('ANNOTATION_RANGE_PAGE_GAP');
        const buffer=keep(stream.readStream());
        if(buffer.asUint8Array().some(byte=>![0,9,10,12,13,32].includes(byte)))fail('ANNOTATION_RANGE_PAGE_GAP');
      }
    }
    const pages=new Map(),texts=new Map(),obstacles=new Map(),ids=new Set();
    for(const record of segments) {
      const anchor=record.anchor;
      if(ids.has(record.annotationName)) fail('ANNOTATION_DUPLICATE_ID'); ids.add(record.annotationName);
      if(!anchor || record.arrival!=='exact' || record.migration==='legacy' || anchor.docDigest!==sourceDigest) fail('ANNOTATION_ANCHOR_NOT_EXACT');
      if(record.blockIndex!==anchor.blockIndex || (record.blockEnd!=null && record.blockEnd!==anchor.blockIndex)) fail('ANNOTATION_RANGE_UNSUPPORTED');
      const block=source.blocks[anchor.blockIndex],locator=/^page:([1-9]\d*)$/.exec(block?.locator??'');
      if(!locator) fail('ANNOTATION_PAGE_LOCATOR_INVALID');
      const pageIndex=Number(locator[1])-1;if(pageIndex>=doc.countPages()) fail('ANNOTATION_PAGE_LOCATOR_INVALID');
      const blockText=String(block.text??''),tokens=tokenizeWithSpans(blockText),start=anchor.tokenStart,end=anchor.tokenEnd;
      if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>=tokens.length) fail('ANNOTATION_TOKEN_RANGE_INVALID');
      if(blockText.slice(tokens[start].start,tokens[end].end)!==anchor.quotedText) fail('ANNOTATION_QUOTE_MISMATCH');
      if(!pages.has(pageIndex)) {
        const page=keep(doc.loadPage(pageIndex));pages.set(pageIndex,page);texts.set(pageIndex,nativeText(page));obstacles.set(pageIndex,[]);
        for(const a of page.getAnnotations()){keep(a);obstacles.get(pageIndex).push(a.getBounds());if(annotationNames.has(a.getName())) fail('ANNOTATION_ID_ALREADY_EXISTS');}
      }
      const native=texts.get(pageIndex);
      if(tokens.length!==native.tokens.length || tokens.some((token,i)=>token.text!==native.tokens[i].text)) fail('ANNOTATION_PAGE_TEXT_MISMATCH');
      const first=native.tokens[start].start,last=native.tokens[end].end;
      const quads=bands(native.chars.filter(c=>c.start>=first&&c.end<=last && native.text.slice(c.start,c.end).trim()));
      if(!quads.length || quads.some(q=>q.length!==8||q.some(n=>!Number.isFinite(n)))) fail('ANNOTATION_GEOMETRY_UNAVAILABLE');
      const type=record.act==='note'?'Text':'Highlight',name=record.annotationName;
      const contents=record.act==='note'?record.noteText:record.act==='important'?`Important: ${anchor.quotedText}`:anchor.quotedText;
      if(typeof contents!=='string'||!contents.trim()) fail('ANNOTATION_CONTENTS_MISSING');
      const annotation=keep(pages.get(pageIndex).createAnnotation(type));
      annotation.setName(name);annotation.setContents(contents);annotation.setFlags(mupdf.PDFAnnotation.IS_PRINT);
      if(type==='Highlight') {annotation.setQuadPoints(quads);annotation.setColor(record.act==='important'?[1,0.55,0]:[1,0.85,0]);annotation.setOpacity(0.4);}
      else annotation.setRect(noteMargin(pages.get(pageIndex),native,quads[0],obstacles.get(pageIndex)));
      annotation.update(); if(type==='Text')obstacles.get(pageIndex).push(annotation.getBounds()); expected.push({pageIndex,name,type,contents,quads:type==='Highlight'?quads:null,rect:type==='Text'?annotation.getRect():null});
    }
    for(const page of pages.values())page.update();
    const buffer=doc.saveToBuffer({garbage:3,compress:true});let output;
    try{output=new Uint8Array(buffer.asUint8Array());}finally{buffer.destroy();}
    const reopened=new mupdf.PDFDocument(output),read=[];
    try {
      reopened.disableJS();
      for(let pageIndex=0;pageIndex<reopened.countPages();pageIndex++){
        const page=reopened.loadPage(pageIndex);try{for(const annotation of page.getAnnotations()){
          try{read.push({pageIndex,name:annotation.getName(),type:annotation.getType(),contents:annotation.getContents(),rect:annotation.getType()==='Text'?annotation.getRect():null,quads:annotation.getType()==='Highlight'?annotation.getQuadPoints():null});}finally{annotation.destroy();}
        }}finally{page.destroy();}
      }
      for(const wanted of expected){const matches=read.filter(r=>r.name===wanted.name);const found=matches[0];
        if(matches.length!==1 || found.pageIndex!==wanted.pageIndex || found.type!==wanted.type || found.contents!==wanted.contents) fail('ANNOTATION_SERIALIZED_READBACK_FAILED');
        if(wanted.rect && found.rect.some((n,i)=>Math.abs(n-wanted.rect[i])>0.01)) fail('ANNOTATION_SERIALIZED_GEOMETRY_FAILED');
        if(wanted.quads && (found.quads.length!==wanted.quads.length||found.quads.some((q,i)=>q.some((n,j)=>Math.abs(n-wanted.quads[i][j])>0.01))))fail('ANNOTATION_SERIALIZED_GEOMETRY_FAILED');
      }
    }finally{reopened.destroy();}
    return output;
  } finally {for(const object of owned.reverse())object.destroy();doc.destroy();}
}
