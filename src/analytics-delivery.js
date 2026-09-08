import {JOURNAL_INTENTS,JOURNAL_STATUSES,JOURNAL_OUTCOMES} from './command-journal.js';
import {CAPTURE_JOURNAL_REASONS} from './capture-journal.js';
// Public project-token capture only. PostHog batch schema:
// https://posthog.com/docs/api/capture#batch-events
const KEY='jett.analytics-delivery.v1',MAX_QUEUE=1000,MAX_ACK=5000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROPS=new Set(['distinct_id','command_id','capture_id','event_index','source','elapsed_ms','stage','status','at','intent','expected','actual','durationMs','feedback_rating','feedback_expected_intent','blockIndex','tokenStart','tokenEnd','confidence','captureState','reason','processingMode','audioHeld','$process_person_profile']);
function clean(event){
 if(!event||!UUID.test(event.uuid)||!/^jett_command_(heard|intent|target|result|feedback|capture)$/.test(event.event)||typeof event.timestamp!=='string'||!Number.isFinite(Date.parse(event.timestamp)))return null;
 const properties={};if(!event.properties||typeof event.properties!=='object')return null;
 const enums={source:['voice','pointer','sim'],stage:['capture','heard','intent','target','result','feedback'],status:JOURNAL_STATUSES,intent:JOURNAL_INTENTS,expected:JOURNAL_OUTCOMES,actual:JOURNAL_OUTCOMES,feedback_rating:['worked','missed','not-rated'],feedback_expected_intent:JOURNAL_INTENTS,captureState:['starting','listening','reconnecting','paused','error','denied','unavailable','local-unavailable','off'],reason:CAPTURE_JOURNAL_REASONS,processingMode:['local','browser','unknown']};
 for(const [key,value]of Object.entries(event.properties)){
  if(!PROPS.has(key))continue;
  if(enums[key]){if(enums[key].includes(value))properties[key]=value;continue;}
  if(key==='distinct_id'){if(typeof value==='string'&&UUID.test(value))properties[key]=value;continue;}
  if(key==='command_id'||key==='capture_id'){if(typeof value==='string'&&value.startsWith('cmd-')&&UUID.test(value.slice(4)))properties[key]=value;continue;}
  if(key==='audioHeld'||key==='$process_person_profile'){if(typeof value==='boolean')properties[key]=value;continue;}
  const maximum=key==='at'?8640000000000000:key==='confidence'?1:key==='durationMs'||key==='elapsed_ms'?3600000:10000000;
  if(typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=maximum&&(['confidence','durationMs','elapsed_ms','at'].includes(key)||Number.isInteger(value)))properties[key]=value;
 }
 if(!properties.distinct_id)return null;properties.$process_person_profile=false;
 return {uuid:event.uuid,event:event.event,timestamp:new Date(event.timestamp).toISOString(),properties};
}
const localLocks=new WeakMap();
export function createAnalyticsDelivery(options={}){
 let storage;try{storage=options.storage===undefined?globalThis.localStorage:options.storage;}catch{storage=null;}
 const request=options.fetch??globalThis.fetch,now=options.now??Date.now,schedule=options.schedule??setTimeout,cancel=options.cancel??clearTimeout;
 const locks=options.locks??globalThis.navigator?.locks,eventTarget=options.eventTarget??globalThis;
 const browser=typeof window!=='undefined',coordinated=!!locks?.request||!browser;
 const PREF=KEY+'.enabled';
 let configured=false,endpoint;try{const url=new URL(options.endpoint);configured=typeof options.token==='string'&&/^phc_[A-Za-z0-9_-]+$/.test(options.token)&&!url.username&&!url.password&&!url.search&&!url.hash&&/^\/batch\/?$/.test(url.pathname)&&(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname));if(configured)endpoint=url.href;}catch{}
 let locallyDisabled=false,enabled=true,queue=[],acked=[],attempt=0,nextRetryAt=0,lastError=null,timer=null,flight=null,generation=0,disposed=false,persisted=true;const listeners=new Set();
 function exclusive(name,fn){if(locks?.request)return locks.request(name,fn);if(!storage)return Promise.resolve().then(fn);let map=localLocks.get(storage);if(!map){map=new Map();localLocks.set(storage,map);}const prior=map.get(name)??Promise.resolve();const pending=prior.catch(()=>{}).then(fn);map.set(name,pending);return pending;}
 function preference(){if(locallyDisabled)return false;try{return storage?.getItem(PREF)!=='false';}catch{persisted=false;lastError='storage-unavailable';return false;}}
 function refresh(){try{enabled=preference();const raw=storage?.getItem(KEY);if(!raw){queue=[];acked=[];return;}if(raw.length>3000000)throw Error();const value=JSON.parse(raw);if(value.version!==1||!Array.isArray(value.queue)||value.queue.length>MAX_QUEUE)throw Error();const seen=new Set();queue=value.queue.map(clean).filter(v=>v&&!seen.has(v.uuid)&&seen.add(v.uuid));acked=Array.isArray(value.acked)?value.acked.filter(v=>typeof v==='string'&&UUID.test(v)).slice(-MAX_ACK):[];attempt=Number.isInteger(value.attempt)?Math.max(0,Math.min(value.attempt,10)):0;nextRetryAt=Number.isFinite(value.nextRetryAt)?Math.max(0,Math.min(value.nextRetryAt,now()+60000)):0;persisted=true;}catch{lastError='storage-invalid';persisted=false;}}
 function state(){return {enabled,configured,pending:queue.length,sending:!!flight,nextRetryAt,attempt,lastError,storageAvailable:persisted,coordination:locks?.request?'cross-tab':browser?'unavailable':'process-local',disposed,status:disposed?'disposed':!enabled?'disabled':!configured?'unconfigured':!coordinated?'coordination-unavailable':!persisted?'storage-unavailable':flight?'sending':queue.length?'pending':'idle'};}
 function notify(){for(const listener of listeners)try{listener(state());}catch{}}
 function persist(){try{if(!storage)throw Error();storage.setItem(KEY,JSON.stringify({version:1,queue,acked,attempt,nextRetryAt}));persisted=true;return true;}catch{persisted=false;lastError='storage-unavailable';return false;}}
 function stopTimer(){if(timer!==null)cancel(timer);timer=null;}
 function abort(){generation++;stopTimer();flight?.controller.abort();if(flight?.timeout!==undefined)cancel(flight.timeout);flight=null;}
 function plan(){if(disposed||!enabled||!configured||!coordinated||!queue.length||flight||timer!==null||!persisted)return;timer=schedule(()=>{timer=null;void api.flush({automatic:true});},Math.max(0,nextRetryAt-now()));}
 async function update(fn){return exclusive(KEY,async()=>{refresh();const result=await fn();notify();return result;});}
 const api={
  getState:state,
  subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
  async enqueue(events){const result=await update(()=>{const acceptedIds=[],duplicateIds=[],rejectedIds=[];if(!Array.isArray(events))return {accepted:0,duplicate:0,rejected:1,acceptedIds,duplicateIds,rejectedIds};let bytes=JSON.stringify(queue).length;const seen=new Set([...acked,...queue.map(v=>v.uuid)]);for(const event of events){const value=clean(event);if(!value||disposed||!enabled){rejectedIds.push(event?.uuid??null);continue;}if(seen.has(value.uuid)){duplicateIds.push(value.uuid);continue;}const size=JSON.stringify(value).length+1;if(queue.length>=MAX_QUEUE||bytes+size>2000000){rejectedIds.push(value.uuid);lastError='queue-full';continue;}queue.push(value);bytes+=size;seen.add(value.uuid);acceptedIds.push(value.uuid);}if(!persist()){rejectedIds.push(...acceptedIds);acceptedIds.length=0;}return {accepted:acceptedIds.length,duplicate:duplicateIds.length,rejected:rejectedIds.length,acceptedIds,duplicateIds,rejectedIds};});plan();return result;},
  async flush({automatic=false}={}){
   if(disposed||!configured||!coordinated)return state();
   return exclusive(KEY+'.send',async()=>{
    if(disposed)return state();stopTimer();let batch,version,controller;
    await update(()=>{if(!enabled||!queue.length||!persisted||automatic&&nextRetryAt>now())return;batch=queue.slice(0,50);version=generation;controller=new AbortController();flight={controller};});
    if(!batch){plan();return state();}let timeout;
    try{if(version!==generation||disposed||!preference()){enabled=preference();return state();}const response=await Promise.race([request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal,body:JSON.stringify({api_key:options.token,batch,historical_migration:false})}),new Promise((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});timeout=schedule(()=>{controller.abort();reject(Error('request-timeout'));},20000);if(flight)flight.timeout=timeout;})]);
     if(version!==generation||disposed||!preference())return state();
     if(!response?.ok)throw Error('http-'+(Number.isInteger(response?.status)?response.status:'failed'));
     await update(()=>{if(version!==generation||disposed||!enabled)return;const ids=new Set(batch.map(v=>v.uuid));queue=queue.filter(v=>!ids.has(v.uuid));acked=[...new Set([...acked,...ids])].slice(-MAX_ACK);attempt=0;nextRetryAt=0;lastError=null;persist();});
    }catch(error){if(version===generation&&!disposed&&preference())await update(()=>{if(!enabled)return;attempt=Math.min(attempt+1,10);nextRetryAt=now()+Math.min(1000*2**(attempt-1),60000);lastError=String(error.message).startsWith('http-')?String(error.message):'network-error';persist();});}
    finally{if(timeout!==undefined)cancel(timeout);if(version===generation){flight=null;notify();plan();}}
    return state();
   });
  },
  async setEnabled(value){if(disposed)return;const nextEnabled=value===true;enabled=nextEnabled;locallyDisabled=!nextEnabled;abort();try{if(!storage)throw Error();storage.setItem(PREF,String(nextEnabled));locallyDisabled=false;}catch{persisted=false;lastError='storage-unavailable';notify();return;}await update(()=>{if(!nextEnabled){acked=[...new Set([...acked,...queue.map(v=>v.uuid)])].slice(-MAX_ACK);queue=[];}attempt=0;nextRetryAt=0;persist();});plan();},
  dispose(){if(disposed)return;disposed=true;abort();eventTarget.removeEventListener?.('storage',storageChanged);listeners.clear();},
 };
 function storageChanged(event){if(event.key!==KEY&&event.key!==PREF&&event.key!==null)return;if(!preference()){enabled=false;abort();queue=[];}else refresh();notify();plan();}
 refresh();eventTarget.addEventListener?.('storage',storageChanged);if(!enabled)void update(()=>{acked=[...new Set([...acked,...queue.map(v=>v.uuid)])].slice(-MAX_ACK);queue=[];persist();});plan();return Object.freeze(api);
}
