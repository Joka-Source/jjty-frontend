import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';

const url='http://127.0.0.1:4981';
const html=`<!doctype html><dialog id="pdf-review-dialog"><h2 id="pdf-review-title"></h2><p id="pdf-review-status"></p><div id="pdf-review-pages"></div><button id="pdf-review-download">Download</button><button id="pdf-review-print">Print</button><button id="pdf-review-close">Close</button></dialog>
<script type="module">
import {initPdfReview} from '/src/pdf-review.js';
window.downloads=[];window.renderOpens=0;window.destroyed=[];
HTMLAnchorElement.prototype.click=function(){const name=this.download;fetch(this.href).then(r=>r.arrayBuffer()).then(b=>downloads.push({name,bytes:Array.from(new Uint8Array(b))}));};
window.review=initPdfReview();window.original=new Uint8Array(await(await fetch('/test/fixtures/jett-fillable.pdf')).arrayBuffer());
await review.open(original,'source.pdf',{kind:'original'});window.ready=true;
</script>`;
// Real renderer/core; hold only the third preview (initial -> reorder -> undo).
const engine=`import {createMuPdfProvider as nativeProvider} from '/src/pdf-engine.js?actual=1';
export function createMuPdfProvider(mupdf){const provider=nativeProvider(mupdf);return {async open(bytes){
 const opened=await provider.open(bytes),id=++window.renderOpens;
 const getPage=opened.document.getPage.bind(opened.document);
 const document={...opened.document,getPage:async n=>{const page=await getPage(n);return id===3&&n===1?{...page,render:()=>({promise:new Promise((resolve,reject)=>{window.rejectUndoRender=()=>reject(new Error('Injected undo preview render failure'));})})}:page;}};
 const destroy=opened.loadingTask.destroy.bind(opened.loadingTask);const loadingTask={...opened.loadingTask,destroy:async()=>{try{return await destroy();}finally{window.destroyed.push(id);}}};
 return {...opened,document,loadingTask};
}};}`;

test('failed undo preserves the current copy without reviving stale reviews',{timeout:60000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4981','--strictPort'],{cwd:root,stdio:'ignore'});
 t.after(()=>server.kill('SIGTERM'));
 for(let i=0;i<80;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===79)throw new Error('Vite did not start');await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());
 async function pageFor(t){const page=await browser.newPage();t.after(()=>page.close());await page.setRequestInterception(true);page.on('request',r=>r.url()===url+'/__undo_recovery.html'?r.respond({status:200,contentType:'text/html',body:html}):r.url()===url+'/src/pdf-engine.js'?r.respond({status:200,contentType:'text/javascript',body:engine}):r.continue());await page.goto(url+'/__undo_recovery.html');await page.waitForFunction(()=>window.ready);assert.equal(await page.$eval('#pdf-review-download',n=>n.disabled),false,await page.$eval('#pdf-review-status',n=>n.textContent));await page.$eval('#pdf-review-order',n=>{n.value='2,1';});await page.click('.pdf-review-order button');
await page.waitForFunction(()=>!document.querySelector('[data-review-undo]').disabled);
await page.click('#pdf-review-download');await page.waitForFunction(()=>downloads.length===1);
await page.evaluate(()=>{window.currentCopy=downloads[0];downloads=[];});
await page.click('[data-review-undo]');await page.waitForFunction(()=>window.rejectUndoRender);
assert.equal(await page.$eval('#pdf-review-download',n=>n.disabled),true);
assert.equal(await page.$eval('[data-review-undo]',n=>n.disabled),true);return page;}
 await t.test('undo render failure restores current DOM, filename, bytes and retry',async t=>{
  const page=await pageFor(t);await page.evaluate(()=>rejectUndoRender());
  await page.waitForFunction(()=>destroyed.includes(3));
  await page.waitForFunction(()=>!document.getElementById('pdf-review-download').disabled,{timeout:3000});
  assert.equal(await page.$eval('#pdf-review-title',n=>n.textContent),'Review reordered original copy');
  assert.equal(await page.$$eval('#pdf-review-pages figure',n=>n.length),2);
  assert.equal(await page.$eval('#pdf-review-print',n=>n.disabled),false);
  assert.equal(await page.$eval('[data-review-undo]',n=>n.disabled),false,'failed undo remains retryable');
  assert.equal(await page.$eval('[data-pdf-rotate="right"]',n=>n.disabled),false);
  await page.click('#pdf-review-download');await page.waitForFunction(()=>downloads.length===1);
  assert.deepEqual(await page.evaluate(()=>downloads[0]),await page.evaluate(()=>currentCopy));
  await page.click('[data-review-undo]');await page.waitForFunction(()=>document.getElementById('pdf-review-status').textContent.startsWith('Page change undone'));
  assert.equal(await page.$eval('[data-review-undo]',n=>n.disabled),true);
  await page.click('#pdf-review-download');await page.waitForFunction(()=>downloads.length===2);
  assert.deepEqual(await page.evaluate(()=>downloads[1]),await page.evaluate(()=>({name:'source.pdf',bytes:Array.from(original)})));
 });
 await t.test('close while undo is held never restores abandoned history',async t=>{
  const page=await pageFor(t);await page.click('#pdf-review-close');await page.evaluate(()=>rejectUndoRender());
  await page.waitForFunction(()=>destroyed.includes(3));
  assert.deepEqual(await page.evaluate(()=>({open:document.querySelector('dialog').open,disabled:document.getElementById('pdf-review-download').disabled,pages:document.querySelectorAll('#pdf-review-pages figure').length,downloads:downloads.length})),{open:false,disabled:true,pages:0,downloads:0});
 });
 await t.test('new review while undo is held keeps its own bytes and no undo history',async t=>{
  const page=await pageFor(t);
  await page.evaluate(async()=>{const {rotatePdfPages}=await import('/src/pdf-rotation.js');window.newerBytes=await rotatePdfPages(original,[{pageIndex:1,quarterTurns:1}]);await review.open(newerBytes,'newer.pdf',{kind:'newer'});rejectUndoRender();});
  await page.waitForFunction(()=>destroyed.includes(3));
  assert.equal(await page.$eval('#pdf-review-title',n=>n.textContent),'Review newer copy');
  assert.equal(await page.$eval('[data-review-undo]',n=>n.disabled),true);
  await page.click('#pdf-review-download');await page.waitForFunction(()=>downloads.length===1);
  assert.deepEqual(await page.evaluate(()=>downloads[0]),await page.evaluate(()=>({name:'newer.pdf',bytes:Array.from(newerBytes)})));
 });
});
