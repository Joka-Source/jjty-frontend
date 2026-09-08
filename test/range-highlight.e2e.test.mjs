import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {root} from './validate.mjs';

test('exact ranges clip endpoints, persist atomically, export across pages and undo once', {timeout:90000},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'jett-range-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4967','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill('SIGTERM'));
 const url='http://127.0.0.1:4967/';let ready=false;
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});t.after(()=>browser.close());
 const page=await browser.newPage();await page.setViewport({width:1280,height:900});
 const cdp=await page.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:directory});
 await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);await page.locator('#welcome-next').click();await page.locator('#welcome-skip').click();
 const range=(fromAnchor,toAnchor)=>page.evaluate((fromAnchor,toAnchor)=>window.__jtApp.perform('highlight-range',undefined,{fromAnchor,toAnchor}),fromAnchor,toAnchor);
 await page.evaluate(()=>window.__jtApp.addDocument('Before untouched. Start here selected middle finish here. After untouched.','Same block range'));
 await range('Start here','finish here');
 let entries=await page.evaluate(()=>window.__jtApp.entries());
 assert.equal(entries.filter(e=>e.kind==='act'&&!e.undone).length,1);
 assert.equal(entries.at(-1).anchor.quotedText,'Start here selected middle finish here');
 assert.equal(await page.$eval('mark.jt-highlight',n=>n.textContent),'Start here selected middle finish here','visible highlight clips both endpoints');
 const before=entries.length;await range('finish here','Start here');
 assert.equal(await page.evaluate(()=>window.__jtApp.entries().length),before,'reversed endpoints must not create a mark');
 await page.evaluate(()=>{
   window.originalRangePut=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(...args){if(this.name==='records')throw new DOMException('Synthetic range save failure','QuotaExceededError');return window.originalRangePut.apply(this,args);};
 });
 try{await range('Start here','finish here');}catch{}
 await page.evaluate(()=>{IDBObjectStore.prototype.put=window.originalRangePut;});
 assert.equal(await page.evaluate(()=>window.__jtApp.entries().length),before,'failed persistence must not publish an in-memory act');
 await page.evaluate(async()=>{
   const {putRecord}=await import('/src/db.js');
   const entry=structuredClone(window.__jtApp.entries().find(e=>e.kind==='act'));
   entry.anchor.docDigest='sha256:wrong-source';await putRecord(entry);
   await window.__jtApp.openDocument(window.__jtApp.currentDoc());
 });
 assert.equal(await page.evaluate(()=>window.__jtApp.entries().find(e=>e.kind==='act').arrival),'lost','normalized same-block range must check its source on replay');
 assert.equal(await page.$$eval('mark.jt-highlight',nodes=>nodes.length),0,'source-mismatched range must not repaint');
 await page.evaluate(()=>window.__jtApp.addDocument('Alpha start phrase first middle finish phrase. Beta start phrase second middle finish phrase.','Repeated range'));
 await range('start phrase','finish phrase');
 assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act').length),0,'ambiguous endpoints require a choice');
 await page.waitForFunction(()=>!document.getElementById('ask').hidden);
 // Root supplies native choice buttons for exact start/end candidates.
 await page.click('#ask-options .range-ask');
 if(await page.evaluate(()=>!document.getElementById('ask').hidden))await page.click('#ask-options .range-ask');
 await page.waitForFunction(()=>window.__jtApp.entries().some(e=>e.kind==='act'));
 assert.equal(await page.evaluate(()=>window.__jtApp.entries().find(e=>e.kind==='act').anchor.quotedText),'start phrase first middle finish phrase','chosen repeated endpoints select the intended occurrence');
 assert.ok(await page.evaluate(()=>window.__jtApp.entries().find(e=>e.kind==='act').targetChoice.candidates.length>=2),'receipt retains offered endpoint choices');
 const fixture=path.join(root,'test/fixtures/jett-range.pdf'),original=await readFile(fixture);
 await (await page.$('#home-file-input')).uploadFile(fixture);
 await page.waitForSelector('#pdf-annotation-panel:not([hidden])');
 await range('Start at the orchard gate','Finish beside the river');
 const sourceId=await page.evaluate(()=>window.__jtApp.currentDoc().id);
 assert.deepEqual(await page.evaluate(()=>window.__jtApp.entries().find(e=>e.kind==='act'&&!e.undone).resolvedSegments.map(s=>s.quotedText)),['Start at the orchard gate.\n\nContinue through the trees','Middle page first line.\n\nEvery middle word belongs to the range','Finish beside the river']);
 assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act'&&!e.undone).length),1,'multipage range is one act');
 await page.reload();await page.waitForFunction(()=>window.__jtApp?.booted);
 await page.evaluate(async id=>{const {getDoc}=await import('/src/db.js');await window.__jtApp.openDocument(await getDoc(id));window.__jtApp.showView('read');},sourceId);
 assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act'&&!e.undone).length),1,'range survives reload');
 await page.locator('#pdf-annotation-panel summary').click();await page.locator('#pdf-annotation-preview').click();
 await page.waitForFunction(()=>document.getElementById('pdf-review-dialog').open&&!document.getElementById('pdf-review-download').disabled);
 await page.locator('#pdf-review-download').click();let downloaded;
 for(let i=0;i<100;i++){downloaded=(await readdir(directory)).find(n=>n.endsWith('.pdf'));if(downloaded)break;await new Promise(r=>setTimeout(r,100));}assert.ok(downloaded);
 const task=getDocument({data:new Uint8Array(await readFile(path.join(directory,downloaded)))});
 try{
  const pdf=await task.promise;assert.equal(pdf.numPages,3);
  const annotations=[];for(let p=1;p<=3;p++)annotations.push((await (await pdf.getPage(p)).getAnnotations()).filter(a=>a.subtype==='Highlight'));
  assert.deepEqual(annotations.map(a=>a.length),[1,1,1]);
  const expected=['Start at the orchard gate.\n\nContinue through the trees','Middle page first line.\n\nEvery middle word belongs to the range','Finish beside the river'];
  assert.deepEqual(annotations.map(a=>a[0].contentsObj.str),expected);
  assert.ok(annotations.every(a=>a[0].quadPoints?.length>0),'each exported page has actual quads');
  assert.ok(annotations[0][0].rect[3]<710,'first unselected line excluded');
  assert.ok(annotations[2][0].rect[1]>700,'last unselected line excluded');
 }finally{await task.destroy();}
 assert.deepEqual(await page.evaluate(()=>Object.values(window.__jtApp.currentDoc().sourceBytes)),[...original]);
 await page.keyboard.press('Escape');await page.evaluate(()=>window.__jtApp.perform('undo',undefined,{}));
 assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act'&&!e.undone).length),0,'one undo removes the complete multipage range');
 await page.reload();await page.waitForFunction(()=>window.__jtApp?.booted);
 await page.evaluate(async id=>{const {getDoc}=await import('/src/db.js');await window.__jtApp.openDocument(await getDoc(id));},sourceId);
 assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act'&&!e.undone).length),0,'one-step undo survives reload');
 assert.deepEqual(await readFile(fixture),original);
});
