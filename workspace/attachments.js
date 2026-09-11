const open = () => new Promise((resolve,reject)=>{
 const r=indexedDB.open('jjty-communication-files',1);
 r.onupgradeneeded=()=>r.result.createObjectStore('attachments');
 r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result);
});
export async function attachmentStore(key,file) {
 const db=await open();try{return await new Promise((resolve,reject)=>{
 const tx=db.transaction('attachments',file===undefined?'readonly':'readwrite'),store=tx.objectStore('attachments');
 const request=file===undefined?store.get(key):file===null?store.delete(key):store.put(file,key);
 tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });}finally{db.close();}
}
export async function attachmentEntries(prefix) {
 const db=await open();try{return await new Promise((resolve,reject)=>{
 const tx=db.transaction('attachments','readonly'),results=[];
 const request=tx.objectStore('attachments').openCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));
 request.onsuccess=()=>{const cursor=request.result;if(cursor){results.push(cursor.value);cursor.continue();}};
 tx.oncomplete=()=>resolve(results);tx.onerror=()=>reject(tx.error);
 });}finally{db.close();}
}
