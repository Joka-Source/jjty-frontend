import test from 'node:test';
import assert from 'node:assert/strict';
import {detectDocument} from '../packages/jt-scan/detection.js';
function fixture(paper=true){const width=160,height=120,data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,v=paper&&x>=25&&x<=135&&y>=15&&y<=105?230:40;data.set([v,v,v,255],i);}return {width,height,data};}
test('bright planar page on dark desk yields ordered edges, not the entire frame',()=>{
 const q=detectDocument(fixture()).quad;assert.ok(q);assert.ok(Math.abs(q[0][0]-25/159)<.015);assert.ok(Math.abs(q[2][1]-105/119)<.015);
});
test('uniform desk and edge-touching brightness cannot trigger automatic document capture',()=>{
 assert.equal(detectDocument(fixture(false)).quad,null);const f=fixture();f.data.fill(255);assert.equal(detectDocument(f).quad,null);
});
