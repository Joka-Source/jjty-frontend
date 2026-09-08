import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {root} from './validate.mjs';
test('JETT visual page overview reorders, extracts, undoes and saves the exact reviewed copy',{timeout:60000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5082','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill());
 const url='http://127.0.0.1:5082';for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();await page.setViewport({width:1280,height:1000});
 await page.evaluateOnNewDocument(()=>{localStorage.setItem('jt.welcomed','1');localStorage.setItem('jt.mic','off');window.downloads=[];HTMLAnchorElement.prototype.click=function(){fetch(this.href).then(r=>r.arrayBuffer()).then(b=>downloads.push(Array.from(new Uint8Array(b))));};});
 await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);
 await(await page.$('#home-file-input')).uploadFile(path.join(root,'test/fixtures/jett-annotations.pdf'));
 await page.waitForFunction(()=>document.querySelector('#reader-tabs [aria-selected="true"]')?.dataset.documentId===window.__jtApp.currentDoc()?.id);
 await page.locator('[data-workspace="organize"]').click();await page.locator('#reader-organize-pages').click();
 await page.waitForFunction(()=>!document.getElementById('pdf-review-download').disabled);
 await page.locator('.pdf-page-overview-toolbar button').click();
 assert.equal(await page.$eval('[aria-label="Move page 1 earlier"]',n=>n.disabled),true);
 await page.locator('[aria-label="Move page 2 earlier"]').click();
 await page.waitForFunction(()=>document.getElementById('pdf-review-title').textContent.includes('reordered')&&!document.getElementById('pdf-review-download').disabled);
 await page.locator('#pdf-review-download').click();await page.waitForFunction(()=>downloads.length===1);
 const bytes=await page.evaluate(()=>downloads[0]);const task=getDocument({data:new Uint8Array(bytes)});const pdf=await task.promise;try{assert.equal(pdf.numPages,3);const text=await(await pdf.getPage(1)).getTextContent();assert.ok(text.items.map(n=>n.str).join(' ').includes('Annotation geometry fixture'));}finally{await task.destroy();}
 await page.locator('[data-review-undo]').click();await page.waitForFunction(()=>document.getElementById('pdf-review-title').textContent==='Review original copy'&&!document.getElementById('pdf-review-download').disabled);
 await page.locator('#pdf-review-download').click();await page.waitForFunction(()=>downloads.length===2);
 assert.deepEqual(await page.evaluate(()=>downloads[1]),Array.from(await readFile(path.join(root,'test/fixtures/jett-annotations.pdf'))));
 await page.locator('[aria-label="Select page 2"]').click();await page.locator('[data-overview-extract]').click();
 await page.waitForFunction(()=>document.getElementById('pdf-review-title').textContent.includes('extracted')&&!document.getElementById('pdf-review-download').disabled);
 assert.equal(await page.$$eval('.pdf-review-page',n=>n.length),1);assert.equal(await page.$eval('[data-overview-extract]',n=>n.disabled),true);
 await page.locator('#pdf-review-download').click();await page.waitForFunction(()=>downloads.length===3);
 const extraction=getDocument({data:new Uint8Array(await page.evaluate(()=>downloads[2]))});const extracted=await extraction.promise;try{assert.equal(extracted.numPages,1);assert.ok((await(await extracted.getPage(1)).getTextContent()).items.map(n=>n.str).join(' ').includes('Annotation geometry fixture'));}finally{await extraction.destroy();}
 if(process.env.JETT_SAVE_EVIDENCE_DIR){await mkdir(process.env.JETT_SAVE_EVIDENCE_DIR,{recursive:true});for(const [name,width,height] of [['desktop',1280,1000],['phone',390,844]]){await page.setViewport({width,height});await page.screenshot({path:path.join(process.env.JETT_SAVE_EVIDENCE_DIR,`${name}.png`)});}await page.setViewport({width:1280,height:1000});}
 const parentId=await page.evaluate(()=>window.__jtApp.currentDoc().id);
 await page.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...rest){if(this.name==='docs'&&value.id?.startsWith('review_'))throw new DOMException('Injected save quota','QuotaExceededError');return originalPut.call(this,value,...rest);};});
 await page.locator('#pdf-review-save').click();await page.waitForFunction(()=>document.getElementById('pdf-review-status').textContent.includes('Could not save this copy'));
 assert.equal(await page.$eval('#pdf-review-dialog',n=>n.open),true);
 await page.evaluate(()=>{IDBObjectStore.prototype.put=originalPut;});
 await page.locator('#pdf-review-save').click();await page.waitForFunction(()=>window.__jtApp.currentDoc()?.id.startsWith('review_'));
 const savedId=await page.evaluate(()=>window.__jtApp.currentDoc().id);
 const saved=await page.evaluate(async id=>{const {getDoc}=await import('/src/db.js');const d=await getDoc(id);return {bytes:Array.from(new Uint8Array(d.sourceBytes)),parent:d.provenance.derivedFrom.documentId};},savedId);
 assert.deepEqual(saved.bytes,await page.evaluate(()=>downloads[2]));assert.equal(saved.parent,parentId);
 await page.reload();await page.waitForFunction(()=>window.__jtApp?.booted);
 const restored=await page.evaluate(async id=>{const {getDoc}=await import('/src/db.js');return Array.from(new Uint8Array((await getDoc(id)).sourceBytes));},savedId);assert.deepEqual(restored,saved.bytes);
});
