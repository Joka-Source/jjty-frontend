import test from 'node:test';
import assert from 'node:assert/strict';
import {returnToPlace} from '../src/motion.js';

function environment(t) {
  const names=['document','window','performance','requestAnimationFrame','cancelAnimationFrame'];
  const originals=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  t.after(()=>{for(const [name,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
  let time=0,id=0;const frames=new Map(),labels=[],scrolls=[];
  const doc=new EventTarget(),win=new EventTarget();
  // Track actual registrations, including one callback used for several events.
  const registrations=new Map();
  for(const surface of [doc,win]){
    const add=surface.addEventListener.bind(surface),remove=surface.removeEventListener.bind(surface);
    surface.addEventListener=(type,fn,options)=>{registrations.set(`${surface===doc?'d':'w'}:${type}`,fn);add(type,fn,options);};
    surface.removeEventListener=(type,fn,options)=>{registrations.delete(`${surface===doc?'d':'w'}:${type}`);remove(type,fn,options);};
  }
  doc.querySelector=()=>labels.find(label=>label.isConnected)??null;
  doc.createElement=()=>{const label={style:{},isConnected:false,setAttribute(){},remove(){this.isConnected=false;}};labels.push(label);return label;};
  win.scrollY=100;win.innerHeight=1000;
  win.scrollTo=({top})=>{scrolls.push(top);win.scrollY=top;};
  for(const [name,value] of Object.entries({document:doc,window:win,performance:{now:()=>time},requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:key=>frames.delete(key)}))Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  return {frames,scrolls,registrations,win,doc,
    block(top=900){return {isConnected:true,appendChild(label){label.isConnected=true;},getBoundingClientRect(){return {top};}};},
    tick(delta=40){time+=delta;const pending=[...frames];frames.clear();for(const [,fn] of pending)fn(time);},
  };
}

test('removing a return label stops its pending viewport motion',t=>{
  const env=environment(t),label=returnToPlace(env.block());
  label.remove();env.tick();
  assert.equal(env.scrolls.length,0,'a removed label must not keep moving the viewport');
  assert.equal(env.frames.size,0);assert.equal(env.registrations.size,0);
});

test('new return owns one loop and a cancelled callback cannot move the viewport',t=>{
  const env=environment(t),first=returnToPlace(env.block());
  const stale=[...env.frames.values()][0];
  const second=returnToPlace(env.block(1400));
  assert.equal(first.isConnected,false);assert.equal(second.isConnected,true);
  assert.equal(env.frames.size,1,'replacement cancels the previous animation');
  stale();assert.equal(env.scrolls.length,0,'even an already-dispatched old frame loses ownership');
  env.tick();assert.equal(env.scrolls.length,1);
  env.tick(10000);assert.equal(second.isConnected,false);
  assert.equal(env.frames.size,0);assert.equal(env.registrations.size,0);
});

test('user interaction and page lifecycle cancel return motion and remove listeners',t=>{
  const env=environment(t);
  for(const type of ['wheel','touchstart','pointerdown','keydown','pagehide']){
    const label=returnToPlace(env.block()),before=env.scrolls.length;
    env.win.dispatchEvent(new Event(type));env.tick();
    assert.equal(label.isConnected,false,type);
    assert.equal(env.scrolls.length,before,type);
    assert.equal(env.frames.size,0,type);assert.equal(env.registrations.size,0,type);
  }
  const label=returnToPlace(env.block()),before=env.scrolls.length;
  env.doc.hidden=true;env.doc.dispatchEvent(new Event('visibilitychange'));env.tick();
  assert.equal(label.isConnected,false);assert.equal(env.scrolls.length,before);
  assert.equal(env.frames.size,0);assert.equal(env.registrations.size,0);
});

test('detached target stops the return before scrolling',t=>{
  const env=environment(t),block=env.block(),label=returnToPlace(block);
  block.isConnected=false;env.tick();
  assert.equal(env.scrolls.length,0);assert.equal(label.isConnected,false);
  assert.equal(env.frames.size,0);assert.equal(env.registrations.size,0);
});
