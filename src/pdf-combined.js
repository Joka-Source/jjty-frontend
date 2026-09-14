import {inspectPdfForm,fillPdfForm} from './pdf-forms.js';
import {exportAnnotatedPdf} from './pdf-annotations.js';
import {isTextMarkup} from './text-markup.js';
function fail(code){const error=new Error(code);error.code=code;throw error;}
function owned(source){return source instanceof Uint8Array||source instanceof ArrayBuffer||Array.isArray(source)?new Uint8Array(source).slice():new Uint8Array(Object.values(source??{}));}
async function digest(bytes){return 'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');}
function canonical(value){return JSON.stringify(value,(_key,item)=>typeof item==='number'?Math.round(item*10000)/10000:item);}
function sameAnnotations(before,after,subset=false){
 const remaining=new Map();for(const item of after){const key=canonical(item);remaining.set(key,(remaining.get(key)??0)+1);}
 for(const item of before){const key=canonical(item),count=remaining.get(key)??0;if(!count) return false;remaining.set(key,count-1);}
 return subset||[...remaining.values()].every(count=>count===0);
}
async function annotations(bytes){
 const mupdf=await import('mupdf'),doc=new mupdf.PDFDocument(bytes),result=[];
 try{doc.disableJS();for(let pageIndex=0;pageIndex<doc.countPages();pageIndex++){
  const page=doc.loadPage(pageIndex);let items=[];
  try{items=page.getAnnotations();for(const a of items)result.push({pageIndex,id:a.getName(),type:a.getType(),contents:a.getContents(),rect:[...a.getBounds()],
   quads:a.hasQuadPoints()?a.getQuadPoints().map(q=>[...q]):[],flags:a.getFlags(),color:[...a.getColor()],opacity:a.getOpacity()});}
  finally{for(const a of items)a.destroy();page.destroy();}
 }}finally{doc.destroy();}return result;
}
function semantics(schema){return schema.fields.map(({groupId,value,...field})=>({...field,groupKeys:schema.fields.filter(f=>f.groupId===groupId).map(f=>f.key).sort()}));}
function overlap(a,b){return a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];}
function quadBounds(q){return [Math.min(q[0],q[2],q[4],q[6]),Math.min(q[1],q[3],q[5],q[7]),Math.max(q[0],q[2],q[4],q[6]),Math.max(q[1],q[3],q[5],q[7])];}
/** Compose immutable local marks with a source-bound saved form draft. */
export async function exportCombinedPdf({source,savedFormDraft=null,committedRecords=[],allowFormOnly=false}){
 const snapshot=structuredClone(source),draft=structuredClone(savedFormDraft),records=structuredClone(committedRecords);
 if(!snapshot?.sourceBytes||!Array.isArray(records))fail('COMBINED_SOURCE_INVALID');
 const original=owned(snapshot.sourceBytes),sourceDigest=await digest(original);
 if(snapshot.provenance?.contentDigest!==sourceDigest)fail('COMBINED_SOURCE_DIGEST_MISMATCH');
 if(draft && (draft.sourceDigest!==sourceDigest||!draft.values||typeof draft.values!=='object'||Array.isArray(draft.values)))fail('COMBINED_DRAFT_DIGEST_MISMATCH');
 if(draft?.saved===false)fail('COMBINED_DRAFT_NOT_SAVED');
 snapshot.sourceBytes=original;
 const schema=await inspectPdfForm(original);
 if(schema.restrictions.some(r=>['encrypted','signed-document','signature-protection','xfa-unsupported','calculated-form-unsupported'].includes(r)))fail('COMBINED_DOCUMENT_RESTRICTED');
 const byKey=new Map(schema.fields.map(field=>[field.key,field])),changes={},draftGroupValues=new Map();
 if(draft)for(const [key,value]of Object.entries(draft.values)){
  const field=byKey.get(key);if(!field)fail('COMBINED_DRAFT_FIELD_UNKNOWN');
  if(draftGroupValues.has(field.groupId)&&draftGroupValues.get(field.groupId)!==value)fail('CONFLICTING_SHARED_FORM_VALUES');
  draftGroupValues.set(field.groupId,value);
  if(value===field.value)continue;
  if(field.readOnly||field.unsupported.length)fail('FORM_FIELD_NOT_EDITABLE');
  changes[key]=value;
 }
 const undone=new Set(records.filter(r=>r.docId===snapshot.id && r.act==='undo' && (r.kind==='undo'||r.kind==='act')).map(r=>r.undoes));
 const marks=records.filter(r=>r.kind==='act'&&r.docId===snapshot.id&&(isTextMarkup(r.act)||['note','important'].includes(r.act))&&!r.undone&&!undone.has(r.id));
 if(!marks.length&&!allowFormOnly)fail('NO_EXPORTABLE_ANNOTATIONS');
 const sourceAnnotations=await annotations(original);
 const annotated=marks.length?await exportAnnotatedPdf(snapshot,records):original.slice();
 const intermediateSchema=await inspectPdfForm(annotated);
 if(canonical(semantics(schema))!==canonical(semantics(intermediateSchema))||canonical(schema.fields.map(f=>[f.key,f.value]))!==canonical(intermediateSchema.fields.map(f=>[f.key,f.value])))fail('COMBINED_FIELD_SCHEMA_CHANGED');
 const annotatedManifest=await annotations(annotated);
 if(!sameAnnotations(sourceAnnotations,annotatedManifest,true))fail('COMBINED_ANNOTATIONS_CHANGED');
 const changedGroups=new Map();for(const [key,value]of Object.entries(changes)){
  const field=byKey.get(key);if(changedGroups.has(field.groupId)&&changedGroups.get(field.groupId)!==value)fail('CONFLICTING_SHARED_FORM_VALUES');changedGroups.set(field.groupId,value);
 }
 const changedFields=schema.fields.filter(field=>changedGroups.has(field.groupId));
 for(const field of changedFields)for(const annotation of annotatedManifest){
  if(annotation.pageIndex!==field.pageIndex)continue;
  const areas=annotation.quads.length?annotation.quads.map(quadBounds):[annotation.rect];
  if(areas.some(area=>overlap(area,field.rect)))fail('COMBINED_MARK_OVERLAPS_CHANGED_WIDGET');
 }
 const bytes=Object.keys(changes).length?await fillPdfForm(annotated,changes):annotated.slice();
 const finalSchema=await inspectPdfForm(bytes);
 if(canonical(semantics(schema))!==canonical(semantics(finalSchema)))fail('COMBINED_FIELD_SCHEMA_CHANGED');
 const finalByKey=new Map(finalSchema.fields.map(field=>[field.key,field]));
 for(const field of schema.fields){const expected=changedGroups.has(field.groupId)?changedGroups.get(field.groupId):field.value;if(finalByKey.get(field.key)?.value!==expected)fail('COMBINED_FIELDS_CHANGED');}
 const finalAnnotations=await annotations(bytes);
 if(!sameAnnotations(annotatedManifest,finalAnnotations))fail('COMBINED_ANNOTATIONS_CHANGED');
 return {bytes,manifest:{sourceDigest,outputDigest:await digest(bytes),changedFieldCount:changedGroups.size,committedMarkCount:marks.length,
  localAnnotationCount:finalAnnotations.length-sourceAnnotations.length,annotationCount:finalAnnotations.length,
  fields:finalSchema.fields.map(({key,name,type,value})=>({key,name,type,value})),annotations:finalAnnotations}};
}
