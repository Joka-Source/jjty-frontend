import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';
test('browser checkpoint persists source bytes through reload and real processing makes PDF',{timeout:60000},async t=>{
 const server=await createServer({server:{host:'127.0.0.1',port:0},configFile:false,plugins:[{name:'scan-test-page',configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url==='/__scan_test'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Scanner test</title><body></body>');}else next();});}}]});await server.listen();console.log('scan: server ready');
 const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});console.log('scan: browser ready');t.after(async()=>{await browser.close();server.httpServer.closeAllConnections();await server.close();});
 const page=await browser.newPage();page.on('pageerror',e=>console.log('scan page error:',e.message));await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__scan_test`,{waitUntil:'domcontentloaded',timeout:15000});console.log('scan: page ready');
 const saved=await page.evaluate(async()=>{
  const {IndexedDBScanStore}=await import('/packages/jt-scan/store.js');
  const {createScanSession}=await import('/packages/jt-scan/session.js');
  const canvas=document.createElement('canvas');canvas.width=120;canvas.height=180;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,120,180);ctx.fillStyle='black';ctx.font='18px sans-serif';ctx.fillText('SCAN',10,35);
  const blob=await new Promise(r=>canvas.toBlob(r));const bytes=new Uint8Array(await blob.arrayBuffer());
  const s=await createScanSession({store:new IndexedDBScanStore(),id:'reopen'});const id=await s.addPage(bytes);await s.editPage(id,{rotation:90});return Array.from(bytes);
 });
 console.log('scan: saved');await page.reload();
 const result=await page.evaluate(async()=>{
  const {IndexedDBScanStore}=await import('/packages/jt-scan/store.js');const {createScanSession}=await import('/packages/jt-scan/session.js');
  const s=await createScanSession({store:new IndexedDBScanStore(),id:'reopen'});const out=await s.finish();return {original:Array.from(out.sourceAssets[0].bytes),pdf:Array.from(out.pdfBytes.slice(0,5)),count:s.pages.length,rotation:s.pages[0].rotation};
 });
 assert.deepEqual(result.original,saved);assert.deepEqual(result.pdf,[37,80,68,70,45]);assert.equal(result.count,1);assert.equal(result.rotation,90);
 const concurrency=await page.evaluate(async()=>{
  const {IndexedDBScanStore}=await import('/packages/jt-scan/store.js');const {createScanSession}=await import('/packages/jt-scan/session.js');
  const a=await createScanSession({store:new IndexedDBScanStore(),id:'reopen'}),b=await createScanSession({store:new IndexedDBScanStore(),id:'reopen'});
  await a.editPage(a.pages[0].id,{rotation:180});let conflict=false;
  try{await b.editPage(b.pages[0].id,{rotation:270});}catch(e){conflict=e.message==='SCAN_CHECKPOINT_CONFLICT';}
  const c=await createScanSession({store:new IndexedDBScanStore(),id:'reopen'});return {conflict,rotation:c.pages[0].rotation};
 });console.log('scan: concurrency checked');assert.deepEqual(concurrency,{conflict:true,rotation:180});
 const workerResult=await page.evaluate(async()=>{
  const {createWorkerProcessor}=await import('/packages/jt-scan/worker.js'),{IndexedDBScanStore}=await import('/packages/jt-scan/store.js');const state=await new IndexedDBScanStore().load('reopen');const processor=createWorkerProcessor();
  try{const out=await processor(state.assets[0].bytes,{...state.pages[0],rotation:90});return {width:out.width,height:out.height,png:Array.from(out.bytes.slice(0,4))};}finally{processor.close?.();}
 });assert.deepEqual(workerResult,{width:180,height:120,png:[137,80,78,71]});
 await page.evaluate(async()=>{
  const {mountScanner}=await import('/packages/jt-scan/ui.js');const root=document.createElement('div');document.body.replaceChildren(root);
  window.scanSaved=null;window.rejectSave=true;window.scanner=await mountScanner({root,id:'reopen',onSave:async result=>{if(window.rejectSave)throw Error('quota');window.scanSaved={pages:result.sourceAssets.length,header:Array.from(result.pdfBytes.slice(0,5))};return {documentId:'saved-scan'};}});
 });
 console.log('scan: UI mounted');assert.equal(await page.$$eval('[data-scan-page]',v=>v.length),1);
 await page.waitForFunction(()=>document.querySelector('[data-preview]').complete);
 assert.ok(await page.evaluate(()=>{const a=document.querySelector('[data-preview]').getBoundingClientRect(),b=document.querySelector('.scan-review svg').getBoundingClientRect();return Math.abs(a.x-b.x)<1&&Math.abs(a.y-b.y)<1&&Math.abs(a.width-b.width)<1&&Math.abs(a.height-b.height)<1;}),'crop overlay must use image coordinates');
 await page.click('[data-action="rotate"]');await page.waitForFunction(()=>document.querySelector('[data-scan-status]').textContent.includes('Rotation'));
 await page.click('[data-action="save"]');await page.waitForFunction(()=>document.querySelector('[data-scan-status]').textContent.includes('not saved'));
 assert.equal(await page.evaluate(()=>window.scanSaved),null);
 await page.evaluate(()=>{window.rejectSave=false;});await page.click('[data-action="save"]');await page.waitForFunction(()=>document.querySelector('[data-scan-status]').textContent.includes('Saved'));
 assert.deepEqual(await page.evaluate(()=>window.scanSaved),{pages:1,header:[37,80,68,70,45]});
 await page.click('[data-action="start"]');await page.waitForFunction(()=>document.querySelector('video').videoWidth>0&&!document.querySelector('[data-action="capture"]').disabled);
 await page.evaluate(()=>{window.cameraTrack=document.querySelector('video').srcObject.getVideoTracks()[0];});
 await page.click('[data-action="capture"]');await page.waitForFunction(()=>document.querySelectorAll('[data-scan-page]').length===2);
 await page.click('[data-action="stop"]');assert.equal(await page.evaluate(()=>window.cameraTrack.readyState),'ended');
 await page.setViewport({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'docs/scan/mobile-review.png',fullPage:true});
 await page.evaluate(()=>window.scanner.destroy());
 await page.evaluate(async()=>{
  const {mountScanner}=await import('/packages/jt-scan/ui.js');const c=document.createElement('canvas');c.width=480;c.height=360;const g=c.getContext('2d');g.fillStyle='#222';g.fillRect(0,0,480,360);g.fillStyle='#eee';g.fillRect(60,30,360,300);g.fillStyle='#222';for(let y=70;y<280;y+=25)g.fillRect(95,y,270,3);
  const root=document.createElement('div');document.body.replaceChildren(root);window.fixtureCanvas=c;window.scanner=await mountScanner({root,id:'auto-after-manual',onSave:async()=>({documentId:'unused'}),mediaDevices:{getUserMedia:async()=>{const stream=c.captureStream(0);window.fixtureTimer=setInterval(()=>{g.fillRect(95,70,1,1);stream.getVideoTracks()[0].requestFrame();},100);return stream;}}});
 });
 await page.click('[data-action="start"]');await page.waitForFunction(()=>document.querySelector('[data-guidance]').textContent.includes('Turn the page'),{timeout:8000}).catch(async e=>{throw Error(e.message+' '+await page.evaluate(()=>document.querySelector('[data-guidance]').textContent+' / '+document.querySelector('[data-scan-status]').textContent+' / '+document.querySelector('video').videoWidth));});
 await page.click('[data-auto]');await page.waitForFunction(()=>document.querySelectorAll('[data-scan-page]').length===1,{timeout:4000});
 await page.evaluate(()=>{clearInterval(window.fixtureTimer);window.scanner.destroy();});
});
