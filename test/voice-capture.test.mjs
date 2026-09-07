import test from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceCapture } from '../src/voice-capture.js';
function rig() {
  const recognizers = [], states = [], finals = [], interims = [], timers = new Map(); let id = 0;
  class Recognition {
    constructor() { recognizers.push(this); this.starts = 0; this.aborts = 0; }
    start() { this.starts++; }
    abort() { this.aborts++; this.onend?.(); }
  }
  const capture = createVoiceCapture({ Recognition, lang: () => 'en-IN',
    onState: (state) => states.push(state), onFinal: text => finals.push(text),
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
