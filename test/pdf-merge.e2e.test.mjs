import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import * as m from 'mupdf';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';
const url='http://127.0.0.1:4990';
async function pagesOf(bytes){const task=getDocument({data:new Uint8Array(bytes),standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname});try{const pdf=await task.promise,pages=[];for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i);pages.push({rotate:p.rotate,view:p.view,text:(await p.getTextContent()).items.map(v=>v.str??'').join('|')});}return pages;}finally{await task.destroy();}}
const engine=`export * from '/src/pdf-engine.js?actual=1';
import {createMuPdfProvider as nativeProvider} from '/src/pdf-engine.js?actual=1';
export function createMuPdfProvider(m){const provider=nativeProvider(m);return {...provider,async open(bytes){
 const opened=await provider.open(bytes);if(!window.failNextReviewRender)return opened;window.failNextReviewRender=false;
 const getPage=opened.document.getPage.bind(opened.document),destroy=opened.loadingTask.destroy.bind(opened.loadingTask);
 return {...opened,document:{...opened.document,getPage:async n=>{const page=await getPage(n);return n===1?{...page,render:()=>({promise:new Promise((resolve,reject)=>{window.rejectMergedRender=()=>reject(new Error('Injected merged preview render failure'));})})}:page;}},loadingTask:{...opened.loadingTask,destroy:async()=>{try{await destroy();}finally{window.failedRenderDestroyed=true;}}}};
}};}`;

test('actual review merges selected PDFs, preserves originals and undo, and rejects stale failed previews',{timeout:90000},async t=>{
 const fixture=path.join(root,'test/fixtures/jett-annotations.pdf'),source=await readFile(fixture),dir=await mkdtemp(path.join(tmpdir(),'jett-merge-e2e-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));const rotatedPath=path.join(dir,'rotated.pdf'),doc=new m.PDFDocument(source),first=doc.loadPage(0),object=first.getObject();
 let rotated;try{object.put('Rotate',90);const buffer=doc.saveToBuffer();try{rotated=new Uint8Array(buffer.asUint8Array());}finally{buffer.destroy();}}finally{object.destroy();first.destroy();doc.destroy();}await writeFile(rotatedPath,rotated);
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4990','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill('SIGTERM'));
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===99)throw Error('Vite startup failed');await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());
 async function app(t){const page=await browser.newPage();t.after(()=>page.close());await page.setViewport({width:1280,height:900});await page.setRequestInterception(true);page.on('request',r=>r.url()===url+'/src/pdf-engine.js'?r.respond({status:200,contentType:'text/javascript',body:engine}):r.continue());
  await page.evaluateOnNewDocument(()=>{localStorage.setItem('jt.welcomed','1');localStorage.setItem('jt.mic','off');window.downloads=[];HTMLAnchorElement.prototype.click=function(){const name=this.download;fetch(this.href).then(r=>r.arrayBuffer()).then(b=>downloads.push({name,bytes:[...new Uint8Array(b)]}));};});
  await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);await(await page.$('#home-file-input')).uploadFile(fixture);await page.waitForFunction(()=>document.body.dataset.view==='read'&&!document.getElementById('review-original').hidden);await page.locator('#review-original').click();await page.waitForFunction(()=>!document.getElementById('pdf-review-download').disabled);return page;
 }
 async function add(page,...files){if(!await page.$eval('.pdf-review-merge-options',n=>n.open))await page.click('.pdf-review-merge-options summary');await(await page.$('#pdf-review-merge')).uploadFile(...files);await page.click('.pdf-review-merge button');}
 async function download(page){const n=await page.evaluate(()=>downloads.length);await page.click('#pdf-review-download');await page.waitForFunction(n=>downloads.length>n,{},n);return page.evaluate(()=>downloads.at(-1));}
 await t.test('real PDF.js readback proves current copy then selected file order and exact undo',async t=>{
  const page=await app(t),id=await page.evaluate(()=>window.__jtApp.currentDoc().id);await add(page,rotatedPath,fixture);
  await page.waitForFunction(()=>document.getElementById('pdf-review-title').textContent==='Review merged original copy'&&!document.getElementById('pdf-review-download').disabled);
  assert.equal(await page.$$eval('#pdf-review-pages canvas',nodes=>nodes.length),9);
  const result=await download(page);assert.equal(result.name,'jett-annotations-merged.pdf');
  await page.setViewport({width:375,height:900});
  const form=await page.$eval('.pdf-review-merge',n=>({width:n.clientWidth,scroll:n.scrollWidth,buttonHeight:n.querySelector('button').getBoundingClientRect().height}));
  assert.ok(form.scroll<=form.width+1,JSON.stringify(form));assert.ok(form.buttonHeight>=44);
  const plainPages=await pagesOf(source);assert.deepEqual(await pagesOf(result.bytes),[...plainPages,...await pagesOf(rotated),...plainPages]);
  assert.deepEqual(await page.evaluate(()=>Object.values(window.__jtApp.currentDoc().sourceBytes)),[...source]);assert.equal(await page.evaluate(()=>window.__jtApp.currentDoc().id),id);
  await page.click('[data-review-undo]');await page.waitForFunction(()=>document.getElementById('pdf-review-title').textContent==='Review original copy'&&!document.getElementById('pdf-review-download').disabled);
  assert.deepEqual((await download(page)).bytes,[...source]);assert.equal(await page.$eval('[data-review-undo]',n=>n.disabled),true);
  await add(page,path.join(root,'test/fixtures/jett-fillable.pdf'));await page.waitForFunction(()=>document.getElementById('pdf-review-status').textContent.startsWith('Could not merge'));
  assert.deepEqual((await download(page)).bytes,[...source]);assert.equal(await page.$eval('.pdf-review-merge button',n=>n.disabled),false,'core failure permits retry');assert.equal(await page.evaluate(()=>window.__jtApp.micAudioHeld()),false);
 });
 await t.test('failed merged render restores exact previous download and preview',async t=>{
  const page=await app(t);await page.evaluate(()=>{window.failNextReviewRender=true;});await add(page,rotatedPath);await page.waitForFunction(()=>window.rejectMergedRender);
  assert.equal(await page.$eval('#pdf-review-download',n=>n.disabled),true);await page.evaluate(()=>rejectMergedRender());
  await page.waitForFunction(()=>document.getElementById('pdf-review-status').textContent.startsWith('The merged copy could not be displayed'));
  assert.equal(await page.$$eval('#pdf-review-pages canvas',nodes=>nodes.length),3);const result=await download(page);assert.deepEqual(result.bytes,[...source]);assert.equal(result.name,'jett-annotations.pdf');
  assert.equal(await page.$eval('#pdf-review-merge',n=>n.disabled),false);assert.equal(await page.$eval('#pdf-review-extract',n=>n.disabled),false);
 });
 await t.test('closing and reopening while merge render waits cannot revive the obsolete result',async t=>{
  const page=await app(t);await page.evaluate(()=>{window.failNextReviewRender=true;});await add(page,rotatedPath);await page.waitForFunction(()=>window.rejectMergedRender);
  await page.click('#pdf-review-close');await page.locator('#review-original').click();await page.waitForFunction(()=>!document.getElementById('pdf-review-download').disabled);
  await page.evaluate(()=>rejectMergedRender());await page.waitForFunction(()=>window.failedRenderDestroyed);
  assert.equal(await page.$eval('#pdf-review-title',n=>n.textContent),'Review original copy');assert.deepEqual((await download(page)).bytes,[...source]);assert.equal(await page.$$eval('#pdf-review-pages canvas',nodes=>nodes.length),3);
 });
 assert.deepEqual(await readFile(fixture),source);assert.deepEqual(await readFile(rotatedPath),Buffer.from(rotated));
});
