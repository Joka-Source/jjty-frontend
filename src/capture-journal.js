// Observes capture lifecycle only. audioHeld describes an app-owned live stream;
// false does not establish whether a browser recognition service holds a mic.
const STATES=new Set(['starting','listening','reconnecting','paused','error','denied','unavailable','local-unavailable','off']);
const TERMINAL=new Set(['paused','error','denied','unavailable','local-unavailable','off']);
export const CAPTURE_JOURNAL_REASONS=Object.freeze(['local-unsupported','setup-failed','recognition-no-results','phrases-not-supported','not-allowed','service-not-allowed','no-speech','network','repeated-end','audio-capture','local-track-start-failed','start-failed','invalid-processing-mode','local-probe-failed','local-download-required','local-unavailable','local-audio-unsupported','aborted','audio-capture-ended','language-not-supported','bad-grammar','none','other']);
export function createCaptureJournal(journal){
 if(typeof journal?.begin!=='function'||typeof journal?.record!=='function')throw new TypeError('Capture journal requires begin and record');
 let active=null;
 return Object.freeze({
  currentId(){return active;},
  record(state,reason,metadata={},mode){
   if(!STATES.has(state))return null;
   // A late listening/reconnect event cannot resurrect a terminal session.
   if(!active&&state!=='starting'&&!['error','denied','unavailable','local-unavailable'].includes(state))return null;
   if(!active)active=journal.begin({source:'voice',stage:'capture'});
   const id=active,event={stage:'capture',status:state==='paused'||state==='off'?'cancelled':state==='denied'||state==='error'||state==='unavailable'||state==='local-unavailable'?'failed':state==='listening'?'handled':'pending',captureState:state};
   if(reason!==undefined&&reason!==null)event.reason=CAPTURE_JOURNAL_REASONS.includes(reason)?reason:'other';
   if(mode==='local'||mode==='browser')event.processingMode=mode;
   if(typeof metadata?.audioHeld==='boolean')event.audioHeld=metadata.audioHeld;
   // Relinquish before publishing so observer callbacks see terminal ownership.
   if(TERMINAL.has(state))active=null;
   journal.record(id,event);return id;
  },
 });
}
