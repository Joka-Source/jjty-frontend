import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';

const url='http://127.0.0.1:4965';
const html=`<!doctype html><section id="pdf-annotation-panel"><button id="pdf-annotation-preview">Review</button><p id="pdf-annotation-status"></p></section>
<dialog id="pdf-review-dialog"><h2 id="pdf-review-title"></h2><p id="pdf-review-status"></p><div id="pdf-review-pages"></div><button id="pdf-review-download">Download</button><button id="pdf-review-close">Close</button></dialog>
<script type="module">
import {initPdfAnnotationPanel} from '/src/pdf-annotation-panel.js';
import {initPdfReview} from '/src/pdf-review.js';
const review=initPdfReview();window.review=review;window.openCalls=0;window.exportCalls=0;window.downloads=0;window.failRecords=false;
const nativeOpen=review.open;review.open=(...args)=>{window.openCalls++;return nativeOpen(...args);};
HTMLAnchorElement.prototype.click=function(){window.downloads++;};
window.doc=id=>({id,title:id,sourceBytes:new Uint8Array([1]),provenance:{sourceKind:'pdf',name:id+'.pdf'}});
window.panel=initPdfAnnotationPanel({review,getRecords:async()=>{if(window.failRecords)throw new Error('Storage unavailable');return [];},exportPdf:async()=>{window.exportCalls++;return new Promise(resolve=>{window.finishExport=resolve;});}});
window.panel.setDocument(window.doc('first'));window.ready=true;
</script>`;

test('annotation reviews keep document and reservation ownership through delayed work',{timeout:45000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4965','--strictPort'],{cwd:root,stdio:'ignore'});
 t.after(()=>server.kill('SIGTERM'));
 for(let i=0;i<80;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===79)throw new Error('Vite did not start');await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 t.after(()=>browser.close());
 async function pageFor(t){const page=await browser.newPage();t.after(()=>page.close());await page.setRequestInterception(true);page.on('request',request=>request.url()===url+'/__annotation_lifecycle.html'?request.respond({status:200,contentType:'text/html',body:html}):request.continue());await page.goto(url+'/__annotation_lifecycle.html');await page.waitForFunction(()=>window.ready);return page;}
 await t.test('document switch discards a delayed exported snapshot',async t=>{
  const page=await pageFor(t);await page.click('#pdf-annotation-preview');await page.waitForFunction(()=>window.exportCalls===1);
  await page.evaluate(()=>{panel.setDocument(doc('second'));finishExport(new Uint8Array([1,2]));});
  await page.waitForFunction(()=>!document.querySelector('#pdf-annotation-preview').disabled);
  assert.deepEqual(await page.evaluate(()=>({opens:openCalls,downloads,status:document.querySelector('#pdf-annotation-status').textContent,dialog:document.querySelector('dialog').open})),{opens:0,downloads:0,status:'',dialog:false});
 });
 await t.test('a newer review reservation wins over a delayed annotation export',async t=>{
  const page=await pageFor(t);await page.click('#pdf-annotation-preview');await page.waitForFunction(()=>window.exportCalls===1);
  await page.evaluate(()=>{window.newReservation=review.prepare();finishExport(new Uint8Array([1,2]));});
  await page.waitForFunction(()=>document.querySelector('#pdf-annotation-status').textContent.includes('newer review'));
  assert.deepEqual(await page.evaluate(()=>({opens:openCalls,downloads,owns:newReservation(),disabled:document.querySelector('#pdf-annotation-preview').disabled})),{opens:0,downloads:0,owns:true,disabled:false});
 });
 await t.test('record read failure leaves retry enabled without export or download',async t=>{
  const page=await pageFor(t);await page.evaluate(()=>window.failRecords=true);await page.click('#pdf-annotation-preview');
  await page.waitForFunction(()=>document.querySelector('#pdf-annotation-status').textContent.includes('Storage unavailable'));
  assert.deepEqual(await page.evaluate(()=>({exports:exportCalls,opens:openCalls,downloads,disabled:document.querySelector('#pdf-annotation-preview').disabled})),{exports:0,opens:0,downloads:0,disabled:false});
  await page.evaluate(()=>window.failRecords=false);await page.click('#pdf-annotation-preview');await page.waitForFunction(()=>window.exportCalls===1);
  await page.evaluate(()=>{panel.setDocument(doc('second'));finishExport(new Uint8Array([1]));});
 });
 await t.test('closing a previously open review does not invalidate its replacement reservation',async t=>{
  const page=await pageFor(t);
  const owns=await page.evaluate(async()=>{
   const dialog=document.querySelector('dialog');dialog.showModal();
   const closed=new Promise(resolve=>dialog.addEventListener('close',resolve,{once:true}));
   const reservation=review.prepare();await closed;return reservation();
  });
  assert.equal(owns,true,'queued close event belongs to the old review');
 });
});
