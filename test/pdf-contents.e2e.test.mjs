import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import * as mupdf from 'mupdf';import puppeteer from 'puppeteer-core';import {root} from './validate.mjs';
async function fixture(){const source=await readFile(path.join(root,'test/fixtures/jett-annotations.pdf')),doc=new mupdf.PDFDocument(source),held=[],keep=v=>(held.push(v),v),trailer=doc.getTrailer(),catalog=trailer.get('Root'),page=doc.loadPage(2);try{const tree=keep(doc.addObject({Count:2})),chapter=keep(doc.addObject({Count:-1})),child=keep(doc.addObject({})),external=keep(doc.addObject({})),fit=keep(doc.newName('Fit'));tree.put('First',chapter);tree.put('Last',external);chapter.put('Parent',tree);chapter.put('Next',external);chapter.put('Title',keep(doc.newString('Chapter नमस्ते')));chapter.put('Dest',[keep(page.getObject()),fit]);chapter.put('First',child);chapter.put('Last',child);child.put('Parent',chapter);child.put('Title',keep(doc.newString('<b>First page</b>')));child.put('Dest',[0,fit]);external.put('Parent',tree);external.put('Prev',chapter);external.put('Title',keep(doc.newString('External website')));external.put('A',{S:keep(doc.newName('URI')),URI:keep(doc.newString('https://example.com'))});catalog.put('Outlines',tree);const bytes=doc.saveToBuffer();try{return new Uint8Array(bytes.asUint8Array());}finally{bytes.destroy();}}finally{held.reverse().forEach(v=>v.destroy());page.destroy();catalog.destroy();trailer.destroy();doc.destroy();}}
test('real PDF contents navigation keeps marks, returns to reading place and survives reopening',{timeout:90000},async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'jett-contents-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=path.join(dir,'contents.pdf'),bytes=await fixture();await writeFile(file,bytes);
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4984','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill('SIGTERM'));const url='http://127.0.0.1:4984/';for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===99)throw Error('Vite startup failed');await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.setViewport({width:1280,height:900});await page.evaluateOnNewDocument(()=>{localStorage.setItem('jt.welcomed','1');localStorage.setItem('jt.mic','off');});await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);await(await page.$('#home-file-input')).uploadFile(file);await page.waitForFunction(()=>document.querySelector('#pdf-contents-list .pdf-contents-target'));
 const original=await page.evaluate(()=>window.__jtApp.currentDoc());
 const chapterBlock=original.blocks.findIndex(b=>b.locator==='page:3'),childBlock=original.blocks.findIndex(b=>b.locator==='page:1');
 for(const engine of ['mupdf','pdfjs']){
  if(engine==='pdfjs')await page.evaluate(async()=>{const doc=window.__jtApp.currentDoc();doc.pdfEngine={...doc.pdfEngine,activeEngine:'pdfjs'};await window.__jtApp.openDocument(doc);});
  await page.waitForFunction(()=>document.querySelector('#pdf-contents-list .pdf-contents-target'));
  await page.waitForFunction(()=>document.body.dataset.view==='read');
  await page.locator('.pdf-text-layer[data-block="0"]').click();
  await page.click('#reader-pages-toggle');await page.click('#pdf-contents summary');
  const chapter='#pdf-contents-list > li:first-child > .pdf-contents-row > .pdf-contents-target';
  await page.click(chapter);assert.equal(await page.evaluate(()=>window.__jtApp.currentBlock()),chapterBlock);
  assert.ok(await page.$eval('.pdf-page[data-page="3"]',n=>n.getBoundingClientRect().top>=90&&n.getBoundingClientRect().top<innerHeight-120));
  assert.equal(await page.$eval('#pdf-contents-back',n=>n.hidden),true);await page.click('#reader-page-return');await page.waitForFunction(()=>document.getElementById('reader-page-return').disabled);assert.equal(await page.evaluate(()=>window.__jtApp.currentBlock()),0);
  assert.equal(await page.$eval('#pdf-contents-back',n=>n.disabled),true);
  await page.click('#pdf-contents-list .pdf-contents-toggle');
  assert.equal(await page.$eval('#pdf-contents-list >li:first-child >ol',n=>n.hidden),false);
  assert.equal(await page.$eval('#pdf-contents-list >li:first-child >ol button',n=>n.firstChild.textContent),'<b>First page</b>');
  assert.equal(await page.$('#pdf-contents-list b'),null);
  await page.click('#pdf-contents-list >li:first-child >ol button');assert.equal(await page.evaluate(()=>window.__jtApp.currentBlock()),childBlock);
  assert.equal(await page.$eval('#pdf-contents-list >li:last-child .pdf-contents-target',n=>n.disabled),true);
 }
 await page.evaluate(()=>window.__jtApp.voiceSegment('highlight this'));assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act'&&!e.undone).length),0,'blank page cannot authorize a stale highlight');
 await page.click('#pdf-contents-list > li:first-child > .pdf-contents-row > .pdf-contents-target');
 const mark=await page.evaluate(async(blockIndex)=>{await window.__jtApp.perform('highlight',blockIndex,{tokenStart:0,tokenEnd:2});await window.__jtApp.position.flush();return window.__jtApp.entries().filter(e=>e.kind==='act'&&!e.undone).map(e=>e.id);},chapterBlock);
 assert.ok(mark.length);
 // Contents, search and numbered jumps keep the same original departure.
 const departure=await page.$eval('#reader-page-return',n=>n.textContent);
 await page.click('#reader-search-toggle');await page.type('#pdf-search-input','orchard');
 await page.waitForFunction(()=>document.getElementById('pdf-search-count').textContent==='1 of 4');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'pdf-search-input');
 assert.equal(await page.$eval('#reader-page-return',n=>n.textContent),departure);
 if(process.env.JETT_SHARED_NAV_EVIDENCE_DIR){await mkdir(process.env.JETT_SHARED_NAV_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.JETT_SHARED_NAV_EVIDENCE_DIR,'reader-search.png')});}
 const hitTop=await page.evaluate(()=>[...CSS.highlights.get('jt-pdf-search')][0].getBoundingClientRect().top);
 const chromeBottom=await page.$eval('#reader-chrome',n=>n.getBoundingClientRect().bottom);
 assert.ok(Math.abs(hitTop-chromeBottom-12)<3,`search hit ${hitTop} aligns below chrome ${chromeBottom}`);
 await page.evaluate(()=>{document.getElementById('pdf-search-next').click();document.getElementById('pdf-search-next').click();});
 await page.waitForFunction(()=>document.getElementById('pdf-search-count').textContent==='3 of 4');
 await page.locator('#reader-page-number').fill('3');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.getElementById('reader-page-number').value==='3'&&!document.getElementById('reader-page-return').disabled);
 assert.equal(await page.$eval('#reader-page-return',n=>n.textContent),departure);
 await page.click('#reader-page-return');await page.waitForFunction(()=>document.getElementById('reader-page-return').disabled);
 await page.$eval('#pdf-search-input',n=>{n.value='no-such-phrase';n.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForFunction(()=>document.getElementById('pdf-search-count').textContent.includes('0 matches'));
 assert.equal(await page.$eval('#reader-page-return',n=>n.hidden),true,'empty results do not invent a departure');
 await page.locator('#pdf-search-input').fill('');
 await page.click('#pdf-contents-list > li:first-child > .pdf-contents-row > .pdf-contents-target');
 await page.waitForFunction(()=>document.getElementById('reader-page-number').value==='3');
 await page.reload();await page.waitForFunction(()=>window.__jtApp?.booted&&document.querySelector('#pdf-contents-list .pdf-contents-target'));assert.equal(await page.evaluate(()=>window.__jtApp.currentBlock()),chapterBlock);
 assert.deepEqual(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act'&&!e.undone).map(e=>e.id)),mark);
 assert.deepEqual(await page.evaluate(()=>Object.values(window.__jtApp.currentDoc().sourceBytes)),[...bytes]);
 await page.evaluate(()=>window.__jtApp.addDocument('Another source with its own reading place.','Other source'));assert.equal(await page.$eval('#pdf-contents',n=>n.hidden),true);assert.equal(await page.$$eval('#pdf-contents-list li',nodes=>nodes.length),0);
 assert.deepEqual(await readFile(file),Buffer.from(bytes));
});
