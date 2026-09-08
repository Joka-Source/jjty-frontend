import { readPdfOutlines, writePdfOutlines } from './pdf-outlines.js';
import { inspectPdfForm } from './pdf-forms.js';
function fail(code){const error=new Error(code);error.code=code;throw error;}
function owned(value){
  if(value instanceof Uint8Array)return value.slice();
  if(value instanceof ArrayBuffer)return new Uint8Array(value.slice(0));
  if(Array.isArray(value)&&Array.from(value).every(v=>Number.isInteger(v)&&v>=0&&v<=255))return Uint8Array.from(value);
  fail('REORDER_INVALID_BYTES');
}
const INHERITED=['MediaBox','CropBox','Rotate','Resources'];
async function hash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');}
// Native data is compared in original page identity space, so annotation /P
// links remain meaningful even when indirect object numbers change on save.
async function snapshot(doc,originalIndices){
  const pageIds=new Map(),pages=[];
  try{
    for(let index=0;index<doc.countPages();index++){
      const page=doc.loadPage(index),object=page.getObject();pages.push({page,object});
      if(!object.isIndirect())fail('REORDER_UNSUPPORTED_PAGE');
      pageIds.set(object.asIndirect(),originalIndices[index]);
    }
    async function fingerprint(root,path,expandPage=false){
      const seen=new Map();let count=0;
      async function visit(object,at,depth=0,expand=false){
        if(++count>200000||depth>256)fail('REORDER_DOCUMENT_TOO_COMPLEX');
        if(object.isIndirect()){
          const id=object.asIndirect();
          if(!expand&&pageIds.has(id))return ['page',pageIds.get(id)];
          if(seen.has(id))return ['reference',seen.get(id)];seen.set(id,at);
        }
        if(object.isNull())return null;
        if(object.isBoolean())return ['boolean',object.asBoolean()];
        if(object.isNumber())return ['number',object.asNumber()];
        if(object.isName())return ['name',object.asName()];
        if(object.isString())return ['string',Array.from(object.asByteString())];
        if(object.isArray()){
          const items=[];for(let i=0;i<object.length;i++){const value=object.get(i);try{items.push(await visit(value,at+'/'+i,depth+1));}finally{value.destroy();}}return items;
        }
        if(object.isDictionary()||object.isStream()){
          // Numeric local targets outside rebuilt outlines are not remapped by
          // this operation. MuPDF can remove these links outright; refuse before
          // mutation rather than exposing a late failure or stale destination.
          for(const key of ['Dest','D']){
            const value=object.get(key),action=key==='D'?object.get('S'):null;
            try{if(key==='D'&&(!action.isName()||action.asName()!=='GoTo'))continue;
              if(value.isArray()&&value.length){const target=value.get(0);try{if(target.isNumber())fail('REORDER_ADVANCED_STRUCTURE_UNSUPPORTED');}finally{target.destroy();}}
            }finally{action?.destroy();value.destroy();}
          }

          const type=object.get('Type');let isPage;try{isPage=type.asName()==='Page';}finally{type.destroy();}
          const entries=[];object.forEach((value,key)=>entries.push([key,value]));const items=[],stream=object.isStream();
          try{
            for(const [key,value]of entries.sort((a,b)=>a[0].localeCompare(b[0]))){
              if(isPage&&(key==='Parent'||INHERITED.includes(key)))continue;
              if(stream&&['Length','Filter','DecodeParms'].includes(key))continue;
              items.push([key,await visit(value,at+'/'+key,depth+1)]);
            }
            if(stream){const buffer=object.readStream();try{items.push(['decodedStreamSHA256',await hash(buffer.asUint8Array())]);}finally{buffer.destroy();}}
          }finally{for(const [,value]of entries)value.destroy();}
          return ['dictionary',items];
        }
        fail('REORDER_UNSUPPORTED_OBJECT');
      }
      return visit(root,path,0,expandPage);
    }
    const results=[];
    for(const {page,object}of pages){
      const inherited=[];
      for(const key of INHERITED){const value=object.getInheritable(key);try{
        if(key==='Rotate'){
          const rotation=value.isNull()?0:value.asNumber();
          if(!value.isNull()&&(!value.isNumber()||!Number.isSafeInteger(rotation)||rotation%90))fail('REORDER_INVALID_EXISTING_ANGLE');
          inherited.push([key,((rotation%360)+360)%360]);
        }else inherited.push([key,await fingerprint(value,key)]);
      }finally{value.destroy();}}
      results.push(JSON.stringify({page:await fingerprint(object,'page',true),inherited,bounds:page.getBounds()}));
    }
    const trailer=doc.getTrailer(),catalog=trailer.get('Root'),info=trailer.get('Info'),entries=[];
    try{
      catalog.forEach((value,key)=>entries.push([key,value]));const data=[];
      for(const [key,value]of entries.sort((a,b)=>a[0].localeCompare(b[0])))if(key!=='Pages'&&key!=='Outlines')data.push([key,await fingerprint(value,'catalog/'+key)]);
      return {pages:results,catalog:JSON.stringify(data),info:JSON.stringify(await fingerprint(info,'Info'))};
    }finally{for(const [,value]of entries)value.destroy();info.destroy();catalog.destroy();trailer.destroy();}
  }finally{for(const {page,object}of pages){object.destroy();page.destroy();}}
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
