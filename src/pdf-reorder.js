import { snapshotPdfStructure as snapshot } from './pdf-structure.js';
import { readPdfOutlines, writePdfOutlines } from './pdf-outlines.js';
import { inspectPdfForm } from './pdf-forms.js';
function fail(code){const error=new Error(code);error.code=code;throw error;}
function owned(value){
  if(value instanceof Uint8Array)return value.slice();
  if(value instanceof ArrayBuffer)return new Uint8Array(value.slice(0));
  if(Array.isArray(value)&&Array.from(value).every(v=>Number.isInteger(v)&&v>=0&&v<=255))return Uint8Array.from(value);
  fail('REORDER_INVALID_BYTES');
}
async function validateDocument(doc,bytes){
  const schema=await inspectPdfForm(bytes);
  if(schema.restrictions.some(r=>['encrypted','signed-document','signature-protection','xfa-unsupported','calculated-form-unsupported'].includes(r)))fail('REORDER_DOCUMENT_RESTRICTED');
  doc.disableJS();if(!doc.hasPermission('assemble'))fail('REORDER_PERMISSION_DENIED');
  const trailer=doc.getTrailer(),catalog=trailer.get('Root');
  try{for(const key of ['PageLabels','Dests','Names','StructTreeRoot','OpenAction']){const value=catalog.get(key);try{if(!value.isNull())fail('REORDER_ADVANCED_STRUCTURE_UNSUPPORTED');}finally{value.destroy();}}}
  finally{catalog.destroy();trailer.destroy();}
  return readPdfOutlines(doc,Array.from({length:doc.countPages()},(_,i)=>i));
}
export async function inspectPdfReorder(input){
  const bytes=owned(input),mupdf=await import('mupdf'),doc=new mupdf.PDFDocument(bytes);
  try{await validateDocument(doc,bytes);await snapshot(doc,Array.from({length:doc.countPages()},(_,i)=>i));return {allowed:true,reason:null};}
  catch(error){if(/^REORDER_(DOCUMENT_RESTRICTED|PERMISSION_DENIED|ADVANCED_STRUCTURE_UNSUPPORTED|UNSUPPORTED_PAGE|UNSUPPORTED_OBJECT|DOCUMENT_TOO_COMPLEX|INVALID_EXISTING_ANGLE)$/.test(error.code??''))return {allowed:false,reason:error.code};throw error;}
  finally{doc.destroy();}
}
/** Derived native PDF with a complete permutation; deletion/duplication are excluded. */
export async function reorderPdfPages(input,pageOrder){
  const bytes=owned(input);
  if(!Array.isArray(pageOrder)||!pageOrder.length||!Array.from(pageOrder).every(i=>Number.isSafeInteger(i)&&i>=0)||new Set(pageOrder).size!==pageOrder.length)fail('REORDER_INVALID_ORDER');
  const order=[...pageOrder],mupdf=await import('mupdf'),doc=new mupdf.PDFDocument(bytes);
  try{
    const outlines=await validateDocument(doc,bytes);
    const count=doc.countPages();if(order.length!==count||order.some(i=>i>=count))fail('REORDER_INVALID_ORDER');
    const before=await snapshot(doc,Array.from({length:count},(_,i)=>i));
    if(order.every((value,index)=>value===index))return bytes.slice();
    // MuPDF rebuilds the catalog during rearrangement and otherwise drops
    // AcroForm and viewer metadata. A complete permutation keeps every original
    // object valid, so retain the allowed catalog entries explicitly.
    const oldTrailer=doc.getTrailer(),oldCatalog=oldTrailer.get('Root'),retained=[];
    try{
      oldCatalog.forEach((value,key)=>retained.push([key,value]));
      doc.rearrangePages(order);
      const nextTrailer=doc.getTrailer(),nextCatalog=nextTrailer.get('Root');
      try{for(const [key,value]of retained)if(key!=='Pages'&&key!=='Outlines')nextCatalog.put(key,value);}
      finally{nextCatalog.destroy();nextTrailer.destroy();}
    }finally{for(const [,value]of retained)value.destroy();oldCatalog.destroy();oldTrailer.destroy();}
    writePdfOutlines(doc,outlines,order);
    const buffer=doc.saveToBuffer();let output;try{output=new Uint8Array(buffer.asUint8Array());}finally{buffer.destroy();}
    const reopened=new mupdf.PDFDocument(output.slice());
    try{
      reopened.disableJS();if(reopened.countPages()!==count)fail('REORDER_READBACK_FAILED');
      if(JSON.stringify(readPdfOutlines(reopened,order))!==JSON.stringify(outlines))fail('REORDER_CONTENT_CHANGED');
      const after=await snapshot(reopened,order);
      if(order.some((sourceIndex,index)=>before.pages[sourceIndex]!==after.pages[index])||before.catalog!==after.catalog||before.info!==after.info)fail('REORDER_CONTENT_CHANGED');
    }finally{reopened.destroy();}
    return output;
  }finally{doc.destroy();}
}
