/** Each operation closes its connection; a fulfilled save means transaction committed. */
export class IndexedDBScanStore {
 constructor({name='jt-scan-checkpoints',indexedDB=globalThis.indexedDB}={}){this.name=name;this.indexedDB=indexedDB;}
 async transaction(mode,operation){
  if(!this.indexedDB)throw new Error('SCAN_STORAGE_UNSUPPORTED');
  const db=await new Promise((resolve,reject)=>{
   const request=this.indexedDB.open(this.name,1);
   request.onupgradeneeded=()=>request.result.createObjectStore('sessions');
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
   request.onblocked=()=>reject(new Error('SCAN_STORAGE_BLOCKED'));
  });
  try{return await new Promise((resolve,reject)=>{
   const tx=db.transaction('sessions',mode);let result,failure;
   tx.oncomplete=()=>resolve(result??null);
   tx.onabort=()=>reject(failure??tx.error??new Error('SCAN_STORAGE_ABORTED'));
   tx.onerror=()=>{};
   try{operation(tx.objectStore('sessions'),value=>{result=value;},error=>{failure=error;tx.abort();});}
   catch(error){tx.abort();reject(error);}
  });}finally{db.close();}
 }
 load(id){return this.transaction('readonly',(store,done)=>{const r=store.get(id);r.onsuccess=()=>done(r.result);});}
 save(id,state,expectedRevision){return this.transaction('readwrite',(store,done,abort)=>{
  const write=()=>{const r=store.put(state,id);r.onsuccess=()=>done(r.result);};
  if(expectedRevision===undefined){write();return;}
  const r=store.get(id);r.onsuccess=()=>{if((r.result?.revision??0)!==expectedRevision){abort(new Error('SCAN_CHECKPOINT_CONFLICT'));return;}write();};
 });}
}
