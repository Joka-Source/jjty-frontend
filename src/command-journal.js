// Local diagnostic evidence only. No sender, network API, or inferred effects.
export const JOURNAL_INTENTS=Object.freeze(['unknown','reading','highlight','highlight-range','start-highlighting','end-highlighting','stop-highlighting','annotate','mark-important','math-keep','undo','show-history','open-document','return','send-to','send-to-space','cross-device-drop','gather','togetherness','translate-this','capture','compare','find','quote','remind','share-sheet-intake']);
export const JOURNAL_STATUSES=Object.freeze(['received','parsed','unrecognized','matched','ambiguous','missing','rejected','pending','saved','handled','failed','cancelled','no-op']);
export const JOURNAL_OUTCOMES=Object.freeze(['unknown','none','durable-entry','highlight','note','important','undo','navigation','history','range-start','range-end','reading-target','error']);
const STAGES=['heard','intent','target','result'],RATINGS=['worked','missed','not-rated'];
const pick=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
const text=value=>typeof value==='string'?value.slice(0,2000):undefined;
const clone=value=>JSON.parse(JSON.stringify(value));
export function createCommandJournal(options={}){
 let storage;try{storage=options.storage===undefined?globalThis.localStorage:options.storage;}catch{storage=null;}
 const key=options.key??'jett.command-journal.v1',limit=Number.isInteger(options.limit)?Math.max(1,Math.min(500,options.limit)):200,now=options.now??Date.now;
 let rawOptIn=options.rawOptIn===true,items=[],sequence=0,storageError=null,purgeOnLoad=false;const listeners=new Set();
 const time=()=>{const value=Number(now());return Number.isFinite(value)&&value>=0&&value<=8640000000000000?value:Date.now();};
 function cleanEvent(event){if(!event||!STAGES.includes(event.stage))return null;const out={stage:event.stage,status:pick(event.status,JOURNAL_STATUSES,'unrecognized'),at:Number.isFinite(event.at)&&event.at>=0&&event.at<=8640000000000000?event.at:time()};
  for(const key of['expected','actual'])if(event[key]!==undefined)out[key]=pick(event[key],JOURNAL_OUTCOMES,'unknown');
  if(event.intent!==undefined)out.intent=pick(event.intent,JOURNAL_INTENTS,'unknown');
  for(const field of ['blockIndex','tokenStart','tokenEnd']) if(Number.isSafeInteger(event[field])&&event[field]>=0&&event[field]<=10000000)out[field]=event[field];
  if(Number.isFinite(event.durationMs)&&event.durationMs>=0)out.durationMs=Math.min(event.durationMs,3600000);
  if(rawOptIn&&text(event.rawText)!==undefined)out.rawText=text(event.rawText);return out;
 }
 function cleanItem(item){if(!item||!/^cmd-[a-z0-9-]{1,100}$/.test(item.id)||!Number.isFinite(item.startedAt)||item.startedAt<0||item.startedAt>8640000000000000||!Array.isArray(item.events))return null;
  const out={id:item.id,source:pick(item.source,['voice','pointer','sim'],'pointer'),startedAt:item.startedAt,events:item.events.slice(-16).map(cleanEvent).filter(Boolean),feedback:{rating:pick(item.feedback?.rating,RATINGS,'not-rated')}};
  if(item.feedback?.expectedIntent!==undefined)out.feedback.expectedIntent=pick(item.feedback.expectedIntent,JOURNAL_INTENTS,'unknown');
  if(rawOptIn&&text(item.feedback?.correction)!==undefined)out.feedback.correction=text(item.feedback.correction);return out;
 }
 try{const saved=storage?.getItem(key);if(saved&&saved.length<=2500000){const data=JSON.parse(saved);purgeOnLoad=!rawOptIn;if(data.version===1&&Array.isArray(data.items)){const seen=new Set();items=data.items.slice(-limit).map(cleanItem).filter(item=>item&&!seen.has(item.id)&&seen.add(item.id));}}}catch{storageError='storage-unavailable';}
 function publish(){try{let encoded=JSON.stringify({version:1,items});while(encoded.length>2000000&&items.length){items.shift();encoded=JSON.stringify({version:1,items});}storage?.setItem(key,encoded);storageError=storage?'': 'storage-unavailable';}catch{storageError='storage-unavailable';}for(const listener of listeners)try{listener();}catch{/* Observers do not affect recording. */}}
 if(purgeOnLoad)publish();
 const api={
  begin({source='voice',rawText}={}){const startedAt=time();let suffix;try{suffix=globalThis.crypto.randomUUID();}catch{suffix=Math.random().toString(36).slice(2)+'-'+(++sequence);}
   const id='cmd-'+suffix,entry={id,source:pick(source,['voice','pointer','sim'],'pointer'),startedAt,events:[cleanEvent({stage:'heard',status:'received',at:startedAt,rawText})],feedback:{rating:'not-rated'}};items.push(entry);items=items.slice(-limit);publish();return id;},
  record(id,event){const item=items.find(item=>item.id===id),clean=cleanEvent({...event,at:time()});if(!item||!clean)return false;item.events.push(clean);item.events=item.events.slice(-16);publish();return true;},
  feedback(id,{rating,expectedIntent,correction}={}){const item=items.find(item=>item.id===id);if(!item)return false;item.feedback={rating:pick(rating,RATINGS,'not-rated')};if(expectedIntent!==undefined)item.feedback.expectedIntent=pick(expectedIntent,JOURNAL_INTENTS,'unknown');if(rawOptIn&&text(correction)!==undefined)item.feedback.correction=text(correction);publish();return true;},
  list(){return clone(items);},
  export(){return items.flatMap(item=>item.events.map((event,index)=>{const {rawText,...metadata}=event;return {event:'jett_command_'+event.stage,timestamp:new Date(event.at).toISOString(),properties:{$process_person_profile:false,distinct_id:'local-command-journal',command_id:item.id,event_index:index,source:item.source,elapsed_ms:Math.max(0,event.at-item.startedAt),...metadata,feedback_rating:item.feedback.rating,...(item.feedback.expectedIntent?{feedback_expected_intent:item.feedback.expectedIntent}:{})}};}));},
  subscribe(listener){if(typeof listener!=='function')throw new TypeError('Listener must be a function');listeners.add(listener);return()=>listeners.delete(listener);},
  clear(){items=[];publish();},
  setRawOptIn(value){rawOptIn=value===true;if(!rawOptIn){items=items.map(cleanItem).filter(Boolean);publish();}},
  getState(){return {rawOptIn,storageError:storageError||null,count:items.length};},
 };
 return Object.freeze(api);
}
