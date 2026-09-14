import * as m from 'mupdf';
import {rectify,validateQuad} from './raster.js';
import {embedRecognition} from './searchable.js';
const full=[[0,0],[1,0],[1,1],[0,1]];
const fail=code=>{throw new Error(`SCAN_${code}`);};
const clone=v=>structuredClone(v);
const now=()=>performance.now();
export const SCAN_LIMITS=Object.freeze({pages:50,sourceBytes:25000000,totalBytes:150000000,pixels:24000000});
function imageInfo(bytes){
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>SCAN_LIMITS.sourceBytes)fail('IMAGE_LIMIT');
 const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71,jpeg=bytes[0]===255&&bytes[1]===216;
 if(!png&&!jpeg)fail('IMAGE_FORMAT');
 let image;try{image=new m.Image(bytes);const width=image.getWidth(),height=image.getHeight();if(width<2||height<2||width*height>SCAN_LIMITS.pixels)fail('PIXEL_LIMIT');return {width,height,mime:png?'image/png':'image/jpeg'};}finally{image?.destroy();}
}
async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
/** In-memory store is intentionally non-durable; use IndexedDBScanStore in browsers. */
export class MemoryScanStore{#data=new Map();async save(id,value,expectedRevision){if(expectedRevision!==undefined&&(this.#data.get(id)?.revision??0)!==expectedRevision)fail('CHECKPOINT_CONFLICT');this.#data.set(id,clone(value));}async load(id){return clone(this.#data.get(id)??null);}}
export async function processImage(bytes,edits){
 imageInfo(bytes);const image=new m.Image(bytes);let pix,converted,outPix;
 try{
  pix=image.toPixmap();converted=pix.convertToColorSpace(m.ColorSpace.DeviceRGB,true);
  const width=converted.getWidth(),height=converted.getHeight(),components=converted.getNumberOfComponents(),stride=converted.getStride(),pixels=converted.getPixels(),data=new Uint8ClampedArray(width*height*4);
  if(components!==3&&components!==4)fail('COLORSPACE');
  // keepAlpha preserves an existing channel; it does not add one to RGB/JPEG.
  // MuPDF pixels are premultiplied. Flatten transparency over paper white.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const s=y*stride+x*components,d=(y*width+x)*4,alpha=components===4?pixels[s+3]:255;for(let c=0;c<3;c++)data[d+c]=pixels[s+c]+255-alpha;data[d+3]=255;}
  const frame={width,height,data};
  const out=rectify(frame,edits.quad,edits);
  outPix=new m.Pixmap(m.ColorSpace.DeviceRGB,[0,0,out.width,out.height],false);const rgb=outPix.getPixels();for(let i=0;i<out.width*out.height;i++){rgb[i*3]=out.data[i*4];rgb[i*3+1]=out.data[i*4+1];rgb[i*3+2]=out.data[i*4+2];}
  return {bytes:new Uint8Array(outPix.asPNG()),mime:'image/png',width:out.width,height:out.height};
 }finally{outPix?.destroy();converted?.destroy();pix?.destroy();image.destroy();}
}
function pdfFromPages(pages){
 const doc=new m.PDFDocument();try{
  for(const page of pages){const image=new m.Image(page.bytes);let ref,obj;try{
   ref=doc.addImage(image);const w=image.getWidth()*72/150,h=image.getHeight()*72/150;
   obj=doc.addPage([0,0,w,h],0,{XObject:{Scan:ref}},`q ${w} 0 0 ${h} 0 0 cm /Scan Do Q`);doc.insertPage(-1,obj);
  }finally{obj?.destroy();ref?.destroy();image.destroy();}}
  const buffer=doc.saveToBuffer({compress:true});try{return new Uint8Array(buffer.asUint8Array());}finally{buffer.destroy();}
 }finally{doc.destroy();}
}
export async function createScanSession({store,processor=processImage,ocr,id=crypto.randomUUID()}={}){
 if(!store?.load||!store?.save||typeof processor!=='function'||typeof id!=='string'||!id.length||id.length>128)fail('INVALID_CONFIG');
 let state=await store.load(id)??{version:1,id,pages:[],assets:[]};
 if(state.version!==1||state.id!==id||!Array.isArray(state.pages)||!Array.isArray(state.assets)||state.pages.length>SCAN_LIMITS.pages)fail('CHECKPOINT_INVALID');
 const assetIds=new Set(),pageIds=new Set();let sourceBytes=0;
 for(const asset of state.assets){
  if(!asset||typeof asset.id!=='string'||assetIds.has(asset.id)||!['active','removed','superseded'].includes(asset.status))fail('CHECKPOINT_INVALID');
  assetIds.add(asset.id);const info=imageInfo(asset.bytes);sourceBytes+=asset.bytes.length;
  if(sourceBytes>SCAN_LIMITS.totalBytes||info.width!==asset.width||info.height!==asset.height||info.mime!==asset.mime)fail('CHECKPOINT_INVALID');
  if(await digest(asset.bytes)!==asset.sha256)fail('CHECKPOINT_DIGEST');
 }
 for(const page of state.pages){
  const asset=state.assets.find(a=>a.id===page.assetId);
  if(typeof page.id!=='string'||pageIds.has(page.id)||!asset||asset.pageId!==page.id||asset.status!=='active'||![0,90,180,270].includes(page.rotation)||typeof page.enhance!=='boolean')fail('CHECKPOINT_INVALID');
  try{validateQuad(page.quad);}catch{fail('CHECKPOINT_INVALID');}pageIds.add(page.id);
 }
 if(state.assets.some(a=>a.status==='active'&&!state.pages.some(p=>p.assetId===a.id)))fail('CHECKPOINT_INVALID');
 let busy=false,generation=0;
 const exclusive=async fn=>{if(busy)fail('BUSY');busy=true;try{return await fn();}finally{busy=false;}};
 const commit=async next=>{const revision=state.revision??0;next.revision=revision+1;await store.save(id,next,revision);state=next;};
 const find=(next,pageId)=>{const p=next.pages.find(p=>p.id===pageId);if(!p)fail('PAGE_MISSING');return p;};
 async function assetFor(next,input,pageId){
  const bytes=input instanceof Uint8Array?input.slice():input;const info=imageInfo(bytes);
  if(next.assets.reduce((n,a)=>n+a.bytes.length,0)+bytes.length>SCAN_LIMITS.totalBytes)fail('TOTAL_LIMIT');
  return {id:crypto.randomUUID(),pageId,bytes,...info,sha256:await digest(bytes),status:'active'};
 }
 return {
  id,get pages(){return clone(state.pages);},
  source(pageId){const page=find(state,pageId);return clone(state.assets.find(a=>a.id===page.assetId));},
  movePage(pageId,index){return exclusive(async()=>{if(!Number.isInteger(index)||index<0||index>=state.pages.length)fail('ORDER_INVALID');const next=clone(state),page=find(next,pageId);next.pages=next.pages.filter(p=>p.id!==pageId);next.pages.splice(index,0,page);await commit(next);});},
  addPage(input){return exclusive(async()=>{if(state.pages.length>=SCAN_LIMITS.pages)fail('PAGE_LIMIT');const next=clone(state),pageId=crypto.randomUUID(),asset=await assetFor(next,input,pageId);next.assets.push(asset);next.pages.push({id:pageId,assetId:asset.id,quad:clone(full),rotation:0,enhance:false});await commit(next);return pageId;});},
  editPage(pageId,edits){return exclusive(async()=>{const next=clone(state),page=find(next,pageId);if(edits.quad!==undefined)page.quad=validateQuad(edits.quad);if(edits.rotation!==undefined){if(![0,90,180,270].includes(edits.rotation))fail('INVALID_ROTATION');page.rotation=edits.rotation;}if(edits.enhance!==undefined){if(typeof edits.enhance!=='boolean')fail('INVALID_ENHANCEMENT');page.enhance=edits.enhance;}await commit(next);});},
  retakePage(pageId,input){return exclusive(async()=>{const next=clone(state),page=find(next,pageId),asset=await assetFor(next,input,pageId);next.assets.find(a=>a.id===page.assetId).status='superseded';next.assets.push(asset);Object.assign(page,{assetId:asset.id,quad:clone(full),rotation:0,enhance:false});await commit(next);});},
  removePage(pageId){return exclusive(async()=>{const next=clone(state),page=find(next,pageId);next.assets.find(a=>a.id===page.assetId).status='removed';next.pages=next.pages.filter(p=>p.id!==pageId);await commit(next);});},
  cancel(){generation++;processor.cancel?.();},
  finish({title='Scan'}={}){return exclusive(async()=>{
   if(!state.pages.length)fail('EMPTY');if(typeof title!=='string'||title.length>200)fail('TITLE_INVALID');
   const token=generation,sessionId=state.id,sourceRevision=state.revision??0,check=()=>{if(token!==generation)fail('CANCELLED');},start=now(),timings=[],diagnostics=[],processed=[],recognition=[];
   for(const page of state.pages){
    check();const source=state.assets.find(a=>a.id===page.assetId);if(!source)fail('SOURCE_MISSING');const t=now();
    const out=await processor(source.bytes.slice(),clone(page));check();imageInfo(out.bytes);processed.push(out);timings.push({stage:'processing',pageId:page.id,ms:now()-t});
    if(ocr){const t=now();try{const result=await ocr({...out,bytes:out.bytes.slice()});check();if(!result||typeof result.text!=='string')fail('OCR_RESULT');recognition.push({...result,pageId:page.id,sourceSha256:source.sha256});}catch(error){check();diagnostics.push({code:'OCR_FAILED',pageId:page.id});}timings.push({stage:'ocr',pageId:page.id,ms:now()-t});}
   }
   check();const t=now(),basePdf=pdfFromPages(processed),{pdfBytes,embeddedPages}=embedRecognition(basePdf,recognition,state.pages.map(p=>p.id));check();timings.push({stage:'pdf',ms:now()-t},{stage:'total',ms:now()-start});
   const verified=new m.PDFDocument(pdfBytes);try{if(verified.countPages()!==state.pages.length)fail('PDF_READBACK');}finally{verified.destroy();}
   // Original assets remain in the checkpoint even after export. Host commits document + assets.
   const status=!ocr?'unsupported':embeddedPages.length===state.pages.length?'searchable':embeddedPages.length?'partially-searchable':recognition.length===state.pages.length?'sidecar-only':recognition.length?'partial':'failed';
   for(const result of recognition)if(!embeddedPages.includes(result.pageId))diagnostics.push({code:'OCR_NOT_EMBEDDED',pageId:result.pageId});
   return {sessionId,sourceRevision,pdfBytes,title,mime:'application/pdf',sourceAssets:clone(state.assets),ocr:{status,pages:recognition},timings,diagnostics};
  });}
 };
}
