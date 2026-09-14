import { inspectPdfForm } from './pdf-forms.js';
function fail(code) { const error=new Error(code);error.code=code;throw error; }
function owned(value) {
  if(value instanceof Uint8Array)return value.slice();
  if(value instanceof ArrayBuffer)return new Uint8Array(value.slice(0));
  if(Array.isArray(value)&&Array.from(value).every(v=>Number.isInteger(v)&&v>=0&&v<=255))return Uint8Array.from(value);
  fail('ROTATION_INVALID_BYTES');
}
function angle(value) {
  if(value.isNull())return 0;
  const degrees=value.asNumber();
  if(!value.isNumber()||!Number.isSafeInteger(degrees)||degrees%90!==0)fail('ROTATION_INVALID_EXISTING_ANGLE');
  return ((degrees%360)+360)%360;
}
function rotations(doc) {
  const result=[];
  for(let i=0;i<doc.countPages();i++){
    const page=doc.loadPage(i),object=page.getObject();let rotate;
    try{rotate=object.getInheritable('Rotate');result.push(angle(rotate));}
    finally{rotate?.destroy();object.destroy();page.destroy();}
  }
  return result;
}
async function hash(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join(''); }
// Compare dereferenced PDF data, not transformed page coordinates or object IDs.
// This covers original content streams, resource streams, form /V /I /Opt and
// native annotation dictionaries/appearances. Only leaf-page /Rotate may differ.
async function preservedData(doc) {
  const seen=new Map();let count=0;
  async function visit(object,path,depth=0) {
    if(++count>200000||depth>256)fail('ROTATION_DOCUMENT_TOO_COMPLEX');
    if(object.isIndirect()){
      const key=object.asIndirect();if(seen.has(key))return ['reference',seen.get(key)];seen.set(key,path);
    }
    if(object.isNull())return null;
    if(object.isBoolean())return ['boolean',object.asBoolean()];
    if(object.isNumber())return ['number',object.asNumber()];
    if(object.isName())return ['name',object.asName()];
    if(object.isString())return ['string',Array.from(object.asByteString())];
    if(object.isArray()){
      const result=[];for(let i=0;i<object.length;i++){const item=object.get(i);try{result.push(await visit(item,path+'/'+i,depth+1));}finally{item.destroy();}}return result;
    }
    if(object.isDictionary()||object.isStream()){
      const type=object.get('Type');let page;
      try{page=type.asName()==='Page';}finally{type.destroy();}
      const entries=[];object.forEach((value,key)=>entries.push([key,value]));
      const stream=object.isStream();const result=[];
      try{
        for(const [key,value]of entries.sort((a,b)=>a[0].localeCompare(b[0]))){
          if(page&&key==='Rotate')continue;
          // Encoded lengths/filters may change during a legal lossless save;
          // decoded stream bytes and all other dictionary data must remain exact.
          if(stream&&['Length','Filter','DecodeParms'].includes(key))continue;
          result.push([key,await visit(value,path+'/'+key,depth+1)]);
        }
        if(stream){const buffer=object.readStream();try{result.push(['decodedStreamSHA256',await hash(buffer.asUint8Array())]);}finally{buffer.destroy();}}
      }finally{for(const [,value]of entries)value.destroy();}
      return ['dictionary',result];
    }
    fail('ROTATION_UNSUPPORTED_OBJECT');
  }
  const trailer=doc.getTrailer(),root=trailer.get('Root'),info=trailer.get('Info');
  try{return JSON.stringify([await visit(root,'Root'),await visit(info,'Info')]);}
  finally{info.destroy();root.destroy();trailer.destroy();}
}
/** Rotate only the prepared PDF copy. Does not edit the library source or rasterize. */
export async function rotatePdfPages(input,changes) {
  const bytes=owned(input);
  if(!Array.isArray(changes))fail('ROTATION_INVALID_CHANGES');
  const requested=changes.map(change=>{
    if(!change||!Number.isSafeInteger(change.pageIndex)||change.pageIndex<0||!Number.isSafeInteger(change.quarterTurns))fail('ROTATION_INVALID_CHANGES');
    return {pageIndex:change.pageIndex,quarterTurns:change.quarterTurns%4};
  });
  if(new Set(requested.map(c=>c.pageIndex)).size!==requested.length)fail('ROTATION_DUPLICATE_PAGE');
  const schema=await inspectPdfForm(bytes);
  if(schema.restrictions.some(r=>['encrypted','signed-document','signature-protection','xfa-unsupported','calculated-form-unsupported'].includes(r)))fail('ROTATION_DOCUMENT_RESTRICTED');
  const mupdf=await import('mupdf'),doc=new mupdf.PDFDocument(bytes);let output;
  try{
    doc.disableJS();
    if(!doc.hasPermission('assemble'))fail('ROTATION_PERMISSION_DENIED');
    const beforeAngles=rotations(doc),expected=[...beforeAngles];
    if(requested.some(c=>c.pageIndex>=beforeAngles.length))fail('ROTATION_PAGE_OUT_OF_RANGE');
    if(!requested.some(c=>c.quarterTurns!==0))return bytes.slice();
    const before=await preservedData(doc);
    for(const {pageIndex,quarterTurns}of requested){
      expected[pageIndex]=(beforeAngles[pageIndex]+quarterTurns*90+360)%360;
      const page=doc.loadPage(pageIndex),object=page.getObject();
      try{object.put('Rotate',expected[pageIndex]);}finally{object.destroy();page.destroy();}
    }
    const buffer=doc.saveToBuffer();try{output=new Uint8Array(buffer.asUint8Array());}finally{buffer.destroy();}
    const reopened=new mupdf.PDFDocument(output.slice());
    try{
      reopened.disableJS();
      if(JSON.stringify(rotations(reopened))!==JSON.stringify(expected))fail('ROTATION_READBACK_FAILED');
      if(await preservedData(reopened)!==before)fail('ROTATION_CONTENT_CHANGED');
    }finally{reopened.destroy();}
    return output;
  }finally{doc.destroy();}
}
