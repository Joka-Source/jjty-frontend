import {inspectPdfForm} from './pdf-forms.js';
import {snapshotPdfStructure} from './pdf-structure.js';
function fail(code){const error=new Error(code);error.code=code;throw error;}
function owned(input){if(input instanceof Uint8Array)return input.slice();if(input instanceof ArrayBuffer)return new Uint8Array(input.slice(0));if(Array.isArray(input)&&Array.from(input).every(v=>Number.isInteger(v)&&v>=0&&v<=255))return Uint8Array.from(input);fail('EXTRACT_INVALID_BYTES');}
const allowedCatalog=['Type','Pages','PageLayout','PageMode','Lang','Version'];
async function inspect(doc,bytes){
 doc.disableJS();if(doc.countPages()<1||doc.countPages()>10000)fail('EXTRACT_STRUCTURE_UNSUPPORTED');const form=await inspectPdfForm(bytes);
 if(form.restrictions.some(r=>['encrypted','signed-document','signature-protection','xfa-unsupported','calculated-form-unsupported'].includes(r)))fail('EXTRACT_DOCUMENT_RESTRICTED');
 if(!doc.hasPermission('assemble'))fail('EXTRACT_PERMISSION_DENIED');
 const trailer=doc.getTrailer(),root=trailer.get('Root');
 try{root.forEach((value,key)=>{try{if(!value.isNull()&&!allowedCatalog.includes(key))fail('EXTRACT_STRUCTURE_UNSUPPORTED');if(key!=='Pages'&&!value.isNull()&&!value.isName()&&!value.isString())fail('EXTRACT_STRUCTURE_UNSUPPORTED');}finally{value.destroy();}});}finally{root.destroy();trailer.destroy();}
 // Reject navigation and form authority, including page actions and unknown
 // annotation types. Simple marks are proved byte-semantically after saving.
 for(let i=0;i<doc.countPages();i++){
  const page=doc.loadPage(i),object=page.getObject();
  try{
   for(const key of ['AA','B','PresSteps','StructParents']){const value=object.get(key);try{if(!value.isNull())fail('EXTRACT_STRUCTURE_UNSUPPORTED');}finally{value.destroy();}}
   const annots=object.get('Annots');try{if(!annots.isNull()){if(!annots.isArray())fail('EXTRACT_STRUCTURE_UNSUPPORTED');for(let j=0;j<annots.length;j++){const annotation=annots.get(j),type=annotation.get('Subtype');try{if(!type.isName()||!['Text','Highlight','Popup'].includes(type.asName()))fail('EXTRACT_STRUCTURE_UNSUPPORTED');for(const key of ['A','AA','Dest','IRT','StructParent']){const value=annotation.get(key);try{if(!value.isNull())fail('EXTRACT_STRUCTURE_UNSUPPORTED');}finally{value.destroy();}}}finally{type.destroy();annotation.destroy();}}}}finally{annots.destroy();}
  }finally{object.destroy();page.destroy();}
 }
 return snapshotPdfStructure(doc,Array.from({length:doc.countPages()},(_,i)=>i));
}
function translate(error){if(error.code?.startsWith('REORDER_')){const mapped=error.code==='REORDER_CONTENT_CHANGED'?'EXTRACT_CONTENT_CHANGED':'EXTRACT_STRUCTURE_UNSUPPORTED';fail(mapped);}throw error;}
export async function inspectPdfExtraction(input){const bytes=owned(input),m=await import('mupdf'),doc=new m.PDFDocument(bytes);try{await inspect(doc,bytes);return {allowed:true,reason:null};}catch(error){if(error.code?.startsWith('REORDER_'))return {allowed:false,reason:'EXTRACT_STRUCTURE_UNSUPPORTED'};if(['EXTRACT_DOCUMENT_RESTRICTED','EXTRACT_PERMISSION_DENIED','EXTRACT_STRUCTURE_UNSUPPORTED'].includes(error.code))return {allowed:false,reason:error.code};throw error;}finally{doc.destroy();}}
export async function extractPdfPages(input,selection){
 const bytes=owned(input);if(!Array.isArray(selection)||!selection.length||selection.length>10000||!Array.from(selection).every(i=>Number.isSafeInteger(i)&&i>=0)||new Set(selection).size!==selection.length)fail('EXTRACT_INVALID_SELECTION');
 const order=[...selection],m=await import('mupdf'),doc=new m.PDFDocument(bytes);
 try{
  if(order.some(i=>i>=doc.countPages()))fail('EXTRACT_INVALID_SELECTION');const before=await inspect(doc,bytes);
  // Only scalar catalog metadata is retained; no removed-page object graph is
  // reattached after native subset extraction. Unreachable objects are collected.
  const trailer=doc.getTrailer(),root=trailer.get('Root'),retained=[];
  try{root.forEach((value,key)=>{if(key==='Pages')value.destroy();else retained.push([key,value]);});doc.rearrangePages(order);const nextTrailer=doc.getTrailer(),next=nextTrailer.get('Root');try{for(const[key,value]of retained)next.put(key,value);}finally{next.destroy();nextTrailer.destroy();}}finally{retained.forEach(([,v])=>v.destroy());root.destroy();trailer.destroy();}
  const buffer=doc.saveToBuffer({garbage:4});let output;try{output=new Uint8Array(buffer.asUint8Array());}finally{buffer.destroy();}
  const check=new m.PDFDocument(output.slice());try{check.disableJS();if(check.countPages()!==order.length)fail('EXTRACT_CONTENT_CHANGED');const after=await snapshotPdfStructure(check,order);if(order.some((source,i)=>before.pages[source]!==after.pages[i])||before.catalog!==after.catalog||before.info!==after.info)fail('EXTRACT_CONTENT_CHANGED');}finally{check.destroy();}return output;
 }catch(error){translate(error);}finally{doc.destroy();}
}
