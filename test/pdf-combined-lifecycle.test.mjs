import test from 'node:test';import assert from 'node:assert/strict';import {spawn}from'node:child_process';import {readFile}from'node:fs/promises';import path from'node:path';
import puppeteer from'puppeteer-core';import {getDocument}from'pdfjs-dist/legacy/build/pdf.mjs';import * as mupdf from'mupdf';
import {root}from'./validate.mjs';import {ingestPdfBrowser}from'../src/ingest.js';import {createMuPdfProvider}from'../src/pdf-engine.js';

test('combined panel reuses its latest durable draft across reopen and fences delayed review ownership', {timeout:60000},async t=>{
 const input=new Uint8Array(await readFile(path.join(root,'test/fixtures/jett-fillable.pdf')));
 const source={id:'combined-lifecycle-source',...await ingestPdfBrowser(createMuPdfProvider(mupdf),input,{name:'jett-fillable.pdf'})};
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4969','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill('SIGTERM'));
 const url='http://127.0.0.1:4969/';let ready=false;for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});t.after(()=>browser.close());
 const page=await browser.newPage();await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);
 await page.evaluate(async source=>{
  document.body.innerHTML='<section id="pdf-form-panel"><p id="pdf-form-status"></p><div id="pdf-form-fields"></div><input id="pdf-form-include-marks" type="checkbox"><button id="pdf-form-preview">Review</button><button id="pdf-form-download">Download</button><button id="pdf-form-retry">Retry</button></section>';
  const {initPdfFormPanel}=await import('/src/pdf-form-panel.js');
  const h=window.__combinedLifecycle={source:structuredClone(source),staleOriginal:structuredClone(source),saved:[],opened:[],waiting:[],defer:false,generation:0};
  h.review={close(){h.generation++;},prepare(){h.generation++;const ticket=h.generation;return ()=>ticket===h.generation;},async open(bytes,name,options){h.opened.push({bytes:Array.from(bytes),name,options});return true;}};
  h.panel=initPdfFormPanel({review:h.review,saveDocument:async doc=>{h.saved.push(structuredClone(doc));},getRecords:async()=>h.defer?new Promise(resolve=>h.waiting.push(resolve)):[]});
  await h.panel.setDocument(h.source);
 },{...source,sourceBytes:Array.from(source.sourceBytes)});
 const expected={full_name:'Latest saved reader',reference:'LIFECYCLE-42',category:'Research',delivery:'Post',consent:true,notes:'Saved before leaving.\nRestored without stale data.'};
 for(const [name,value]of Object.entries(expected))await page.$eval(`[data-field-name="${name}"]`,(input,value)=>{if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));},value);
 await page.waitForFunction(()=>document.getElementById('pdf-form-status').textContent.startsWith('Answers saved')&&!document.getElementById('pdf-form-preview').disabled);
 await page.evaluate(async()=>{const h=window.__combinedLifecycle;await h.panel.setDocument(null);await h.panel.setDocument(structuredClone(h.staleOriginal));});
 assert.equal(await page.$eval('[data-field-name="full_name"]',input=>input.value),expected.full_name);
 assert.equal(await page.evaluate(()=>window.__combinedLifecycle.staleOriginal.formDraft??null),null,'reopened source deliberately has no new formDraft');
 await page.$eval('#pdf-form-include-marks',input=>{input.checked=true;input.dispatchEvent(new Event('change'));});
 await page.click('#pdf-form-preview');await page.waitForFunction(()=>window.__combinedLifecycle.opened.length===1);
 const result=await page.evaluate(()=>window.__combinedLifecycle.opened[0]);assert.equal(result.options.kind,'filled');
 const task=getDocument({data:new Uint8Array(result.bytes)});
 try{const pdf=await task.promise,fields=await pdf.getFieldObjects();for(const [name,value]of Object.entries(expected)){
  for(const widget of fields[name].filter(f=>f.value!==undefined))if(name==='consent')assert.notEqual(widget.value,'Off');else assert.equal(widget.value,value,`actual serialized ${name}`);
 }}finally{await task.destroy();}
 // A document transition invalidates an export waiting for committed history.
 await page.waitForFunction(()=>!document.getElementById('pdf-form-preview').disabled);
 await page.evaluate(()=>{window.__combinedLifecycle.defer=true;});await page.click('#pdf-form-preview');
 await page.waitForFunction(()=>window.__combinedLifecycle.waiting.length===1);
 await page.evaluate(async()=>{const h=window.__combinedLifecycle;await h.panel.setDocument(null);await h.panel.setDocument({...structuredClone(h.staleOriginal),id:'other-document'});h.waiting.shift()([]);});
 await page.waitForFunction(()=>!document.getElementById('pdf-form-preview').disabled);
 assert.equal(await page.evaluate(()=>window.__combinedLifecycle.opened.length),1,'obsolete document cannot replace review');
 // A newer review reservation wins even when the source document did not change.
 await page.evaluate(async()=>{const h=window.__combinedLifecycle;await h.panel.setDocument(structuredClone(h.staleOriginal));document.getElementById('pdf-form-include-marks').checked=true;});
 await page.click('#pdf-form-preview');await page.waitForFunction(()=>window.__combinedLifecycle.waiting.length===1);
 await page.evaluate(()=>{const h=window.__combinedLifecycle;h.review.prepare();h.waiting.shift()([]);});
 await page.waitForFunction(()=>document.getElementById('pdf-form-status').textContent==='A newer review replaced this request.');
 assert.equal(await page.evaluate(()=>window.__combinedLifecycle.opened.length),1,'obsolete preparation cannot open over newer review');
 assert.deepEqual(await page.evaluate(()=>window.__combinedLifecycle.staleOriginal.sourceBytes),Array.from(input));
 assert.deepEqual(new Uint8Array(await readFile(path.join(root,'test/fixtures/jett-fillable.pdf'))),input);
});
