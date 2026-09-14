import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceCapture } from '../src/voice-capture.js';
function rig(stateHook = () => {}) {
  const recognizers = [], states = [], finals = [], interims = [], timers = new Map(); let id = 0;
  class Recognition {
    constructor() { recognizers.push(this); this.starts = 0; this.aborts = 0; }
    start() { this.starts++; }
    abort() { this.aborts++; this.onend?.(); }
  }
  const capture = createVoiceCapture({ Recognition, lang: () => 'en-IN',
    onState: (state, reason) => { states.push(state); stateHook(state, reason); }, onFinal: text => finals.push(text),
    onInterim: text => interims.push(text),
    schedule: (fn, delay) => { timers.set(++id, {fn,delay}); return id; }, cancel: id => timers.delete(id) });
  const tick = () => { const [key, timer] = timers.entries().next().value; timers.delete(key); timer.fn(); };
  return {capture,recognizers,states,finals,interims,timers,tick};
}
function result(text, final = true) { return {results:[{0:{transcript:text},isFinal:final}]}; }
test('single owner while starting; listening requires recognizer start event', () => {
  const r=rig(); r.capture.start(); r.capture.start();
  assert.equal(r.recognizers.length,1); assert.deepEqual(r.states,['starting']);
  assert.equal(r.recognizers[0].lang,'en-IN'); r.recognizers[0].onstart();
  assert.equal(r.states.at(-1),'listening');
});
test('pause aborts and rejects late events including commands from previous session', () => {
  const r=rig(); r.capture.start(); const old=r.recognizers[0]; r.capture.pause();
  old.onresult(result('highlight this')); old.onstart(); old.onerror({error:'network'}); old.onend();
  assert.equal(old.aborts,1); assert.deepEqual(r.finals,[]); assert.deepEqual(r.interims,[]);
  assert.equal(r.timers.size,0); assert.equal(r.states.at(-1),'paused');
  r.capture.start(); old.onresult(result('undo')); assert.deepEqual(r.finals,[]);
  r.recognizers[1].onresult(result('new reading')); assert.deepEqual(r.finals,['new reading']);
});
test('network failures recover with bounded delays, never a hot restart loop', () => {
  const r=rig(); r.capture.start(); const delays=[];
  for(let i=0;i<4;i++) {
    const rec=r.recognizers[i]; rec.onstart(); rec.onerror({error:'network'}); rec.onend();
    if(i<3) { assert.equal(r.recognizers.length,i+1); delays.push([...r.timers.values()][0].delay); r.tick(); }
  }
  assert.deepEqual(delays,[500,1000,2000]); assert.equal(r.states.at(-1),'error'); assert.equal(r.timers.size,0);
});
test('pausing scheduled recovery cancels it and stale callbacks cannot restart capture', () => {
  const r=rig(); r.capture.start(); r.recognizers[0].onend();
  const fn=[...r.timers.values()][0].fn; r.capture.pause(); fn();
  assert.equal(r.recognizers.length,1); assert.equal(r.timers.size,0);
});
test('permission and device errors stop instead of repeatedly reopening the microphone', () => {
  for (const error of ['not-allowed','service-not-allowed','audio-capture','aborted']) {
    const r=rig(); r.capture.start(); const rec=r.recognizers[0]; rec.onerror({error}); rec.onend();
    assert.equal(r.timers.size,0); assert.equal(rec.aborts,1);
    assert.equal(r.states.at(-1),error.includes('allowed')?'denied':'error');
  }
});
test('final results processed once per session; a recovered session has a new result index', () => {
  const r=rig(); r.capture.start(); const rec=r.recognizers[0];
  rec.onresult(result('reading')); rec.onresult(result('reading')); rec.onend(); r.tick();
  r.recognizers[1].onresult(result('next reading'));
  assert.deepEqual(r.finals,['reading','next reading']);
});
test('constructor failure releases ownership and permits an explicit retry', () => {
  let attempts=0; const states=[];
  class Broken { constructor() { attempts++; throw new Error('device setup'); } }
  const capture=createVoiceCapture({Recognition:Broken,onState:s=>states.push(s),onInterim(){},onFinal(){}});
  capture.start(); capture.start();
  assert.equal(attempts,2); assert.deepEqual(states,['starting','error','starting','error']);
});

function fakeStream() {
  const track = new EventTarget(); Object.assign(track,{kind:'audio',readyState:'live',stops:0,
    stop(){this.stops++;this.readyState='ended';}});
  return {track,getTracks:()=>[track],getAudioTracks:()=>[track]};
}
function localRig({ availability = async () => 'available', capable = true, acquire } = {}) {
  const recognizers=[], probes=[], states=[], timers=[], acquired=[]; const stream=fakeStream();
  let mode='local', locale='en-IN';
  class Recognition {
    static available(options) { probes.push(options); return availability(options); }
    constructor() { this.starts=[]; this.aborts=0; if(capable) this.processLocally=false; recognizers.push(this); }
    start(track) { this.input=track; this.starts.push({lang:this.lang,local:this.processLocally}); }
    abort() { this.aborts++; this.onend?.(); }
  }
  const capture=createVoiceCapture({Recognition,lang:()=>locale,processingMode:()=>mode,
    acquireAudio:options=>{acquired.push(options);return acquire ? acquire(options) : Promise.resolve(stream);},
    onState:(state,reason,metadata)=>states.push({state,reason,...metadata}),onInterim(){},onFinal(){},
    schedule:fn=>{timers.push(fn);return timers.length;},cancel(){}});
  return {Recognition,capture,recognizers,probes,states,timers,stream,acquired,change:(m,l)=>{mode=m;locale=l;}};
}
test('local-only start probes exact language and sets processLocally before capture', async () => {
  const r=localRig(); await r.capture.start();
  assert.deepEqual(r.probes,[{langs:['en-IN'],processLocally:true}]);
  assert.deepEqual(r.recognizers[0].starts,[{lang:'en-IN',local:true}]);
});
test('local-only unavailable, downloadable, downloading and rejected probes never start capture', async () => {
  for(const availability of ['unavailable','downloadable','downloading','unknown']) {
    const r=localRig({availability:async()=>availability}); await r.capture.start();
    assert.equal(r.recognizers.length,0); assert.equal(r.states.at(-1).state,'error');
  }
  const r=localRig({availability:async()=>{throw new Error('policy denied');}}); await r.capture.start();
  assert.equal(r.recognizers.length,0); assert.equal(r.states.at(-1).reason,'local-probe-failed');
});
test('local-only requires both availability API and per-instance local capability', async () => {
  const missing=localRig(); delete missing.Recognition.available; await missing.capture.start();
  assert.equal(missing.recognizers.length,0); assert.equal(missing.states.at(-1).reason,'local-unsupported');
  const r=localRig({capable:false}); await r.capture.start();
  assert.equal(r.recognizers[0].starts.length,0); assert.equal(r.recognizers[0].aborts,1); assert.equal(r.acquired.length,0);
  assert.equal(r.states.at(-1).reason,'local-unsupported');
});
test('pause during local probe fences result and cannot create a recognizer afterward', async () => {
  let resolve; const r=localRig({availability:()=>new Promise(r=>{resolve=r;})});
  const pending=r.capture.start(); r.capture.pause(); resolve('available'); await pending;
  assert.equal(r.recognizers.length,0); assert.equal(r.states.at(-1).state,'paused');
});
test('processing mode and language snapshot survive settings changes and reconnect', async () => {
  let resolve; const r=localRig({availability:()=>new Promise(r=>{resolve=r;})});
  const pending=r.capture.start(); r.change('browser','fr-FR'); resolve('available'); await pending;
  r.recognizers[0].onend(); r.timers[0]();
  assert.deepEqual(r.recognizers.map(rec=>rec.starts[0]),[{lang:'en-IN',local:true},{lang:'en-IN',local:true}]);
  assert.equal(r.probes.length,1);
});
test('old rejected local probe cannot stop a newer explicit browser session', async () => {
  let reject; const r=localRig({availability:()=>new Promise((_r,j)=>{reject=j;})});
  const pending=r.capture.start(); r.capture.pause(); r.change('browser','fr-FR'); r.capture.start();
  r.recognizers[0].onstart(); reject(new Error('late failure')); await pending;
  assert.equal(r.states.at(-1).state,'listening'); assert.equal(r.recognizers[0].aborts,0);
});
test('local recognizer restarts share one acquired live track and pause releases it once', async () => {
  const r=localRig(); await r.capture.start();
  assert.equal(r.recognizers[0].input,r.stream.track); r.recognizers[0].onend(); r.timers[0]();
  assert.equal(r.recognizers[1].input,r.stream.track); assert.equal(r.acquired.length,1);
  assert.equal(r.stream.track.stops,0); r.capture.pause(); r.capture.dispose();
  assert.equal(r.stream.track.stops,1);
});
test('pause while acquisition pending aborts request and cleans late stream without starting', async () => {
  let resolve; const stream=fakeStream(); const r=localRig({acquire:()=>new Promise(r=>{resolve=r;})});
  const pending=r.capture.start(); await Promise.resolve();
  assert.equal(r.acquired.length,1); r.capture.pause(); assert.equal(r.acquired[0].signal.aborted,true);
  resolve(stream); await pending;
  assert.equal(r.recognizers.length,1); assert.equal(r.recognizers[0].starts.length,0); assert.equal(stream.track.stops,1); assert.equal(r.states.at(-1).state,'paused');
});
test('ended input track terminates capture and releases every stream track once', async () => {
  const stream=fakeStream(), second=fakeStream().track; stream.getTracks=()=>[stream.track,second];
  const r=localRig({acquire:async()=>stream}); await r.capture.start();
  stream.track.readyState='ended'; stream.track.dispatchEvent(new Event('ended'));
  assert.equal(r.states.at(-1).reason,'audio-capture'); assert.equal(r.recognizers[0].aborts,1);
  assert.equal(stream.track.stops,1); assert.equal(second.stops,1); r.capture.pause(); assert.equal(second.stops,1);
});
test('invalid or failed acquired input fails closed and browser mode never acquires audio', async () => {
  const stream=fakeStream(); stream.track.readyState='ended';
  const r=localRig({acquire:async()=>stream}); await r.capture.start();
  assert.equal(r.recognizers[0].starts.length,0); assert.equal(stream.track.stops,1);
  const failed=localRig({acquire:async()=>{throw new Error('no device');}}); await failed.capture.start();
  assert.equal(failed.recognizers[0].starts.length,0); assert.equal(failed.states.at(-1).reason,'audio-capture');
  const browser=localRig(); browser.change('browser','en-US'); browser.capture.start();
  assert.equal(browser.acquired.length,0); assert.equal(browser.recognizers[0].input,undefined);
});
test('unsupported track start stops acquired stream without retrying native capture', async () => {
  const r=localRig(); let attempts=0;
  r.Recognition.prototype.start=function(track){attempts++;assert.equal(track,r.stream.track);throw new Error('unsupported');};
  await r.capture.start();
  assert.equal(attempts,1); assert.equal(r.stream.track.stops,1); assert.equal(r.timers.length,0);
  assert.equal(r.states.at(-1).reason,'local-track-start-failed');
});
test('old pending acquisition cannot stop newer session or leak its late stream', async () => {
  let resolve; const old=fakeStream(); const r=localRig({acquire:()=>new Promise(r=>{resolve=r;})});
  const pending=r.capture.start(); await Promise.resolve(); r.capture.pause();
  r.change('browser','fr-FR'); r.capture.start(); r.recognizers[1].onstart(); resolve(old); await pending;
  assert.equal(old.track.stops,1); assert.equal(r.recognizers[1].aborts,0); assert.equal(r.states.at(-1).state,'listening');
});
test('empty results and never-final interim text cannot replenish recovery budget',()=>{
 for(const event of [{results:[]},result('   ',true),result('unfinished',false)]){
  const r=rig();r.capture.start();
  for(let cycle=0;cycle<4;cycle++){
   const rec=r.recognizers[cycle];rec.onresult(event);rec.onerror({error:'network'});rec.onend();if(cycle<3)r.tick();
  }
  assert.equal(r.states.at(-1),'error');assert.equal(r.timers.size,0);assert.deepEqual(r.finals,[]);
 }
});

test('new final speech replenishes recovery budget after repeated failures', () => {
  const r=rig(); r.capture.start();
  for(let i=0;i<3;i++){r.recognizers[i].onend();r.tick();}
  r.recognizers[3].onresult(result('recovered reading'));
  r.recognizers[3].onend();
  assert.equal([...r.timers.values()][0].delay,500);
  assert.deepEqual(r.finals,['recovered reading']);
  r.capture.pause();
});
test('synchronous pause from reconnect status leaves no stale timer', () => {
  const r=rig(state=>{if(state==='reconnecting')r.capture.pause();});
  r.capture.start();r.recognizers[0].onend();
  assert.equal(r.states.at(-1),'paused');assert.equal(r.timers.size,0);
});
test('owned audio metadata reflects acquisition, recovery, pause and terminal release', async () => {
  const r=localRig();const pending=r.capture.start();
  assert.equal(r.states[0].audioHeld,false);await pending;
  assert.equal(r.states.at(-1).state,'starting');assert.equal(r.states.at(-1).audioHeld,true);
  r.recognizers[0].onstart();assert.equal(r.states.at(-1).audioHeld,true);
  r.recognizers[0].onend();assert.equal(r.states.at(-1).state,'reconnecting');assert.equal(r.states.at(-1).audioHeld,true);
  r.capture.pause();assert.equal(r.states.at(-1).audioHeld,false);
  const ended=localRig();await ended.capture.start();
  ended.stream.track.readyState='ended';ended.stream.track.dispatchEvent(new Event('ended'));
  assert.equal(ended.states.at(-1).state,'error');assert.equal(ended.states.at(-1).audioHeld,false);
  const browser=localRig();browser.change('browser','en-US');browser.capture.start();browser.recognizers[0].onstart();
  assert.equal(browser.states.at(-1).audioHeld,false);browser.capture.dispose();
});

// A real Chrome browser-service session emitted speechstart but no results.
test('detected speech without recognition results stops with a useful reason', () => {
  let reason;
  const r=rig((_state, value) => { reason=value; }); r.capture.start(); const rec=r.recognizers[0];
  rec.onstart(); rec.onspeechstart();
  assert.equal([...r.timers.values()][0].delay,20000);
  r.tick();
  assert.equal(r.states.at(-1),'error'); assert.equal(reason,'recognition-no-results'); assert.equal(rec.aborts,1);
  assert.equal(r.timers.size,0);
  rec.onresult(result('highlight this')); assert.deepEqual(r.finals,[]);
});
test('recognition progress, end and pause cancel the no-result watchdog', () => {
  for (const action of ['result','end','pause']) {
    const r=rig();r.capture.start();const rec=r.recognizers[0];rec.onspeechstart();
    const stale=[...r.timers.values()][0].fn;
    if(action==='result')rec.onresult(result('rent is due',false));
    if(action==='end')rec.onend();
    if(action==='pause')r.capture.pause();
    stale();
    assert.notEqual(r.states.at(-1),'error');
    assert.equal(r.timers.size,action==='end'?1:0);
  }
});
test('repeated speech-start events cannot postpone the no-result deadline', () => {
  const r=rig();r.capture.start();const rec=r.recognizers[0];
  rec.onspeechstart();const first=[...r.timers.keys()][0];rec.onspeechstart();
  assert.deepEqual([...r.timers.keys()],[first]);r.tick();assert.equal(r.states.at(-1),'error');
});

function phraseRig({mode='local',lang='en-US',phraseApi=true,phraseProperty=true,setterThrows=false}={}) {
  const stream=fakeStream(),recognizers=[],timers=new Map(),states=[],acquisitions=[];let nextTimer=0;
  class Phrase { constructor(phrase,boost){this.phrase=phrase;this.boost=boost;} }
  class Recognition {
    static async available(){return 'available';}
    constructor(){this.processLocally=false;this.aborts=0;if(phraseProperty){let list=[];Object.defineProperty(this,'phrases',{get:()=>list,set:value=>{if(setterThrows)throw new Error('hints unsupported');list=value;}});}recognizers.push(this);}
    start(track){this.track=track;this.started={local:this.processLocally,phrases:this.phrases?.map(p=>({phrase:p.phrase,boost:p.boost}))??[]};}
    abort(){this.aborts++;this.onend?.();}
  }
  const capture=createVoiceCapture({Recognition,SpeechRecognitionPhrase:phraseApi?Phrase:null,processingMode:mode,lang,
    acquireAudio:async()=>{acquisitions.push(true);return stream;},onState:(state,reason)=>states.push({state,reason}),onInterim(){},onFinal(){},
    schedule:(fn,delay)=>{timers.set(++nextTimer,{fn,delay});return nextTimer;},cancel:id=>timers.delete(id)});
  const tick=()=>{const [id,timer]=timers.entries().next().value;timers.delete(id);timer.fn();};
  return {capture,stream,recognizers,timers,states,acquisitions,tick};
}
test('local English command hints are configured before start and reconstructed on restart',async()=>{
 const r=phraseRig();await r.capture.start();const first=r.recognizers[0];
 assert.ok(first.started.phrases.some(p=>p.phrase==='highlight this'&&p.boost===2));assert.ok(first.started.phrases.some(p=>p.phrase==='end highlighting'&&p.boost===2));
 first.onend();r.tick();assert.deepEqual(r.recognizers[1].started.phrases,first.started.phrases);assert.equal(r.acquisitions.length,1);r.capture.pause();
});
test('remote, non-English and absent phrase capabilities keep ordinary recognition',async()=>{
 for(const options of [{mode:'browser'},{lang:'hi-IN'},{phraseApi:false},{phraseProperty:false},{setterThrows:true}]){
  const r=phraseRig(options);await r.capture.start();const active=r.recognizers.at(-1);assert.ok(active.started);assert.deepEqual(active.started.phrases,[]);assert.equal(r.states.at(-1).state,'starting');r.capture.pause();
 }
});
test('model rejection retries once without hints on the same owned track, then fails closed',async()=>{
 const r=phraseRig();await r.capture.start();const first=r.recognizers[0];first.onerror({error:'phrases-not-supported'});first.onend();
 assert.equal(r.stream.track.stops,0);assert.equal([...r.timers.values()][0].delay,500);r.tick();const next=r.recognizers[1];
 assert.equal(next.track,first.track);assert.equal(next.started.local,true);assert.deepEqual(next.started.phrases,[]);assert.equal(r.acquisitions.length,1);
 next.onerror({error:'phrases-not-supported'});next.onend();assert.equal(r.states.at(-1).state,'error');assert.equal(r.timers.size,0);assert.equal(r.stream.track.stops,1);
});
test('pausing the no-hints retry fences late end and scheduled recovery',async()=>{
 const r=phraseRig();await r.capture.start();const first=r.recognizers[0];first.onerror({error:'phrases-not-supported'});first.onend();
 const pending=[...r.timers.values()][0].fn;r.capture.pause();pending();first.onend();
 assert.equal(r.recognizers.length,1);assert.equal(r.timers.size,0);assert.equal(r.stream.track.stops,1);
});

test('batched new finals pair each segment with its own cumulative interim before dispatch',()=>{
 const trace=[];let rec;
 class Recognition{constructor(){rec=this;}start(){}abort(){}}
 const capture=createVoiceCapture({Recognition,onState(){},onInterim:(full,latest)=>trace.push(['interim',full,latest]),onFinal:text=>trace.push(['final',text])});capture.start();
 const event={results:[{0:{transcript:'unmatched reading'},isFinal:true},{0:{transcript:'highlight this'},isFinal:true}]};
 rec.onresult(event);
 assert.deepEqual(trace,[['interim','unmatched reading ','unmatched reading'],['final','unmatched reading'],['interim','unmatched reading highlight this ','highlight this'],['final','highlight this']]);
 rec.onresult(event);assert.equal(trace.filter(x=>x[0]==='final').length,2);
 rec.onresult({results:[...event.results,{0:{transcript:'next reading'},isFinal:false}]});
 assert.deepEqual(trace.at(-1),['interim','unmatched reading highlight this next reading ','next reading']);capture.pause();
});
test('pause from either paired callback prevents remaining batched finals',()=>{
 for(const pauseAt of ['interim','final']){
  const trace=[];let rec,capture;
  class Recognition{constructor(){rec=this;}start(){}abort(){}}
  capture=createVoiceCapture({Recognition,onState(){},onInterim:(_full,text)=>{trace.push(['interim',text]);if(pauseAt==='interim')capture.pause();},onFinal:text=>{trace.push(['final',text]);if(pauseAt==='final')capture.pause();}});capture.start();
  rec.onresult({results:[{0:{transcript:'reading'},isFinal:true},{0:{transcript:'highlight this'},isFinal:true}]});
  assert.deepEqual(trace,pauseAt==='interim'?[['interim','reading']]:[['interim','reading'],['final','reading']]);
 }
});
