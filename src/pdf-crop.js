import {inspectPdfForm} from './pdf-forms.js';
import {snapshotPdfStructure} from './pdf-structure.js';
function fail(code){const e=new Error(`CROP_${code}`);e.code=e.message;throw e;}
function owned(input){if(!(input instanceof Uint8Array||input instanceof ArrayBuffer)||!input.byteLength)fail('INVALID_BYTES');return new Uint8Array(input).slice();}
const close=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<0.01);
async function open(input){const bytes=owned(input);const schema=await inspectPdfForm(bytes);if(schema.restrictions.some(r=>['encrypted','signed-document','signature-protection','xfa-unsupported','calculated-form-unsupported'].includes(r)))fail('DOCUMENT_RESTRICTED');const m=await import('mupdf'),doc=new m.PDFDocument(bytes);try{doc.disableJS();if(!doc.hasPermission('assemble'))fail('PERMISSION_DENIED');return {doc,m};}catch(e){doc.destroy();throw e;}}
function pageInfo(doc,pageIndex){if(!Number.isSafeInteger(pageIndex)||pageIndex<0||pageIndex>=doc.countPages())fail('PAGE_OUT_OF_RANGE');const p=doc.loadPage(pageIndex),o=p.getObject(),crop=o.get('CropBox'),inherited=o.getInheritable('CropBox');try{return {pageIndex,pageCount:doc.countPages(),bounds:[...p.getBounds()],transform:[...p.getTransform()],cropBox:inherited.isNull()?null:inherited.asJS(),explicitCropBox:crop.isNull()?null:crop.asJS()};}finally{inherited.destroy();crop.destroy();o.destroy();p.destroy();}}
/** Displayed top-left coordinates, in points, including crop, rotation and UserUnit. */
export async function inspectPdfCrop(input,pageIndex){const {doc}=await open(input);try{return {...pageInfo(doc,pageIndex),hidesContent:true};}finally{doc.destroy();}}
function toPdf(rect,t){const [a,b,c,d,e,f]=t,det=a*d-b*c;if(!Number.isFinite(det)||Math.abs(det)<1e-12)fail('TRANSFORM_INVALID');const points=[[rect[0],rect[1]],[rect[2],rect[1]],[rect[2],rect[3]],[rect[0],rect[3]]].map(([x,y])=>[(d*(x-e)-c*(y-f))/det,(-b*(x-e)+a*(y-f))/det]);return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];}
/** Shrink CropBox on a fresh copy. Hidden content remains in the PDF; not redaction. */
export async function cropPdfPages(input,changes){
 if(!Array.isArray(changes)||!changes.length)fail('INVALID_CHANGES');
 const requested=changes.map(c=>{if(!c||!Number.isSafeInteger(c.pageIndex)||!Array.isArray(c.rect)||c.rect.length!==4||c.rect.some(n=>typeof n!=='number'||!Number.isFinite(n)))fail('INVALID_RECT');return {pageIndex:c.pageIndex,rect:[...c.rect]};});
 if(new Set(requested.map(c=>c.pageIndex)).size!==requested.length)fail('DUPLICATE_PAGE');
 const {doc,m}=await open(input);
 try{
  const originals=Array.from({length:doc.countPages()},(_,i)=>pageInfo(doc,i));
  for(const change of requested){const info=originals[change.pageIndex];if(!info)fail('PAGE_OUT_OF_RANGE');const r=change.rect,b=info.bounds;if(r[0]<b[0]||r[1]<b[1]||r[2]>b[2]||r[3]>b[3]||r[2]<=r[0]||r[3]<=r[1])fail('RECT_OUT_OF_BOUNDS');change.pdfRect=toPdf(r,info.transform);}
  const indices=originals.map(i=>i.pageIndex),before=await snapshotPdfStructure(doc,indices);
  for(const change of requested){const page=doc.loadPage(change.pageIndex);try{page.setPageBox('CropBox',change.rect);}finally{page.destroy();}}
  const buffer=doc.saveToBuffer();let output;try{output=new Uint8Array(buffer.asUint8Array());}finally{buffer.destroy();}
  const check=new m.PDFDocument(output);
  try{
   check.disableJS();if(check.countPages()!==originals.length)fail('READBACK_PAGE_COUNT');
   for(const old of originals){const actual=pageInfo(check,old.pageIndex),change=requested.find(c=>c.pageIndex===old.pageIndex);if(change){if(!close(actual.cropBox,change.pdfRect)||Math.abs((actual.bounds[2]-actual.bounds[0])-(change.rect[2]-change.rect[0]))>0.01||Math.abs((actual.bounds[3]-actual.bounds[1])-(change.rect[3]-change.rect[1]))>0.01)fail('READBACK_GEOMETRY');}else if(JSON.stringify(actual)!==JSON.stringify(old))fail('READBACK_UNCHANGED_PAGE');}
   // Normalize only allowed CropBox edits in this disposable verification copy.
   // Full structural comparison then checks streams, resources, annotations,
   // forms, catalog, other boxes and metadata using the existing custody helper.
   for(const change of requested){const p=check.loadPage(change.pageIndex),o=p.getObject();try{const original=originals[change.pageIndex].explicitCropBox;if(original===null)o.delete('CropBox');else o.put('CropBox',original);}finally{o.destroy();p.destroy();}}
   if(JSON.stringify(await snapshotPdfStructure(check,indices))!==JSON.stringify(before))fail('CONTENT_CHANGED');
  }finally{check.destroy();}
  return output;
 }finally{doc.destroy();}
}
