import test from 'node:test';import assert from 'node:assert/strict';
import {createWorkerProcessor} from '../packages/jt-scan/worker.js';
test('worker crash can retry after replacement initialization without retransferring detached bytes',async t=>{
 const Original=globalThis.Worker;let current;
 class ControlledWorker{
  constructor(){current=this;this.ready=false;}
  postMessage(value,transfer){const copy=structuredClone(value,{transfer});if(this.ready)queueMicrotask(()=>this.onmessage({data:{result:{bytes:copy.bytes}}}));}
  terminate(){}
  initialize(){this.ready=true;this.onmessage({data:{ready:true}});}
 }
 globalThis.Worker=ControlledWorker;t.after(()=>{globalThis.Worker=Original;});const p=createWorkerProcessor();t.after(()=>p.close());
 const first=p(new Uint8Array([1]),{});current.initialize();await first;current.onerror();
 const retry=p(new Uint8Array([7,8]),{});current.initialize();assert.deepEqual((await retry).bytes,new Uint8Array([7,8]));
});
