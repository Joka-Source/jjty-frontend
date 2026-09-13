import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from 'mupdf';
import {createScanSession,MemoryScanStore} from '../packages/jt-scan/session.js';
test('synthetic one-megapixel correction and PDF benchmark retains source custody',async t=>{
 const p=new m.Pixmap(m.ColorSpace.DeviceRGB,[0,0,1000,1000],false);p.clear(235);let bytes;
 try{const px=p.getPixels();for(let y=50;y<950;y+=40)for(let x=60;x<940;x++)for(let k=0;k<3;k++)px[(y*1000+x)*3+k]=30;bytes=new Uint8Array(p.asPNG());}finally{p.destroy();}
 const rows=[];for(let i=0;i<12;i++){const s=await createScanSession({store:new MemoryScanStore()});const id=await s.addPage(bytes);await s.editPage(id,{quad:[[.02,.01],[.97,.02],[.99,.97],[.01,.99]],rotation:90});const out=await s.finish();assert.deepEqual(out.sourceAssets[0].bytes,bytes);rows.push(out.timings);}
 const metrics={fixture:'synthetic 1000x1000 RGB; 2 warmup + 10 measured; not camera/device throughput',node:process.version,platform:process.platform,arch:process.arch,rssAfterBytes:process.memoryUsage().rss,stages:{}};
 for(const stage of ['processing','pdf','total']){const times=rows.slice(2).map(r=>r.find(t=>t.stage===stage).ms).sort((a,b)=>a-b);metrics.stages[stage]={p50ms:times[4],p95ms:times[9]};}t.diagnostic(JSON.stringify(metrics));
});
