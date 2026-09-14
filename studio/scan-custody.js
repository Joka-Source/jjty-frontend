import {ingestPdfBrowser} from '../src/ingest.js';
import {selectAvailablePdfEngine} from '../src/pdf-engine.js';
import {putDocIfAbsent} from '../src/db.js';
const MAX_SOURCE_BYTES=150*1024*1024;
const own=value=>{if(!(value instanceof Uint8Array))throw new Error('Scan bytes are unavailable. Keep the capture and retry.');return value.slice();};
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
/** One document transaction owns the PDF, every retained source, and OCR sidecar. */
export async function saveScanResult(result,{saveDocument=putDocIfAbsent,engine,sessionId}={}){
 const scanId=result?.sessionId,sourceRevision=result?.sourceRevision;
 if(typeof scanId!=='string'||!scanId||!Number.isSafeInteger(sourceRevision)||sourceRevision<0||(sessionId&&scanId!==sessionId))throw new Error('The scan checkpoint could not be identified. Reopen the capture and retry.');
 const pdfBytes=own(result?.pdfBytes);
 if(!pdfBytes.length||pdfBytes.length>100*1024*1024||new TextDecoder().decode(pdfBytes.subarray(0,5))!=='%PDF-')throw new Error('The scan did not produce a readable PDF within the supported size.');
 if(!Array.isArray(result.sourceAssets)||!result.sourceAssets.length)throw new Error('The original scan images are missing. Keep the capture and retry.');
 let total=0;const ids=new Set();
 const sourceAssets=result.sourceAssets.map(asset=>{
  if(!asset||typeof asset.id!=='string'||!asset.id||ids.has(asset.id)||typeof asset.pageId!=='string'||!['active','superseded','removed'].includes(asset.status)||!['image/png','image/jpeg'].includes(asset.mime)||!Number.isSafeInteger(asset.width)||!Number.isSafeInteger(asset.height)||asset.width<1||asset.height<1||asset.width*asset.height>24000000||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('A retained scan image could not be verified. The capture is kept.');
  ids.add(asset.id);const bytes=own(asset.bytes);total+=bytes.length;if(!bytes.length||bytes.length>25*1024*1024||total>MAX_SOURCE_BYTES)throw new Error('The retained scan images exceed the supported size. The capture is kept.');
  return {...structuredClone(asset),bytes};
 });
 // Freeze all callback inputs before asynchronous hashing or ingestion.
 const title=String(result.title||'Scanned document').replace(/\.pdf$/i,'').trim()||'Scanned document';
 const sidecar=structuredClone(result.ocr??null),timings=structuredClone(result.timings??null),diagnostics=structuredClone(result.diagnostics??null);
 for(const asset of sourceAssets)if(await digest(asset.bytes)!==asset.sha256)throw new Error('A retained scan image changed. The capture is kept for recovery.');
 const provider=engine||await selectAvailablePdfEngine({requirePrimary:true});
 const ingested=await ingestPdfBrowser(provider,pdfBytes,{name:title+'.pdf',requirePrimary:true});
 if(ingested.refusal&&ingested.refusal.kind!=='image-only')throw new Error(ingested.refusal.message||'The scanned PDF could not be opened.');
 const identity=await digest(new TextEncoder().encode(JSON.stringify({scanId,sourceRevision,title,sidecar,pdfDigest:await digest(pdfBytes),assets:sourceAssets.map(a=>[a.id,a.sha256,a.status])})));
 const doc={id:'scan-'+identity,title,text:ingested.blocks.map(b=>b.text).join('\n\n'),blocks:ingested.blocks,provenance:ingested.provenance,warnings:ingested.warnings,pdfEngine:ingested.pdfEngine,sourceBytes:ingested.sourceBytes,sourceMime:'application/pdf',createdAt:new Date().toISOString(),revision:1,scanSourceAssets:sourceAssets,scan:{sessionId:scanId,sourceRevision,ocr:sidecar,timings,diagnostics}};
 await saveDocument(doc);
 return {documentId:doc.id};
}
