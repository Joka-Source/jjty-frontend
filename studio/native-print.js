import {extractPdfPages} from '../src/pdf-extract.js';
let active=null;
function fail(code,message=code){const e=new Error(message);e.code=code;throw e;}
function base64(bytes){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
const validId=id=>(Number.isSafeInteger(id)&&id>=0)||(typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id));
function pages(ranges){if(!Array.isArray(ranges)||!ranges.length||ranges.length>10000)fail('PRINT_INVALID_RANGES');const selected=[],seen=new Set();for(const range of ranges){const start=Array.isArray(range)?range[0]:range?.start,end=Array.isArray(range)?range[1]:range?.end;if(Array.isArray(range)&&range.length!==2)fail('PRINT_INVALID_RANGES');if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end-start>=10000)fail('PRINT_INVALID_RANGES');for(let i=start;i<=end;i++){if(seen.has(i)||selected.length>=10000)fail('PRINT_INVALID_RANGES');seen.add(i);selected.push(i);}}return selected.sort((a,b)=>a-b);}
/**
 * Own one frozen PDF until the native adapter reports terminal:true.
 * pages-requested ranges are zero-based inclusive {start,end} (or [start,end]).
 * Return handleEvent for adapters/tests; by default also listen on window.
 * onStatus describes adapter preparation/dialog state, never physical printing.
 */
export function beginNativePrint(bytes,filename,{bridge,onStatus=()=>{},eventTarget=globalThis.window}={}){
 if(active)fail('PRINT_BUSY','Finish the current print dialog before starting another.');
 if(!(bytes instanceof Uint8Array||bytes instanceof ArrayBuffer)||!bytes.byteLength)fail('PRINT_SOURCE_INVALID');
 if(typeof filename!=='string'||!filename.trim()||filename.length>255||/[\u0000-\u001F]/.test(filename))fail('PRINT_FILENAME_INVALID');
 if(!bridge||['print','write','fail'].some(name=>typeof bridge[name]!=='function'))fail('PRINT_BRIDGE_UNAVAILABLE');
 let frozen=new Uint8Array(bytes).slice(),terminal=false,generation=0,queue=Promise.resolve();
 const requests=new Set(),owner={};active=owner;
 const current=()=>!terminal&&active===owner;
 // A status consumer must not break adapter cleanup or custody.
 const notify=detail=>{try{onStatus(Object.freeze({...detail}));}catch{}};
 const close=()=>{if(terminal)return;terminal=true;generation++;frozen=null;eventTarget?.removeEventListener('jetty-native-print',listener);eventTarget?.removeEventListener('pagehide',unload);if(active===owner)active=null;};
 const unload=()=>close();
 function handleEvent(event){const detail=event?.detail??event;if(!current()||!detail||typeof detail.status!=='string')return Promise.resolve();
  if(detail.terminal===true){notify({status:detail.status,message:String(detail.message||''),terminal:true});close();return Promise.resolve();}
  if(detail.status!=='pages-requested'){notify({status:detail.status,message:String(detail.message||''),terminal:false});return Promise.resolve();}
  const id=detail.requestId;
  if(!validId(id)){notify({status:'error',message:'The print adapter sent an invalid request identifier.',terminal:false});return Promise.resolve();}
  // Never answer an ID twice: the native callback may already be closed.
  if(requests.has(id)){notify({status:'error',message:'A duplicate print page request was ignored.',requestId:id,terminal:false});return Promise.resolve();}
  requests.add(id);const version=++generation;let selection;
  try{selection=pages(detail.ranges);}catch(e){try{bridge.fail(id);}catch{}notify({status:'error',message:'The requested print pages are invalid.',requestId:id,terminal:false});return Promise.resolve();}
  const snapshot=frozen;
  const pending=queue.catch(()=>{}).then(async()=>{
   if(!current()||version!==generation)return;
   notify({status:'preparing-pages',message:'Preparing the requested PDF pages.',requestId:id,terminal:false});
   try{const subset=await extractPdfPages(snapshot,selection);if(!current()||version!==generation)return;bridge.write(id,base64(subset));notify({status:'pages-ready',message:'Requested pages sent to the print adapter.',requestId:id,terminal:false});}
   catch(error){if(!current()||version!==generation)return;try{bridge.fail(id);}catch{}notify({status:'error',message:'The requested PDF pages could not be prepared. '+error.message,requestId:id,terminal:false});}
  });queue=pending;return pending;
 }
 const listener=event=>{void handleEvent(event);};
 eventTarget?.addEventListener('jetty-native-print',listener);eventTarget?.addEventListener('pagehide',unload);
 try{bridge.print(base64(frozen),filename);}catch(error){notify({status:'error',message:error.message,terminal:true});close();throw error;}
 return Object.freeze({handleEvent,get pending(){return current();},cleanup({unload=false}={}){if(current()&&!unload)fail('PRINT_PENDING','Keep this PDF until the print adapter finishes.');close();}});
}
