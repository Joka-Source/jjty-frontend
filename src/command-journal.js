// Local diagnostic evidence only. No sender, network API, or inferred effects.
export const JOURNAL_INTENTS=Object.freeze(['unknown','reading','highlight','highlight-range','start-highlighting','end-highlighting','stop-highlighting','annotate','mark-important','math-keep','undo','show-history','open-document','return','send-to','send-to-space','cross-device-drop','gather','togetherness','translate-this','capture','compare','find','quote','remind','share-sheet-intake']);
export const JOURNAL_STATUSES=Object.freeze(['received','parsed','unrecognized','matched','ambiguous','missing','rejected','pending','saved','handled','failed','cancelled','no-op']);
export const JOURNAL_OUTCOMES=Object.freeze(['unknown','none','durable-entry','highlight','note','important','undo','navigation','history','range-start','range-end','reading-target','error']);
const CAPTURE_STATES=['starting','listening','reconnecting','paused','error','denied','unavailable','local-unavailable','off'];
const CAPTURE_REASONS=['none','other','not-allowed','service-not-allowed','phrases-not-supported','no-speech','network','audio-capture','aborted','bad-grammar','language-not-supported','local-unsupported','setup-failed','recognition-no-results','repeated-end','local-track-start-failed','start-failed','invalid-processing-mode','local-probe-failed','local-download-required','local-unavailable','local-audio-unsupported'];
const STAGES=['capture','heard','intent','target','result','feedback'],RATINGS=['worked','missed','not-rated'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createEventUuid(){
 if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
 // getRandomValues is also available on HTTP development origins where
 // randomUUID is absent. Identifiers must not prevent the app from opening.
 const bytes=globalThis.crypto.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
const uuid=createEventUuid;
const pick=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
const text=value=>typeof value==='string'?value.slice(0,2000):undefined;
const clone=value=>JSON.parse(JSON.stringify(value));
export function createCommandJournal(options={}){
 let storage;try{storage=options.storage===undefined?globalThis.localStorage:options.storage;}catch{storage=null;}
 const key=options.key??'jett.command-journal.v1',limit=Number.isInteger(options.limit)?Math.max(1,Math.min(500,options.limit)):200,now=options.now??Date.now;
 let rawOptIn=options.rawOptIn===true,items=[],sequence=0,storageError=null,purgeOnLoad=false;const listeners=new Set();
 const time=()=>{const value=Number(now());return Number.isFinite(value)&&value>=0&&value<=8640000000000000?value:Date.now();};
 function cleanEvent(event){if(!event||!STAGES.includes(event.stage))return null;const out={uuid:UUID.test(event.uuid)?event.uuid:uuid(),stage:event.stage,status:pick(event.status,JOURNAL_STATUSES,'unrecognized'),at:Number.isFinite(event.at)&&event.at>=0&&event.at<=8640000000000000?event.at:time()};
  if(event.stage==='feedback'){out.feedback_rating=pick(event.feedback_rating,RATINGS,'not-rated');if(event.feedback_expected_intent!==undefined)out.feedback_expected_intent=pick(event.feedback_expected_intent,JOURNAL_INTENTS,'unknown');}
  for(const key of['expected','actual'])if(event[key]!==undefined)out[key]=pick(event[key],JOURNAL_OUTCOMES,'unknown');
  if(event.captureState!==undefined)out.captureState=pick(event.captureState,CAPTURE_STATES,'error');
  if(event.reason!==undefined)out.reason=pick(event.reason,CAPTURE_REASONS,'other');
  if(event.processingMode!==undefined)out.processingMode=pick(event.processingMode,['local','browser'],'unknown');
  if(typeof event.audioHeld==='boolean')out.audioHeld=event.audioHeld;
  if(event.intent!==undefined)out.intent=pick(event.intent,JOURNAL_INTENTS,'unknown');
  for(const field of ['blockIndex','tokenStart','tokenEnd']) if(Number.isSafeInteger(event[field])&&event[field]>=0&&event[field]<=10000000)out[field]=event[field];
  if(Number.isFinite(event.durationMs)&&event.durationMs>=0)out.durationMs=Math.min(event.durationMs,3600000);
  if(rawOptIn&&text(event.rawText)!==undefined)out.rawText=text(event.rawText);return out;
 }
 function cleanItem(item){if(!item||!/^cmd-[a-z0-9-]{1,100}$/.test(item.id)||!Number.isFinite(item.startedAt)||item.startedAt<0||item.startedAt>8640000000000000||!Array.isArray(item.events))return null;
  const out={id:item.id,source:pick(item.source,['voice','pointer','sim'],'pointer'),startedAt:item.startedAt,events:item.events.slice(-16).map(cleanEvent).filter(Boolean),feedback:{rating:pick(item.feedback?.rating,RATINGS,'not-rated')}};
  if(typeof item.captureId==='string'&&/^cmd-[a-z0-9-]{1,100}$/.test(item.captureId))out.captureId=item.captureId;
  if(item.feedback?.expectedIntent!==undefined)out.feedback.expectedIntent=pick(item.feedback.expectedIntent,JOURNAL_INTENTS,'unknown');
  if(rawOptIn&&text(item.feedback?.correction)!==undefined)out.feedback.correction=text(item.feedback.correction);return out;
 }
 try{const saved=storage?.getItem(key);if(saved&&saved.length<=2500000){const data=JSON.parse(saved);purgeOnLoad=!rawOptIn;if(data.version===1&&Array.isArray(data.items)){const seen=new Set();items=data.items.slice(-limit).map(cleanItem).filter(item=>item&&!seen.has(item.id)&&seen.add(item.id));}}}catch{storageError='storage-unavailable';}
 function exported(item,event){const {rawText,uuid,...metadata}=event;return {uuid,event:'jett_command_'+event.stage,timestamp:new Date(event.at).toISOString(),properties:{$process_person_profile:false,distinct_id:'local-command-journal',command_id:item.id,...(item.captureId?{capture_id:item.captureId}:{}),source:item.source,elapsed_ms:Math.max(0,event.at-item.startedAt),...metadata}};}
 function publish(events=[]){try{let encoded=JSON.stringify({version:1,items});while(encoded.length>2000000&&items.length){items.shift();encoded=JSON.stringify({version:1,items});}storage?.setItem(key,encoded);storageError=storage?'': 'storage-unavailable';}catch{storageError='storage-unavailable';}for(const listener of listeners)try{listener(clone(events));}catch{/* Observers do not affect recording. */}}
 if(purgeOnLoad)publish();
 const api={
  begin({source='voice',rawText,stage='heard',captureId}={}){const startedAt=time();const suffix=uuid();
   const id='cmd-'+suffix,entry={id,source:pick(source,['voice','pointer','sim'],'pointer'),startedAt,events:[cleanEvent({stage:stage==='capture'?'capture':'heard',status:stage==='capture'?'pending':'received',at:startedAt,rawText})],feedback:{rating:'not-rated'}};if(typeof captureId==='string'&&items.some(item=>item.id===captureId&&item.events.some(event=>event.stage==='capture')))entry.captureId=captureId;items.push(entry);items=items.slice(-limit);publish([exported(entry,entry.events[0])]);return id;},
  record(id,event){const item=items.find(item=>item.id===id),clean=cleanEvent({...event,uuid:uuid(),at:time()});if(!item||!clean)return false;item.events.push(clean);item.events=item.events.slice(-16);publish([exported(item,clean)]);return true;},
  feedback(id,{rating,expectedIntent,correction}={}){const item=items.find(item=>item.id===id);if(!item)return false;item.feedback={rating:pick(rating,RATINGS,'not-rated')};if(expectedIntent!==undefined)item.feedback.expectedIntent=pick(expectedIntent,JOURNAL_INTENTS,'unknown');if(rawOptIn&&text(correction)!==undefined)item.feedback.correction=text(correction);const event=cleanEvent({stage:'feedback',status:'handled',feedback_rating:item.feedback.rating,feedback_expected_intent:item.feedback.expectedIntent});item.events.push(event);item.events=item.events.slice(-16);publish([exported(item,event)]);return true;},
  list(){return clone(items);},
  export(){return items.flatMap(item=>item.events.map(event=>exported(item,event)));},
  subscribe(listener){if(typeof listener!=='function')throw new TypeError('Listener must be a function');listeners.add(listener);return()=>listeners.delete(listener);},
  clear(){items=[];publish();},
  setRawOptIn(value){rawOptIn=value===true;if(!rawOptIn){items=items.map(cleanItem).filter(Boolean);publish();}},
  getState(){return {rawOptIn,storageError:storageError||null,count:items.length};},
 };
 return Object.freeze(api);
}
