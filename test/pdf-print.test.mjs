import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {readFile,mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';
import puppeteer from 'puppeteer-core';import * as mupdf from 'mupdf';
import {root} from './validate.mjs';import {exportCombinedPdf} from '../src/pdf-combined.js';
import {inspectPdfForm} from '../src/pdf-forms.js';import {ingestPdfBrowser} from '../src/ingest.js';
import {createMuPdfProvider} from '../src/pdf-engine.js';import {createAnchor} from '../src/anchors.js';

test('printing handoff opens exact PDF bytes and preserves active viewers across reviews', {timeout:60000},async t=>{
 const original=new Uint8Array(await readFile(path.join(root,'test/fixtures/jett-fillable.pdf'))),before=original.slice();
 const source={id:'print-proof',...await ingestPdfBrowser(createMuPdfProvider(mupdf),original,{name:'print-proof.pdf'})};
 const fields=(await inspectPdfForm(original)).fields;
 const savedFormDraft={sourceDigest:source.provenance.contentDigest,values:Object.fromEntries(fields.map(f=>[f.key,f.name==='full_name'?'Print Example':f.value]))};
 const mark={id:'print-heading',docId:source.id,kind:'act',act:'highlight',arrival:'exact',blockIndex:0,anchor:createAnchor({blockTexts:source.blocks.map(b=>b.text),blockIndex:0,tokenStart:0,tokenEnd:2,docDigest:source.provenance.contentDigest})};
 const {bytes}=await exportCombinedPdf({source,savedFormDraft,committedRecords:[mark]});
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4970','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill('SIGTERM'));
 const url='http://127.0.0.1:4970/';let ready=false;for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:false,args:['--no-first-run']});t.after(()=>browser.close());
 const page=await browser.newPage();await page.setRequestInterception(true);
 page.on('request',request=>{
  if(request.isNavigationRequest()&&request.frame()===page.mainFrame())return request.respond({status:200,contentType:'text/html',body:'<!doctype html><dialog id="pdf-review-dialog"><h2 id="pdf-review-title"></h2><button id="pdf-review-close">Close</button><p id="pdf-review-status"></p><button id="pdf-review-download">Download</button><button id="pdf-review-print">Open for printing</button><div id="pdf-review-pages"></div></dialog>'});void request.continue();
 });await page.goto(url);page.removeAllListeners('request');await page.setRequestInterception(false);
 await page.evaluate(async()=>{
  const {initPdfReview}=await import('/src/pdf-review.js');window.review=initPdfReview();window.handoffs=[];window.realOpen=window.open.bind(window);window.printCalls=0;
  window.print=()=>{window.printCalls++;throw new Error('Native printing must remain user controlled');};
  window.open=(...args)=>{const popup=window.realOpen(...args);window.handoffs.push({url:args[0],popup});return popup;};
 });
 await page.evaluate(async bytes=>{window.sourceSnapshot=new Uint8Array(bytes);window.reviewOpening=window.review.open(window.sourceSnapshot,'combined.pdf',{kind:'filled and annotated'});},[...bytes]);
 assert.equal(await page.$eval('#pdf-review-print',n=>n.disabled),true,'print handoff waits for exact review rendering');
 await page.evaluate(()=>window.reviewOpening);
 const priorTargets=new Set(browser.targets());const targetPromise=browser.waitForTarget(target=>!priorTargets.has(target)&&target.type()==='page',{timeout:5000});
 await page.bringToFront();await page.locator('#pdf-review-print').click();const target=await targetPromise;
 const first=await page.evaluate(async()=>{const h=window.handoffs[0];return {url:h.url,bytes:[...new Uint8Array(await(await fetch(h.url)).arrayBuffer())],openerDetached:h.popup.opener===null};});
 await new Promise(r=>setTimeout(r,1300));assert.equal(target.url(),first.url,'real Chrome target receives the actual PDF URL');assert.deepEqual(first.bytes,[...bytes]);assert.equal(first.openerDetached,true);
 const viewer=await target.page();await viewer.bringToFront();
 const nativeViewer=await viewer.evaluate(()=>Array.from(document.querySelectorAll('embed'),e=>({type:e.type,src:e.src})));
 assert.ok(nativeViewer.some(e=>e.type==='application/pdf') || viewer.frames().some(f=>f.url().startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/')), 'real Chrome native PDF viewer loads');
 if(process.env.JETT_PRINT_PROOF_DIR){const out=path.resolve(process.env.JETT_PRINT_PROOF_DIR);await mkdir(out,{recursive:true});await viewer.screenshot({path:path.join(out,'native-viewer.png')});await writeFile(path.join(out,'handoff.pdf'),bytes);await writeFile(path.join(out,'result.json'),JSON.stringify({result:'PASS_NATIVE_VIEWER_EXACT_BYTES',nativeViewer,openerDetached:first.openerDetached,byteLength:bytes.length,nativePrintInvoked:false},null,2));}

 await page.evaluate(()=>window.review.close());
 assert.equal(await page.$eval('#pdf-review-print',n=>n.disabled),true);
 assert.deepEqual(await page.evaluate(async()=>[...new Uint8Array(await(await fetch(window.handoffs[0].url)).arrayBuffer())]),[...bytes],'closing review does not break an active print viewer');
 await page.evaluate(async original=>window.review.open(new Uint8Array(original),'original.pdf',{kind:'original'}),[...original]);
 assert.deepEqual(await page.evaluate(async()=>[...new Uint8Array(await(await fetch(window.handoffs[0].url)).arrayBuffer())]),[...bytes],'new review cannot replace existing viewer bytes');
 await page.evaluate(()=>{window.open=(...args)=>{window.blockedUrl=args[0];return null;};});
 await page.bringToFront();await page.locator('#pdf-review-print').click();
 assert.match(await page.$eval('#pdf-review-status',n=>n.textContent),/block|allow|download/i,'blocked popup provides recovery');
 assert.equal(await page.evaluate(async()=>{try{await fetch(window.blockedUrl);return false;}catch{return true;}}),true,'blocked handoff URL is released');
 assert.equal(await page.$eval('#pdf-review-download',n=>n.disabled),false,'download remains available after popup denial');
 await page.evaluate(()=>{window.open=(...args)=>{const popup=window.realOpen(...args);window.handoffs.push({url:args[0],popup});return popup;};});
 await page.bringToFront();await page.locator('#pdf-review-print').click();
 assert.deepEqual(await page.evaluate(async()=>[...new Uint8Array(await(await fetch(window.handoffs[1].url)).arrayBuffer())]),[...original],'reopened review hands off its own bytes');
 await page.evaluate(()=>window.handoffs.forEach(h=>h.popup.close()));
 await page.waitForFunction(async()=>{for(const h of window.handoffs){try{await fetch(h.url);return false;}catch{}}return true;},{timeout:10000});
 await page.evaluate(()=>window.review.open(new Uint8Array([1,2,3]),'invalid.pdf'));
 assert.equal(await page.$eval('#pdf-review-print',n=>n.disabled),true,'render failure disables print');
 assert.equal(await page.evaluate(()=>window.printCalls),0);assert.deepEqual(original,before);
 const app=await browser.newPage();await app.setViewport({width:1280,height:900});
 await app.goto(url);await app.waitForFunction(()=>window.__jtApp?.booted);await app.locator('#welcome-next').click();await app.locator('#welcome-skip').click();
 await (await app.$('#home-file-input')).uploadFile(path.join(root,'test/fixtures/jett-fillable.pdf'));
 await app.waitForSelector('#review-original:not([hidden])');await app.locator('#review-original').click();
 await app.waitForFunction(()=>document.getElementById('pdf-review-dialog').open&&!document.getElementById('pdf-review-print').disabled);
 assert.equal(await app.$eval('#pdf-review-title',n=>n.textContent),'Review original copy');
 await app.setViewport({width:390,height:844});
 assert.equal(await app.$eval('.pdf-review-actions',n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&n.scrollWidth<=n.clientWidth;}),true,'phone review keeps print and download controls within view');
 if(process.env.JETT_PRINT_PROOF_DIR)await app.screenshot({path:path.join(path.resolve(process.env.JETT_PRINT_PROOF_DIR),'phone-review.png')});
 await app.evaluate(()=>{const open=window.open.bind(window);window.open=(...args)=>{window.originalPrintUrl=args[0];window.originalPrintPopup=open(...args);return window.originalPrintPopup;};});
 await app.locator('#pdf-review-print').click();
 assert.deepEqual(await app.evaluate(async()=>[...new Uint8Array(await(await fetch(window.originalPrintUrl)).arrayBuffer())]),[...original],'actual app original review hands off preserved source bytes');
 await app.evaluate(()=>window.originalPrintPopup.close());await app.keyboard.press('Escape');
 await app.evaluate(()=>window.__jtApp.addDocument('A plain text document.','Text only'));
 assert.equal(await app.$eval('#review-original',n=>n.hidden),true,'PDF original control hides for a text document');

});
