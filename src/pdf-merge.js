// Native page-graph merge. Sources are owned copies; the first input supplies
// document metadata/viewer preferences, while every page and local outline is
// retained in input order. This is a derived copy, not redaction or flattening.
import {inspectPdfForm} from './pdf-forms.js';
import {snapshotPdfStructure} from './pdf-structure.js';
import {readPdfOutlines,writePdfOutlines} from './pdf-outlines.js';
const inherited=['MediaBox','CropBox','Rotate','Resources'];
const catalogKeys=['Type','Pages','Outlines','PageLayout','PageMode','Lang','Version','Metadata','ViewerPreferences','Info'];
function fail(code,detail){const error=new Error(detail?`${code}: ${detail}`:code);error.code=code;if(detail)error.detail=detail;throw error;}
function owned(input){if(input instanceof Uint8Array)return input.slice();if(input instanceof ArrayBuffer)return new Uint8Array(input.slice(0));if(Array.isArray(input)&&Array.from(input).every(n=>Number.isInteger(n)&&n>=0&&n<=255))return Uint8Array.from(input);fail('MERGE_INVALID_BYTES');}
function inputsOwned(inputs){if(!Array.isArray(inputs)||inputs.length<2||inputs.length>100)fail('MERGE_INVALID_INPUTS');return Array.from(inputs,owned);}
function use(object,key,fn){const value=object.get(key);try{return fn(value);}finally{value.destroy();}}
async function inspect(doc,bytes,offset){
 doc.disableJS();if(doc.countPages()<1||offset+doc.countPages()>10000)fail('MERGE_PAGE_LIMIT');
 const form=await inspectPdfForm(bytes);
 if(form.restrictions.some(r=>['encrypted','signed-document','signature-protection','xfa-unsupported','calculated-form-unsupported'].includes(r)))fail('MERGE_DOCUMENT_RESTRICTED');
 if(!doc.hasPermission('assemble'))fail('MERGE_PERMISSION_DENIED');
 const trailer=doc.getTrailer(),catalog=trailer.get('Root');
 try{catalog.forEach((value,key)=>{try{if(!value.isNull()&&!catalogKeys.includes(key))fail('MERGE_CATALOG_UNSUPPORTED',key);}finally{value.destroy();}});}finally{catalog.destroy();trailer.destroy();}
 for(let index=0;index<doc.countPages();index++){
  const page=doc.loadPage(index),object=page.getObject();
  try{
   for(const key of ['AA','B','PresSteps','StructParents'])use(object,key,v=>{if(!v.isNull())fail('MERGE_PAGE_STRUCTURE_UNSUPPORTED',key);});
   use(object,'Annots',annots=>{if(annots.isNull())return;if(!annots.isArray())fail('MERGE_ANNOTATION_UNSUPPORTED','Annots');
    for(let i=0;i<annots.length;i++)use(annots,i,annotation=>{
     use(annotation,'Subtype',v=>{if(!v.isName()||['Widget','RichMedia','Screen','Movie','Sound','3D'].includes(v.asName()))fail('MERGE_ANNOTATION_UNSUPPORTED',v.asName());});
     for(const key of ['AA','StructParent'])use(annotation,key,v=>{if(!v.isNull())fail('MERGE_ANNOTATION_UNSUPPORTED',key);});
     use(annotation,'Dest',v=>{if(!v.isNull()&&!v.isArray())fail('MERGE_NAMED_DESTINATION_UNSUPPORTED');});
     use(annotation,'A',action=>{if(action.isNull())return;
      use(action,'S',v=>{if(!v.isName()||!['URI','GoTo'].includes(v.asName()))fail('MERGE_ACTION_UNSUPPORTED',v.asName());});
      use(action,'Next',v=>{if(!v.isNull())fail('MERGE_ACTION_UNSUPPORTED','Next');});
      use(action,'D',v=>{if(!v.isNull()&&!v.isArray())fail('MERGE_NAMED_DESTINATION_UNSUPPORTED');});
     });
    });
   });
  }finally{object.destroy();page.destroy();}
 }
 const order=Array.from({length:doc.countPages()},(_,index)=>offset+index);
 return {snapshot:await snapshotPdfStructure(doc,order),outlines:readPdfOutlines(doc,order)};
}
function mapped(error){if(error.code?.startsWith('REORDER_')){error.detail=error.code;error.code='MERGE_STRUCTURE_UNSUPPORTED';error.message=`${error.code}: ${error.detail}`;}return error;}
export async function inspectPdfMerge(inputs){
 const bytes=inputsOwned(inputs),m=await import('mupdf');let totalPages=0;
 for(let inputIndex=0;inputIndex<bytes.length;inputIndex++){
  const doc=new m.PDFDocument(bytes[inputIndex]);
  try{await inspect(doc,bytes[inputIndex],totalPages);totalPages+=doc.countPages();}
  catch(error){mapped(error);if(error.code?.startsWith('MERGE_'))return {allowed:false,reason:error.code,detail:error.detail??null,inputIndex};throw error;}
  finally{doc.destroy();}
 }
 return {allowed:true,reason:null,totalPages};
}
export async function mergePdfDocuments(inputs){
 const bytes=inputsOwned(inputs),m=await import('mupdf'),output=new m.PDFDocument(),sources=[];
 try{
  const expected=[],outlineChildren=[];let offset=0,firstSnapshot=null;
  for(const input of bytes){const doc=new m.PDFDocument(input);sources.push(doc);const before=await inspect(doc,input,offset);firstSnapshot??=before.snapshot;expected.push(...before.snapshot.pages);outlineChildren.push(...(before.outlines?.children??[]));offset+=doc.countPages();}
  for(const doc of sources){
   const pages=[],map=output.newGraftMap();
   try{
    // Detach *every* source leaf before grafting any. Annotation /P and local
    // links can recursively reach another leaf; none may drag its old tree in.
    for(let i=0;i<doc.countPages();i++){const page=doc.loadPage(i);try{pages.push(page.getObject());}finally{page.destroy();}}
    for(const object of pages)for(const key of inherited){const value=object.getInheritable(key);try{if(!value.isNull())object.put(key,value);}finally{value.destroy();}}
    for(const object of pages)object.delete('Parent');
    for(const object of pages){const graft=map.graftObject(object);try{output.insertPage(-1,graft);}finally{graft.destroy();}}
   }finally{for(const object of pages)object.destroy();map.destroy();}
  }
  const firstTrailer=sources[0].getTrailer(),first=firstTrailer.get('Root'),trailer=output.getTrailer(),root=trailer.get('Root');
  try{
   // MuPDF's empty-document constructor adds a catalog Info entry; the first
   // source supplies the actual trailer Info and catalog metadata instead.
   root.delete('Info');
   for(const key of catalogKeys.filter(k=>!['Type','Pages','Outlines'].includes(k)))use(first,key,value=>{if(!value.isNull()){const copy=output.graftObject(value);try{root.put(key,copy);}finally{copy.destroy();}}});
   use(firstTrailer,'Info',value=>{if(!value.isNull()){const copy=output.graftObject(value);try{trailer.put('Info',copy);}finally{copy.destroy();}}});
  }finally{root.destroy();trailer.destroy();first.destroy();firstTrailer.destroy();}
  const order=Array.from({length:expected.length},(_,i)=>i);
  const outlines=outlineChildren.length?{count:outlineChildren.reduce((n,child)=>n+1+Math.max(0,child.count??0),0),children:outlineChildren}:null;
  writePdfOutlines(output,outlines,order);
  const beforeSave=await snapshotPdfStructure(output,order);
  if(firstSnapshot.catalog!==beforeSave.catalog||firstSnapshot.info!==beforeSave.info||expected.some((page,index)=>page!==beforeSave.pages[index]))fail('MERGE_CONTENT_CHANGED');
  const buffer=output.saveToBuffer({garbage:4});let result;try{result=new Uint8Array(buffer.asUint8Array());}finally{buffer.destroy();}
  const check=new m.PDFDocument(result.slice());try{
   check.disableJS();if(check.countPages()!==expected.length)fail('MERGE_CONTENT_CHANGED');const after=await snapshotPdfStructure(check,order);
   if(expected.some((page,index)=>page!==after.pages[index])||beforeSave.catalog!==after.catalog||beforeSave.info!==after.info||JSON.stringify(readPdfOutlines(check,order))!==JSON.stringify(outlines))fail('MERGE_CONTENT_CHANGED');
  }finally{check.destroy();}
  return result;
 }catch(error){throw mapped(error);}finally{for(const doc of sources)doc.destroy();output.destroy();}
}
