import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';
const url='http://127.0.0.1:4982';
const html=`<!doctype html><link rel="stylesheet" href="/src/jett.css"><dialog class="pdf-review-dialog" id="pdf-review-dialog"><h2 id="pdf-review-title"></h2><p role="status" id="pdf-review-status"></p><div id="pdf-review-pages"></div><button id="pdf-review-download">Download</button><button id="pdf-review-print">Print</button><button id="pdf-review-close">Close</button></dialog>
<script type="module">
import {initPdfReview} from '/src/pdf-review.js';
import * as mupdf from '/node_modules/mupdf/dist/mupdf.js';
window.downloads=[];
HTMLAnchorElement.prototype.click=function(){const name=this.download;fetch(this.href).then(r=>r.arrayBuffer()).then(b=>downloads.push({name,bytes:Array.from(new Uint8Array(b))}));};
window.original=new Uint8Array(await(await fetch('/test/fixtures/jett-fillable.pdf')).arrayBuffer());
const doc=new mupdf.PDFDocument(original.slice());doc.disableJS();
const trailer=doc.getTrailer(),catalog=trailer.get('Root');catalog.put('Names',{});
const buffer=doc.saveToBuffer();window.unsupported=new Uint8Array(buffer.asUint8Array());
buffer.destroy();catalog.destroy();trailer.destroy();doc.destroy();
window.review=initPdfReview();window.ready=true;
</script>`;
const wrapper=`import {inspectPdfReorder as actual,reorderPdfPages} from '/src/pdf-reorder.js?actual=1';
export {reorderPdfPages};
export async function inspectPdfReorder(bytes){const result=await actual(bytes);if(window.holdNext){window.holdNext=false;window.heldResult=result;return new Promise(resolve=>{window.releasePreflight=()=>resolve(result);});}return result;}`;

test('reorder preflight gates only supported copies and cannot update stale reviews',{timeout:60000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4982','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill('SIGTERM'));
 for(let i=0;i<80;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===79)throw new Error('Vite did not start');await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());
 async function pageFor(t){const page=await browser.newPage();t.after(()=>page.close());await page.setRequestInterception(true);page.on('request',r=>r.url()===url+'/__availability.html'?r.respond({status:200,contentType:'text/html',body:html}):r.url()===url+'/src/pdf-reorder.js'?r.respond({status:200,contentType:'text/javascript',body:wrapper}):r.continue());await page.goto(url+'/__availability.html');await page.waitForFunction(()=>window.ready);return page;}
 async function assertControls(page,allowed){assert.equal(await page.$eval('#pdf-review-order',n=>n.disabled),!allowed);assert.equal(await page.$eval('.pdf-review-order button[type="submit"]',n=>n.disabled),!allowed);assert.equal(await page.$eval('#pdf-review-download',n=>n.disabled),false);assert.equal(await page.$eval('#pdf-review-print',n=>n.disabled),false);}
 await t.test('native unsupported structure keeps exact download and preview usable',async t=>{
  const page=await pageFor(t);await page.evaluate(()=>review.open(unsupported,'unsupported.pdf',{kind:'original'}));await assertControls(page,false);
  assert.equal(await page.$$eval('.pdf-review-page canvas',nodes=>nodes.length),2);
  assert.match(await page.$eval('#pdf-review-order-help',n=>n.textContent),/unavailable.*navigation, attachments or tagged structures/);
  await page.click('#pdf-review-download');await page.waitForFunction(()=>downloads.length===1);
  assert.deepEqual(await page.evaluate(()=>downloads[0]),await page.evaluate(()=>({name:'unsupported.pdf',bytes:Array.from(unsupported)})));
  await page.evaluate(()=>review.open(original,'supported.pdf',{kind:'original'}));await assertControls(page,true);
  assert.match(await page.$eval('#pdf-review-order-help',n=>n.textContent),/Include every page once/);
 });
 await t.test('page controls remain usable in a narrow review',async t=>{
  const page=await pageFor(t);await page.setViewport({width:375,height:812});await page.evaluate(()=>review.open(original,'supported.pdf',{kind:'original'}));
  const bounds=await page.evaluate(()=>Array.from(document.querySelectorAll('.pdf-review-order input,.pdf-review-order button')).map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height};}));
  for(const box of bounds){assert.ok(box.left>=0&&box.right<=375,JSON.stringify(box));assert.ok(box.height>=44);}
  assert.equal(await page.$eval('#pdf-review-pages',n=>n.clientHeight>100),true);
  if(process.env.JETT_QA_SCREENSHOT)await page.screenshot({path:process.env.JETT_QA_SCREENSHOT});
 });
 await t.test('close while preflight is held never enables abandoned controls',async t=>{
  const page=await pageFor(t);await page.evaluate(()=>{holdNext=true;window.pending=review.open(original,'old.pdf');});await page.waitForFunction(()=>window.releasePreflight);
  assert.equal(await page.$eval('#pdf-review-order',n=>n.disabled),true);
  await page.click('#pdf-review-close');await page.evaluate(async()=>{releasePreflight();await pending;});
  assert.deepEqual(await page.evaluate(()=>({open:document.querySelector('dialog').open,disabled:document.getElementById('pdf-review-order').disabled,download:document.getElementById('pdf-review-download').disabled,pages:document.querySelectorAll('.pdf-review-page').length})),{open:false,disabled:true,download:true,pages:0});
 });
 for(const oldAllowed of [true,false])await t.test('new '+(oldAllowed?'unsupported':'supported')+' review ignores previous preflight',async t=>{
  const page=await pageFor(t);await page.evaluate(allowed=>{window.holdNext=true;window.pending=review.open(allowed?original:unsupported,'old.pdf');},oldAllowed);await page.waitForFunction(()=>window.releasePreflight);
  assert.equal(await page.evaluate(()=>heldResult.allowed),oldAllowed,'held result comes from real native preflight');
  await page.evaluate(allowed=>review.open(allowed?unsupported:original,'new.pdf',{kind:'newer'}),oldAllowed);
  const help=await page.$eval('#pdf-review-order-help',n=>n.textContent);
  await page.evaluate(async()=>{releasePreflight();await pending;});await assertControls(page,!oldAllowed);
  assert.equal(await page.$eval('#pdf-review-order-help',n=>n.textContent),help);
  assert.equal(await page.$eval('#pdf-review-title',n=>n.textContent),'Review newer copy');
  await page.click('#pdf-review-download');await page.waitForFunction(()=>downloads.length===1);
  assert.deepEqual(await page.evaluate(()=>downloads[0]),await page.evaluate(allowed=>({name:'new.pdf',bytes:Array.from(allowed?unsupported:original)}),oldAllowed));
 });
});
