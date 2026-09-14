/** Dedicated raster worker keeps multi-megapixel correction off the interface thread. */
export function createWorkerProcessor(){
 let worker=null,pending=null,ready=false;
 const discard=()=>{if(worker){worker.onmessage=null;worker.onerror=null;worker.terminate();}worker=null;ready=false;};
 const cancel=()=>{discard();if(pending){pending.reject(new Error('SCAN_CANCELLED'));pending=null;}};
 const process=(bytes,edits)=>new Promise((resolve,reject)=>{
  if(pending){reject(new Error('SCAN_BUSY'));return;}
  try{
   worker??=new Worker(new URL('./processing-worker.js',import.meta.url),{type:'module'});
   const copy=bytes.slice();let sent=false;pending={resolve,reject,send:()=>{if(sent)return;sent=true;try{worker.postMessage({bytes:copy,edits},[copy.buffer]);}catch(error){pending=null;discard();reject(error);}}};worker.onmessage=({data})=>{if(data.ready){ready=true;pending?.send();return;}const p=pending;pending=null;if(!p)return;if(data.error)p.reject(new Error(data.error));else p.resolve(data.result);};
   worker.onerror=()=>{const p=pending;pending=null;discard();p?.reject(new Error('SCAN_PROCESSING_FAILED'));};
   if(ready)pending.send();
  }catch(error){pending=null;discard();reject(error);}
 });
 process.cancel=cancel;process.close=cancel;return process;
}
