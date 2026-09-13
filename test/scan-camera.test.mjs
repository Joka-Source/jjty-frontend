import test from 'node:test';
import assert from 'node:assert/strict';
import {ScanCamera} from '../packages/jt-scan/camera.js';
test('cancelled permission request stops late stream and never attaches preview',async()=>{
 let resolve,stopped=0;const video={srcObject:null,play:async()=>{},pause(){}};
 const camera=new ScanCamera({video,mediaDevices:{getUserMedia:()=>new Promise(r=>resolve=r)}});
 const start=camera.start();camera.stop();resolve({getTracks:()=>[{stop(){stopped++;}}]});
 await assert.rejects(start,/SCAN_CAMERA_CANCELLED/);assert.equal(stopped,1);assert.equal(video.srcObject,null);
});
test('preview failure releases camera rather than leaving recording active',async()=>{
 let stopped=0;const video={srcObject:null,play:async()=>{throw new Error('preview');},pause(){}};
 const camera=new ScanCamera({video,mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})}});
 await assert.rejects(camera.start(),/preview/);assert.equal(stopped,1);assert.equal(video.srcObject,null);
});
test('permission denial remains explicit and a second start can recover',async()=>{
 let attempts=0;const stream={getTracks:()=>[{stop(){}}]},video={srcObject:null,play:async()=>{},pause(){}};
 const camera=new ScanCamera({video,mediaDevices:{getUserMedia:async()=>{if(!attempts++)throw Object.assign(new Error('denied'),{name:'NotAllowedError'});return stream;}}});
 await assert.rejects(camera.start(),/denied/);await camera.start();assert.equal(video.srcObject,stream);camera.stop();assert.equal(video.srcObject,null);
});
test('oversized preview is refused before allocating a capture canvas',()=>{
 const camera=new ScanCamera({video:{videoWidth:6000,videoHeight:6000}});camera.stream={};assert.throws(()=>camera.frame(6000),/SCAN_PIXEL_LIMIT/);
});
