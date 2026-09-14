import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';
const url='http://127.0.0.1:5083';
const html=`<!doctype html><dialog id="pdf-review-dialog"><h2 id="pdf-review-title"></h2><p id="pdf-review-status"></p><div id="pdf-review-pages"></div><button id="pdf-review-download">Download</button><button id="pdf-review-close">Close</button></dialog><script type="module">
import {initPdfReview} from '/src/pdf-review.js';import {reviewedCopyMetadata} from '/src/reviewed-copy.js';
window.calls=[];window.origin={documentId:'parent',contentDigest:'verified-source'};
window.review=initPdfReview({async saveCopy(bytes,name,origin,kind,{isCurrent}){const metadata=await reviewedCopyMetadata(bytes,origin,kind);calls.push({metadata,name});await new Promise(r=>window.releaseSave=r);window.oldOwns=isCurrent();return {id:metadata.id};}});
window.bytes=new Uint8Array(await(await fetch('/test/fixtures/jett-annotations.pdf')).arrayBuffer());await review.open(bytes,'first.pdf',{kind:'original',origin});window.ready=true;
</script>`;
test('save completion cannot close a newer review and retry identity excludes display names',{timeout:60000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5083','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill());
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.setRequestInterception(true);page.on('request',r=>r.url()===url+'/test-save'?r.respond({status:200,contentType:'text/html',body:html}):r.continue());await page.goto(url+'/test-save');await page.waitForFunction(()=>window.ready);
 await page.locator('#pdf-review-save').click();await page.waitForFunction(()=>!!window.releaseSave);assert.equal(await page.$eval('#pdf-review-save',n=>n.disabled),true);
 await page.evaluate(()=>review.open(bytes,'renamed.pdf',{kind:'newer',origin}));await page.waitForFunction(()=>!document.getElementById('pdf-review-download').disabled);
 await page.evaluate(()=>releaseSave());await page.waitForFunction(()=>!document.getElementById('pdf-review-save').disabled);
 assert.equal(await page.evaluate(()=>oldOwns),false);assert.equal(await page.$eval('#pdf-review-dialog',n=>n.open),true);assert.equal(await page.$eval('#pdf-review-title',n=>n.textContent),'Review newer copy');
 await page.locator('#pdf-review-save').click();await page.waitForFunction(()=>calls.length===2);assert.equal(await page.evaluate(()=>calls[0].metadata.id===calls[1].metadata.id),true);
 await page.evaluate(()=>releaseSave());await page.waitForFunction(()=>!document.getElementById('pdf-review-dialog').open);
});
