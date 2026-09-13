import {validate} from './model.js';
let database;
function openDatabase() {
  return database ||= new Promise((resolve,reject)=>{
    const req=indexedDB.open('jett-notebooks',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('workspace');
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>{database=null;reject(req.error);};
  });
}
const empty=()=>({version:1,notebooks:[]});
let baseline=empty(), writes=Promise.resolve();
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function conflict(){const e=new Error('Notebook changed in another workspace. Your draft is kept; reload or export it before resolving the conflict.');e.code='NOTEBOOK_CONFLICT';throw e;}
/** Synchronous mutation runs against the latest value in one atomic transaction. */
export async function updateWorkspace(mutate) {
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('workspace','readwrite'),store=tx.objectStore('workspace');
    let result,reason;
    const req=store.get('current');
    req.onsuccess=()=>{try{const data=validate(req.result||empty());result=mutate(data);store.put(validate(data),'current');}catch(e){reason=e;tx.abort();}};
    tx.oncomplete=()=>resolve(structuredClone(result));
    tx.onerror=()=>reject(reason||tx.error);
    tx.onabort=()=>reject(reason||tx.error||Error('Storage write aborted'));
  });
}
export async function readWorkspace() {
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const req=db.transaction('workspace').objectStore('workspace').get('current');
    req.onsuccess=()=>{try{resolve(req.result?validate(req.result):undefined);}catch(e){reject(e);}};
    req.onerror=()=>reject(req.error);
  });
}
export async function loadWorkspace() {
  const value=await readWorkspace();baseline=value?structuredClone(value):empty();return value;
}
function revisions(next,previous) {
  const copy=structuredClone(next);
  copy.revision=(previous?.revision||0)+1;
  // Existing notebook UI edits text items without knowing the source-note API.
  // Bump those item revisions here so stale source-note edits cannot overwrite it.
  if(copy.sourceRef)for(const page of copy.pages)for(const item of page.items){
    if(!item.sourceAnchor)continue;
    const old=previous?.pages.flatMap(p=>p.items).find(i=>i.id===item.id);
    const withoutRevision=i=>i?{...i,revision:undefined}:i;
    item.revision=old?(equal(withoutRevision(old),withoutRevision(item))?old.revision:(old.revision||0)+1):1;
  }
  return copy;
}
/** Merge disjoint notebook changes; never replace an unseen external notebook. */
export async function saveWorkspace(data) {
  const owned=validate(data);
  const operation=writes.catch(()=>{}).then(async()=>{
    await updateWorkspace(latest=>{
      const prior=new Map(baseline.notebooks.map(n=>[n.id,n]));
      const incoming=new Map(owned.notebooks.map(n=>[n.id,n]));
      const current=new Map(latest.notebooks.map(n=>[n.id,n]));
      for(const id of new Set([...prior.keys(),...incoming.keys()])){
        const before=prior.get(id),next=incoming.get(id);
        if(equal(before,next))continue;
        // Ignore server-managed revision changes when checking our own snapshot.
        const comparable=n=>n?{...n,revision:undefined,pages:n.pages.map(p=>({...p,items:p.items.map(i=>({...i,revision:undefined}))}))}:n;
        if(!equal(comparable(before),comparable(current.get(id))))conflict();
        if(next)current.set(id,revisions(next,current.get(id)));else current.delete(id);
      }
      latest.notebooks=[...current.values()];
    });
    // Baseline tracks what this caller actually saw, not unseen merged records.
    baseline=structuredClone(owned);
  });
  writes=operation;
  return operation;
}
