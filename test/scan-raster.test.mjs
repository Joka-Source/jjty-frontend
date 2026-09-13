import test from 'node:test';
import assert from 'node:assert/strict';
import { rectify, analyseFrame, CaptureGate } from '../packages/jt-scan/raster.js';

const frame=(w,h,value=200)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4).fill(value)});
test('identity correction retains readable pixels and never modifies original',()=>{
 const f=frame(8,8);for(let i=0;i<f.data.length;i+=4){f.data[i]=i%255;f.data[i+3]=255;}
 const original=f.data.slice(); const out=rectify(f,[[0,0],[1,0],[1,1],[0,1]],{width:8,height:8});
 assert.deepEqual(out.data,original);assert.deepEqual(f.data,original);assert.notEqual(out.data,f.data);
});
test('rotation swaps dimensions and moves corner colours without loss',()=>{
 const f=frame(4,2);f.data[0]=10;f.data[12]=80;
 const out=rectify(f,[[0,0],[1,0],[1,1],[0,1]],{rotation:90});
 assert.equal(out.width,2);assert.equal(out.height,4);assert.equal(out.data[4],10);assert.equal(out.data[28],80);
});
test('refuses crossed, degenerate and unbounded edges and excessive output',()=>{
 const f=frame(4,4);
 for(const q of [[[0,0],[1,1],[1,0],[0,1]],[[0,0],[0,0],[1,1],[0,1]],[[-.1,0],[1,0],[1,1],[0,1]]])assert.throws(()=>rectify(f,q),/SCAN_/);
 assert.throws(()=>rectify(f,[[0,0],[1,0],[1,1],[0,1]],{width:100000,height:100000}),/SCAN_/);
});
test('dark and featureless frames produce guidance and cannot auto capture',()=>{
 const stats=analyseFrame(frame(64,64,10));assert.ok(stats.meanLuma<20);assert.equal(stats.sharpness,0);
 const gate=new CaptureGate();for(let t=0;t<2000;t+=100)assert.equal(gate.update({...stats,quad:[[0,0],[1,0],[1,1],[0,1]],timestamp:t}).capture,false);
});
test('stable good document captures once until page leaves and ignores stale frames',()=>{
 const gate=new CaptureGate({stableMs:300});const f={meanLuma:180,sharpness:300,glareFraction:0,quad:[[.1,.1],[.9,.1],[.9,.9],[.1,.9]]};
 assert.equal(gate.update({...f,timestamp:0}).capture,false);
 assert.equal(gate.update({...f,timestamp:400}).capture,true);
 assert.equal(gate.update({...f,timestamp:800}).capture,false);
 gate.update({...f,quad:null,timestamp:900});
 assert.equal(gate.update({...f,timestamp:1000}).capture,false);
 assert.equal(gate.update({...f,timestamp:1400}).capture,true);
 assert.equal(gate.update({...f,timestamp:1300}).capture,false);
});
