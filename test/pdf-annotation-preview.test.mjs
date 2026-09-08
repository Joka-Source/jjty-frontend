import {selectPdfQuote} from './pdf-selection-helpers.mjs';
import {openReaderMenu,selectWorkspace,clickReaderControl} from './reader-navigation.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {root} from './validate.mjs';

test('local PDF marks survive reload and export as reviewed standard annotations', {timeout:90000},async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'jett-annotation-review-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4964','--strictPort'],{cwd:root,stdio:'ignore'});
  t.after(()=>server.kill('SIGTERM'));
  const url='http://127.0.0.1:4964/';let ready=false;
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready);
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
  t.after(()=>browser.close());
  const page=await browser.newPage();await page.setViewport({width:1280,height:900});
  const cdp=await page.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:directory});
  await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);
  await clickReaderControl(page,'#welcome-next');await clickReaderControl(page,'#welcome-skip');
  const fixture=path.join(root,'test/fixtures/jett-annotations.pdf'),original=await readFile(fixture);
  await (await page.$('#home-file-input')).uploadFile(fixture);
  await page.waitForSelector('#pdf-annotation-panel:not([hidden])');
  await page.waitForFunction(()=>document.querySelector('#reader-tabs [aria-selected="true"]')?.dataset.documentId===window.__jtApp.currentDoc()?.id);
  await page.locator('[data-workspace="annotate"]').click();
  const sourceId=await page.evaluate(()=>window.__jtApp.currentDoc().id);
  await selectPdfQuote(page,'The orchard is ready.',1);
  await page.locator('[data-annotation="highlight"]').click();
  await page.waitForFunction(()=>window.__jtApp.entries().some(e=>e.act==='highlight'));
  await selectPdfQuote(page,'The orchard is ready.',1);
  await page.locator('[data-annotation="note"]').click();
  await page.locator('#annotation-note-text').fill('Inspect the second orchard passage.');
  assert.equal(await page.$eval('[data-annotation="export"]',n=>n.disabled),true,'unsaved note must not be silently omitted from export');
  const heldZoom=await page.$eval('#pdf-zoom-value',n=>n.textContent);
  await page.locator('#pdf-zoom-in').click();
  await page.waitForFunction(()=>document.getElementById('status-text').textContent.includes('Save or cancel your note'));
  assert.equal(await page.$eval('#annotation-note-text',n=>n.value),'Inspect the second orchard passage.','zoom must retain note draft');
  assert.equal(await page.$eval('#pdf-zoom-value',n=>n.textContent),heldZoom);
  await page.evaluate(()=>{window.annotationOriginalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='records')throw new DOMException('Injected note quota','QuotaExceededError');return window.annotationOriginalPut.apply(this,args);};});
  await page.locator('.annotation-note button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('.annotation-selection').textContent.includes('could not be saved'));
  assert.equal(await page.$eval('#annotation-note-text',n=>n.value),'Inspect the second orchard passage.');
  assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.act==='note').length),0);
  await page.evaluate(()=>{IDBObjectStore.prototype.put=window.annotationOriginalPut;});
  await page.locator('.annotation-note button[type="submit"]').click();
  try{await page.waitForFunction(()=>window.__jtApp.entries().some(e=>e.act==='note'),{timeout:10000});}catch(error){throw new Error(await page.$eval('#annotation-toolbar',n=>n.textContent),{cause:error});}
  await page.reload();await page.waitForFunction(()=>window.__jtApp?.booted);
  await page.evaluate(async id=>{
    const {getDoc}=await import('/src/db.js');await window.__jtApp.openDocument(await getDoc(id));window.__jtApp.showView('read');
  },sourceId);
  await selectWorkspace(page,'annotate');await openReaderMenu(page,'pdf-annotation-panel');
  await clickReaderControl(page,'#pdf-annotation-preview');
  await page.waitForFunction(()=>document.getElementById('pdf-review-dialog').open&&!document.getElementById('pdf-review-download').disabled,{timeout:30000});
  assert.equal(await page.$eval('#pdf-review-title',n=>n.textContent),'Review annotated copy');
  assert.equal(await page.$$eval('.pdf-review-page canvas',n=>n.length),3);
  await page.$eval('.pdf-review-page:nth-child(2)',n=>n.scrollIntoView({block:'start'}));
  assert.ok(await page.$eval('#pdf-review-download',n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'download stays visible while reviewing later pages');
  await page.setViewport({width:390,height:844});
  assert.ok(await page.$eval('#pdf-review-dialog',n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),'review fits a phone viewport');
  assert.ok(await page.$eval('#pdf-review-close',n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'close stays visible on a phone');
  await clickReaderControl(page,'#pdf-review-download');
  let downloaded;
  for(let i=0;i<100;i++){downloaded=(await readdir(directory)).find(name=>name.endsWith('.pdf'));if(downloaded)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(downloaded);
  const task=getDocument({data:new Uint8Array(await readFile(path.join(directory,downloaded)))});
  try {
    const pdf=await task.promise;
    assert.equal((await (await pdf.getPage(1)).getAnnotations()).length,0,'blank first page must stay unmarked');
    const annotations=await (await pdf.getPage(2)).getAnnotations();
    assert.equal(annotations.filter(a=>a.subtype==='Highlight').length,1);
    const note=annotations.find(a=>a.subtype==='Text');
    assert.equal(note.contentsObj.str,'Inspect the second orchard passage.');
  } finally {await task.destroy();}
  assert.deepEqual(await page.evaluate(()=>Object.values(window.__jtApp.currentDoc().sourceBytes)),[...original]);
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.getElementById('pdf-review-dialog').open);
  await page.evaluate(async()=>{
    await window.__jtApp.perform('undo',0,{});await window.__jtApp.perform('undo',0,{});
  });
  await clickReaderControl(page,'#pdf-annotation-preview');
  await page.waitForFunction(()=>!document.getElementById('pdf-annotation-preview').disabled);
  assert.equal(await page.$eval('#pdf-review-dialog',n=>n.open),false,'undone marks must not export');
  assert.match(await page.$eval('#pdf-annotation-status',n=>n.textContent),/could not be created/i);
  assert.deepEqual(await readFile(fixture),original);
});
