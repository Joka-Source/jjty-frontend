import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import * as mupdf from 'mupdf';
import {root} from './validate.mjs';
import {exportAnnotatedPdf} from '../src/pdf-annotations.js';
import {ingestPdfBrowser} from '../src/ingest.js';
import {createMuPdfProvider} from '../src/pdf-engine.js';
import {createAnchor} from '../src/anchors.js';

test('review reads literal notes from serialized PDF pages and clears them between copies', {timeout:60000},async t=>{
  const source=new Uint8Array(await readFile(path.join(root,'test/fixtures/jett-annotations.pdf'))), original=source.slice();
  const doc={id:'review-notes-fixture',...await ingestPdfBrowser(createMuPdfProvider(mupdf),source,{name:'notes.pdf'})};
  const notes=['<script>window.noteExecuted=true</script>\nCafé — नमस्ते\nSecond line','Rotated page note: 日本語'];
  const records=notes.map((noteText,index)=>({id:`literal-note-${index}`,docId:doc.id,kind:'act',act:'note',arrival:'exact',blockIndex:index,noteText,
    anchor:createAnchor({blockTexts:doc.blocks.map(b=>b.text),blockIndex:index,tokenStart:index===0?7:3,tokenEnd:index===0?10:5,docDigest:doc.provenance.contentDigest})}));
  const exported=await exportAnnotatedPdf(doc,records);
  assert.deepEqual(source,original,'export preserves input bytes');
  // Only the serialized PDF is sent into the browser, never the records array.
  const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4966','--strictPort'],{cwd:root,stdio:'ignore'});
  t.after(()=>server.kill('SIGTERM'));
  const url='http://127.0.0.1:4966/';let ready=false;
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,'isolated module server starts');
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
  t.after(()=>browser.close());
  const page=await browser.newPage();await page.setRequestInterception(true);
  page.on('request',request=>{
    if(request.isNavigationRequest()&&request.frame()===page.mainFrame())return request.respond({status:200,contentType:'text/html',body:'<!doctype html><link rel="stylesheet" href="/src/jett.css"><dialog id="pdf-review-dialog"><h2 id="pdf-review-title"></h2><button id="pdf-review-close">Close</button><p id="pdf-review-status"></p><button id="pdf-review-download">Download</button><div id="pdf-review-pages"></div></dialog>'});
    void request.continue();
  });
  await page.goto(url);
  await page.evaluate(async bytes=>{
    const {initPdfReview}=await import('/src/pdf-review.js');
    window.proofReview=initPdfReview();window.proofBytes=new Uint8Array(bytes);
    await window.proofReview.open(window.proofBytes,'literal-notes.pdf',{kind:'annotated'});
  },[...exported]);
  assert.equal(await page.$$eval('.pdf-review-page canvas',nodes=>nodes.length),3);
  assert.deepEqual(await page.$$eval('.pdf-review-page',nodes=>nodes.map(n=>Array.from(n.querySelectorAll('.pdf-review-notes li p'),p=>p.textContent))),[[],[notes[0]],[notes[1]]]);
  assert.equal(await page.$$eval('.pdf-review-notes script',nodes=>nodes.length),0);
  assert.equal(await page.evaluate(()=>window.noteExecuted),undefined);
  assert.deepEqual(await page.$$eval('.pdf-review-notes summary',nodes=>nodes.map(n=>n.textContent)),['Notes on page 2 (1)','Notes on page 3 (1)']);
  await page.focus('.pdf-review-notes summary');await page.keyboard.press('Enter');
  assert.equal(await page.$eval('.pdf-review-notes',node=>node.open),true,'native summary opens with keyboard');
  assert.match(await page.$eval('.pdf-review-notes p',node=>getComputedStyle(node).whiteSpace),/pre/,'multiline note retains whitespace');
  assert.deepEqual(await page.evaluate(()=>[...window.proofBytes]),[...exported],'review preserves supplied PDF bytes');
  await page.evaluate(()=>window.proofReview.close());
  assert.equal(await page.$$eval('.pdf-review-notes',nodes=>nodes.length),0,'closing clears prior notes synchronously');
  await page.evaluate(async bytes=>window.proofReview.open(new Uint8Array(bytes),'original.pdf',{kind:'original'}),[...source]);
  assert.equal(await page.$$eval('.pdf-review-notes',nodes=>nodes.length),0,'a different original copy does not inherit notes');
  await page.evaluate(()=>window.proofReview.open(window.proofBytes,'notes-again.pdf',{kind:'annotated'}));
  assert.equal(await page.$$eval('.pdf-review-notes',nodes=>nodes.length),2,'reopened PDF reads its own serialized notes');
  await page.keyboard.press('Escape');
  assert.equal(await page.$$eval('.pdf-review-notes',nodes=>nodes.length),0);
  assert.deepEqual(source,original);
});
