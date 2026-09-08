import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import puppeteer from 'puppeteer-core';import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';import {root} from './validate.mjs';

test('rotated review downloads preserve forms and marks while keeping original bytes', {timeout:90000},async t=>{
 const directory=process.env.JETT_ROTATION_PROOF_DIR?path.resolve(process.env.JETT_ROTATION_PROOF_DIR,String(Date.now())):await mkdtemp(path.join(tmpdir(),'jett-rotation-'));await mkdir(directory,{recursive:true});if(!process.env.JETT_ROTATION_PROOF_DIR)t.after(()=>rm(directory,{recursive:true,force:true}));
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4973','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill('SIGTERM'));
 const url='http://127.0.0.1:4973/';let ready=false;for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});t.after(()=>browser.close());
 const page=await browser.newPage();await page.setViewport({width:1280,height:900});await page.evaluateOnNewDocument(()=>{localStorage.setItem('jt.welcomed','1');localStorage.setItem('jt.mic','off');});await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);
 const original=await readFile(path.join(root,'test/fixtures/jett-fillable.pdf'));await (await page.$('#home-file-input')).uploadFile(path.join(root,'test/fixtures/jett-fillable.pdf'));await page.waitForSelector('#pdf-form-panel:not([hidden])');await page.locator('#pdf-form-panel summary').click();
 await page.$eval('[data-field-name="full_name"]',n=>{n.value='Rotated Example';n.dispatchEvent(new Event('input',{bubbles:true}));});await page.$eval('[data-field-name="consent"]',n=>{n.checked=true;n.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForFunction(()=>!document.getElementById('pdf-form-preview').disabled);
 const saved=await page.evaluate(async()=>{await window.__jtApp.perform('highlight',0,{tokenStart:0,tokenEnd:2});await window.__jtApp.perform('annotate',0,{tokenStart:0,tokenEnd:2,noteText:'Check this rotated copy.'});return {id:window.__jtApp.currentDoc().id,entries:window.__jtApp.entries().filter(e=>e.kind==='act'&&!e.undone)};});
 await page.locator('#pdf-form-include-marks').click();await page.locator('#pdf-form-preview').click();
 const readyReview=()=>page.waitForFunction(()=>document.getElementById('pdf-review-dialog').open&&!document.getElementById('pdf-review-download').disabled);
 await readyReview();
 const rotate=async direction=>{await page.locator(`[data-pdf-rotate="${direction}"][data-page-index="0"]`).click();await readyReview();};
 const cdp=await page.createCDPSession();
 const download=async label=>{const folder=path.join(directory,label);await mkdir(folder,{recursive:true});await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:folder});await page.locator('#pdf-review-download').click();let file;for(let i=0;i<100;i++){file=(await readdir(folder)).find(n=>n.endsWith('.pdf'));if(file)break;await new Promise(r=>setTimeout(r,100));}assert.ok(file);return path.join(folder,file);};
 const inspect=async(file,rotation)=>{const task=getDocument({data:new Uint8Array(await readFile(file))});try{const pdf=await task.promise;assert.equal(pdf.numPages,2);assert.deepEqual([(await pdf.getPage(1)).rotate,(await pdf.getPage(2)).rotate],[rotation,0]);const fields=await pdf.getFieldObjects();assert.equal(fields.full_name[0].value,'Rotated Example');const marks=(await(await pdf.getPage(1)).getAnnotations()).filter(a=>['Highlight','Text'].includes(a.subtype));assert.equal(marks.length,2);assert.equal(marks.find(a=>a.subtype==='Text').contentsObj.str,'Check this rotated copy.');assert.equal(marks.find(a=>a.subtype==='Highlight').contentsObj.str,saved.entries.find(e=>e.act==='highlight').anchor.quotedText);}finally{await task.destroy();}};
 await rotate('right');const rotated=await download('rotated');await inspect(rotated,90);
 if(process.env.JETT_ROTATION_PROOF_DIR)await page.screenshot({path:path.join(directory,'rotated-review.png'),fullPage:true});
 await rotate('right');await rotate('right');await rotate('right');const normalized=await download('four-turns');await inspect(normalized,0);
 assert.deepEqual(await page.evaluate(()=>Object.values(window.__jtApp.currentDoc().sourceBytes)),[...original]);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('pdf-review-dialog').open);await page.locator('#review-original').click();await readyReview();
 await page.evaluate(()=>{document.querySelector('[data-pdf-rotate="right"][data-page-index="0"]').click();document.getElementById('pdf-review-close').click();});
 await page.waitForFunction(()=>!document.getElementById('pdf-review-dialog').open);await page.locator('#review-original').click();await readyReview();
 const fresh=await download('fresh-original');const task=getDocument({data:new Uint8Array(await readFile(fresh))});try{assert.equal((await(await task.promise).getPage(1)).rotate,0,'closed rotation cannot leak into a newer original review');}finally{await task.destroy();}
 await page.evaluate(()=>window.__jtApp.addDocument('Switch away from PDF.','Other document'));assert.equal(await page.$eval('#pdf-review-dialog',n=>n.open),false);
 assert.deepEqual(await readFile(path.join(root,'test/fixtures/jett-fillable.pdf')),original);
 if(process.env.JETT_ROTATION_PROOF_DIR)console.log(JSON.stringify({proof:directory}));
 await writeFile(path.join(directory,'result.json'),JSON.stringify({result:'PASS',rotated,normalized,fresh,expectedAnnotations:saved.entries.map(e=>({page:1,nm:'jett:'+e.id,subtype:e.act==='note'?'/Text':'/Highlight',contents:e.act==='note'?e.noteText:e.anchor.quotedText}))},null,2));
});
