import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';
const url='http://127.0.0.1:4985';
const html=`<!doctype html><dialog id="pdf-review-dialog"><h2 id="pdf-review-title"></h2><p id="pdf-review-status" role="status"></p><div id="pdf-review-pages"></div><button id="pdf-review-download">Download</button><button id="pdf-review-print">Print</button><button id="pdf-review-close">Close</button></dialog>
<script type="module">
import {initPdfReview} from '/src/pdf-review.js';
window.downloads=[];
HTMLAnchorElement.prototype.click=function(){const name=this.download;fetch(this.href).then(r=>r.arrayBuffer()).then(b=>downloads.push({name,bytes:Array.from(new Uint8Array(b))}));};
window.review=initPdfReview();window.original=new Uint8Array(await(await fetch('/test/fixtures/jett-annotations.pdf')).arrayBuffer());
await review.open(original,'source.pdf',{kind:'original'});window.ready=true;
</script>`;
test('extract review validates input, renders a native copy, and downloads its exact bytes',{timeout:60000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4985','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill('SIGTERM'));
 for(let i=0;i<80;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===79)throw new Error('Vite did not start');await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();await page.setRequestInterception(true);page.on('request',r=>r.url()===url+'/__extract.html'?r.respond({status:200,contentType:'text/html',body:html}):r.continue());
 await page.goto(url+'/__extract.html');await page.waitForFunction(()=>window.ready);
 assert.equal(await page.$eval('#pdf-review-extract',n=>n.value),'1-3');
 async function order(value){await page.$eval('#pdf-review-extract',(n,v)=>{n.value=v;},value);await page.click('.pdf-review-extract button');}
 await order('1,1');assert.equal(await page.$eval('#pdf-review-extract',n=>n.getAttribute('aria-invalid')),'true');
 assert.equal(await page.$eval('#pdf-review-download',n=>n.disabled),false);
 await order('3,1');await page.waitForFunction(()=>document.getElementById('pdf-review-title').textContent==='Review extracted original copy'&&!document.getElementById('pdf-review-download').disabled);
 assert.equal(await page.$eval('#pdf-review-extract',n=>n.value),'1-2');assert.equal(await page.$$eval('#pdf-review-pages canvas',n=>n.length),2);
 await page.click('#pdf-review-download');await page.waitForFunction(()=>downloads.length===1);
 const result=await page.evaluate(async()=>{const {default:unused,...m}=await import('/node_modules/mupdf/dist/mupdf.js');const doc=new m.PDFDocument(new Uint8Array(downloads[0].bytes)),source=new m.PDFDocument(original);function content(d,i){const p=d.loadPage(i),s=p.toStructuredText();try{return s.asText();}finally{s.destroy();p.destroy();}}try{return {name:downloads[0].name,text:[content(doc,0),content(doc,1)],expected:[content(source,2),content(source,0)]};}finally{doc.destroy();source.destroy();}});
 assert.equal(result.name,'source-extracted.pdf');assert.deepEqual(result.text,result.expected);
 await page.click('[data-review-undo]');await page.waitForFunction(()=>document.getElementById('pdf-review-title').textContent==='Review original copy'&&!document.getElementById('pdf-review-download').disabled);
 assert.equal(await page.$eval('[data-review-undo]',n=>n.disabled),true);
 await page.click('#pdf-review-download');await page.waitForFunction(()=>downloads.length===2);
 assert.deepEqual(await page.evaluate(()=>downloads[1]),await page.evaluate(()=>({name:'source.pdf',bytes:Array.from(original)})));
 await page.click('[data-pdf-rotate="right"]');await page.waitForFunction(()=>document.getElementById('pdf-review-title').textContent==='Review rotated original copy'&&!document.getElementById('pdf-review-download').disabled);
 await page.click('[data-review-undo]');await page.waitForFunction(()=>document.getElementById('pdf-review-title').textContent==='Review original copy'&&!document.getElementById('pdf-review-download').disabled);
 await page.click('#pdf-review-download');await page.waitForFunction(()=>downloads.length===3);
 assert.deepEqual(await page.evaluate(()=>downloads[2]),await page.evaluate(()=>({name:'source.pdf',bytes:Array.from(original)})));
 await page.click('#pdf-review-close');assert.equal(await page.$eval('.pdf-review-extract button',n=>n.disabled),true);
});
