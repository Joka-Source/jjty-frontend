import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Evaluate the actual generated page only. Never evaluate server startup, say,
// filesystem writes, or HTTP listeners from the parent module.
const source=readFileSync(new URL('../scripts/voice-benchmark-server.mjs',import.meta.url),'utf8');
const begin=source.indexOf('const html=`'),end=source.indexOf('\nconst frame=',begin);
assert.ok(begin>=0&&end>begin,'generated HTML template must be identifiable');
function harness({policy=false,availability='available',mode='final'}={}){
 const calls={available:0,installed:0,capture:0,contexts:[],tracks:[],recognizers:[],reports:[],audioFetches:0};
 const nodes={start:{disabled:false},state:{textContent:''}},listeners={},timers=new Map();let timerId=0;
 class Recognition {
  static async available(){calls.available++;return availability;}
  static async install(){calls.installed++;throw Error('Unexpected install');}
  constructor(){this.processLocally=false;this.phrases=[];calls.recognizers.push(this);}
  start(track){this.track=track;
   if(mode==='throw')throw new Error('Synthetic start failure');
   queueMicrotask(()=>{
    this.onstart?.();
    if(mode==='navigate'){listeners.pagehide();return;}
    const segment=[{transcript:mode==='interim'?'highlight perhaps':'highlight this'}];segment.isFinal=mode!=='interim';
    this.onresult?.({results:[segment]});this.onend?.();
   });
  }
  stop(){this.onend?.();}
  abort(){this.aborted=true;}
 }
 class Context {
  constructor(){this.state='suspended';this.currentTime=0;calls.contexts.push(this);}
  async resume(){this.state='running';}
  async close(){this.state='closed';}
  async decodeAudioData(){
   const buffer=this.createBuffer(1,3200,16000);
   if(mode==='pending-decode')return new Promise(resolve=>{calls.releaseDecode=()=>resolve(buffer);});
   return buffer;
  }
  createBuffer(numberOfChannels,length,sampleRate){
   const channels=Array.from({length:numberOfChannels},()=>new Float32Array(length));
   return {numberOfChannels,length,sampleRate,duration:length/sampleRate,
    getChannelData:index=>channels[index],copyToChannel:(samples,index,offset=0)=>channels[index].set(samples,offset)};
  }
  createMediaStreamDestination(){const track={readyState:'live',stops:0,stop(){this.stops++;this.readyState='ended';}};calls.tracks.push(track);return {stream:{getAudioTracks:()=>[track]}};}
  createBufferSource(){return {connect(){},start(){},stop(){},disconnect(){},buffer:null,onended:null};}
 }
 const sandbox={cases:[{index:0,expectedText:'highlight this',kind:'command'},{index:1,expectedText:'undo',kind:'command'}],continuous:true,tailMs:500,serverOrigin:'http://127.0.0.1:4996',token:'synthetic-token',
  document:{getElementById:id=>nodes[id],featurePolicy:{allowsFeature:()=>policy}},
  navigator:{userAgent:'Chrome/140.0.0.0',mediaDevices:{getUserMedia(){calls.capture++;throw Error('Unexpected microphone');}}},
  AudioContext:Context,SpeechRecognition:Recognition,SpeechRecognitionPhrase:class{constructor(phrase,boost){this.phrase=phrase;this.boost=boost;}},
  addEventListener:(name,fn)=>listeners[name]=fn,performance:{now:()=>1},
  setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),
  fetch:async(url,options)=>{if(options?.method==='POST'){calls.reports.push(JSON.parse(options.body));return {};}calls.audioFetches++;return {arrayBuffer:async()=>new ArrayBuffer(2)};},
  queueMicrotask};
 sandbox.window=sandbox;const context=vm.createContext(sandbox);
 vm.runInContext(source.slice(begin,end)+'\nglobalThis.generatedPage=html;',context);
 const script=sandbox.generatedPage.match(/<script>([\s\S]*)<\/script>/)?.[1];assert.ok(script,'page script present');
 // Template variables were inputs above; the generated browser script declares
 // its own constants, so evaluate it in a separate context as a real page does.
 const pageContext=vm.createContext({...sandbox});pageContext.window=pageContext;
 vm.runInContext(script,pageContext);
 return {calls,nodes,timers,page:pageContext,run:()=>nodes.start.onclick(),navigate:()=>listeners.pagehide()};
}

test('benchmark refuses microphone permission and never creates capture resources',async()=>{
 const h=harness({policy:true});await h.run();
 assert.match(h.page.benchmark.error,/Microphone must be blocked/);
 assert.equal(h.calls.available,0);assert.equal(h.calls.contexts.length,0);assert.equal(h.calls.capture,0);
 assert.equal(h.calls.reports.length,1);assert.equal(h.page.benchmark.done,true);
});
test('downloadable language pack never installs, captures or falls back',async()=>{
 const h=harness({availability:'downloadable'});await h.run();
 assert.match(h.page.benchmark.error,/downloadable.*no download or remote fallback/);
 assert.equal(h.calls.installed,0);assert.equal(h.calls.capture,0);assert.equal(h.calls.contexts.length,0);assert.equal(h.calls.audioFetches,0);
});
test('final evidence stays distinct from interim-only hypotheses and all tracks close',async()=>{
 for(const mode of ['final','interim']){
  const h=harness({mode});await h.run();
  assert.equal(h.page.results.length,4);
  for(const result of h.page.results){assert.equal(result.finalized,mode==='final');assert.equal(result.transcript,mode==='final'?'highlight this':'');assert.equal(result.partials.length,1);assert.equal(result.trackEnded,true);}
  assert.equal(h.calls.capture,0);assert.equal(h.page.benchmark.physicalMicCalls,0);
  assert.ok(h.calls.recognizers.every(r=>r.processLocally===true&&h.calls.tracks.includes(r.track)));
  assert.ok(h.calls.tracks.every(t=>t.stops===1&&t.readyState==='ended'));
  assert.ok(h.calls.contexts.every(c=>c.state==='closed'));assert.equal(h.timers.size,0);
 }
});
test('navigation cancels active trial and prevents all subsequent trials',async()=>{
 const h=harness({mode:'navigate'});await h.run();
 assert.equal(h.calls.recognizers.length,1);assert.equal(h.calls.audioFetches,1);
 assert.equal(h.calls.tracks[0].readyState,'ended');assert.equal(h.calls.contexts[0].state,'closed');
 assert.match(h.page.benchmark.error,/cancelled by navigation/);assert.equal(h.timers.size,0);
});
test('recognizer start exception ends generated tracks and closes audio context',async()=>{
 const h=harness({mode:'throw'});await h.run();
 assert.equal(h.page.results.length,4);
 assert.ok(h.page.results.every(r=>r.error.includes('Synthetic start failure')&&!r.started&&r.trackEnded));
 assert.ok(h.calls.tracks.every(t=>t.stops===1));assert.equal(h.calls.contexts[0].state,'closed');assert.equal(h.timers.size,0);
});

test('navigation during pending decode prevents recognition startup and generated-track acquisition',async()=>{
 const h=harness({mode:'pending-decode'});const running=h.run();
 for(let i=0;i<20&&!h.calls.releaseDecode;i++)await Promise.resolve();
 assert.equal(typeof h.calls.releaseDecode,'function','decode is actually pending');
 h.navigate();h.calls.releaseDecode();await running;
 assert.equal(h.calls.recognizers.length,0);assert.equal(h.calls.tracks.length,0);
 assert.equal(h.calls.audioFetches,1);assert.equal(h.page.results.length,0);
 assert.match(h.page.benchmark.error,/cancelled before recognition/);
 assert.equal(h.calls.contexts[0].state,'closed');assert.equal(h.page.benchmark.done,true);
 assert.equal(h.calls.capture,0);assert.equal(h.timers.size,0);
});
