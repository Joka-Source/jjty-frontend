import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {readFile} from 'node:fs/promises';import path from 'node:path';
import puppeteer from 'puppeteer-core';import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {root} from './validate.mjs';import {selectPdfQuote} from './pdf-selection-helpers.mjs';
test('underline-only work survives Organize and Save copy to Library without changing the source',{timeout:90000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5088','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill());const url='http://127.0.0.1:5088';
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.setViewport({width:1280,height:1000});
 await page.evaluateOnNewDocument(()=>{localStorage.setItem('jt.welcomed','1');localStorage.setItem('jt.mic','off');});await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);
 const fixture=path.join(root,'test/fixtures/jett-fillable.pdf');await(await page.$('#home-file-input')).uploadFile(fixture);await page.waitForFunction(()=>!!window.__jtApp.currentDoc()?.id&&document.querySelector('#reader-tabs [aria-selected="true"]')?.dataset.documentId===window.__jtApp.currentDoc().id);
 const sourceId=await page.evaluate(()=>window.__jtApp.currentDoc().id);
 await page.locator('[data-workspace="annotate"]').click();await page.select('#annotation-color','blue');await selectPdfQuote(page,'Contact and delivery',0,1);await page.locator('[data-annotation="underline"]').click();await page.waitForFunction(()=>window.__jtApp.entries().some(e=>e.act==='underline'));
 await page.locator('[data-workspace="organize"]').click();await page.locator('#reader-organize-pages').click();await page.waitForFunction(()=>document.getElementById('pdf-review-title').textContent==='Review saved-work copy'&&!document.getElementById('pdf-review-save').disabled);
 await page.locator('#pdf-review-save').click();await page.waitForFunction(()=>window.__jtApp.currentDoc()?.id.startsWith('review_'));const resultId=await page.evaluate(()=>window.__jtApp.currentDoc().id);
 await page.reload();await page.waitForFunction(()=>window.__jtApp?.booted);
 const result=await page.evaluate(async({sourceId,resultId})=>{const {getDoc}=await import('/src/db.js');const source=await getDoc(sourceId),result=await getDoc(resultId);return {original:Array.from(new Uint8Array(source.sourceBytes)),bytes:Array.from(new Uint8Array(result.sourceBytes)),origin:result.provenance.derivedFrom};},{sourceId,resultId});assert.deepEqual(result.original,Array.from(await readFile(fixture)));assert.equal(result.origin.documentId,sourceId);
 const task=getDocument({data:new Uint8Array(result.bytes)});const pdf=await task.promise;try{const annotations=await(await pdf.getPage(1)).getAnnotations();const marks=annotations.filter(a=>['Highlight','Underline','StrikeOut'].includes(a.subtype));assert.equal(marks.length,1);assert.equal(marks[0].subtype,'Underline');assert.deepEqual(Array.from(marks[0].color),[51,140,255]);assert.ok(marks[0].quadPoints.length>0);}finally{await task.destroy();}
});
