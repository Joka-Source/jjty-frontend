import {openReaderView} from './reader-navigation.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {mkdtemp,readFile,readdir,rm,mkdir,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import puppeteer from 'puppeteer-core';import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {root} from './validate.mjs';import {selectPdfQuote} from './pdf-selection-helpers.mjs';

test('own text-markup toolbar preserves typed colors, overlap, ranges, reload and backup through native export',{timeout:150000},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'jett-markup-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5092','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill());const url='http://127.0.0.1:5092';
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());
 async function boot(context){const page=await context.newPage();await page.setViewport({width:1280,height:1000});await page.evaluateOnNewDocument(()=>{localStorage.setItem('jt.welcomed','1');localStorage.setItem('jt.mic','off');});await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);return page;}
 const page=await boot(browser);const fixture=path.join(root,'test/fixtures/jett-range.pdf');await(await page.$('#home-file-input')).uploadFile(fixture);await page.waitForFunction(()=>window.__jtApp.currentDoc()?.provenance?.sourceKind==='pdf');const sourceId=await page.evaluate(()=>window.__jtApp.currentDoc().id);
 await page.locator('[data-workspace="annotate"]').click();
 const active=()=>page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act'&&!e.undone));
 async function mark(act,color){await page.select('#annotation-color',color);await selectPdfQuote(page,'Start at the orchard gate',0,1);const count=(await active()).length;await page.locator(`[data-annotation="${act}"]`).click();await page.waitForFunction(count=>window.__jtApp.entries().filter(e=>e.kind==='act'&&!e.undone).length===count+1,{},count);}
 await mark('highlight','yellow');await mark('underline','green');await mark('strikethrough','blue');
 assert.deepEqual((await active()).map(e=>[e.act,e.markupColor]),[['highlight','yellow'],['underline','green'],['strikethrough','blue']]);
 await page.locator('[data-annotation="undo"]').click();await page.waitForFunction(()=>window.__jtApp.entries().filter(e=>e.kind==='act'&&!e.undone).length===2);
 assert.equal(await page.$$eval('[data-markup="strikethrough"]',n=>n.length),0);assert.ok(await page.$$eval('[data-markup="underline"]',n=>n.length)>0);assert.ok(await page.$$eval('[data-markup="highlight"]',n=>n.length)>0);
 await mark('strikethrough','blue');
 const countBefore=(await active()).length,paintBefore=await page.$$eval('mark[data-entry]',n=>n.length);
 await page.select('#annotation-color','red');await selectPdfQuote(page,'Start at the orchard gate',0,1);
 await page.evaluate(()=>{window.originalMarkupPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='records')throw new DOMException('Injected markup failure','QuotaExceededError');return originalMarkupPut.apply(this,args);};});
 await page.locator('[data-annotation="underline"]').click();await page.waitForFunction(()=>document.querySelector('.annotation-selection').textContent.includes('could not be saved'));
 assert.equal((await active()).length,countBefore);assert.equal(await page.$$eval('mark[data-entry]',n=>n.length),paintBefore);
 await page.evaluate(()=>{IDBObjectStore.prototype.put=originalMarkupPut;});
 // Native DOM ranges exercise the same selection bridge as a drag; button actions are real UI clicks.
 await page.select('#annotation-color','pink');
 await page.evaluate(()=>{
  function point(pageNumber,phrase,end){const block=document.querySelector(`.pdf-page[data-page="${pageNumber}"] [data-block]`),offset=block.dataset.blockText.indexOf(phrase)+(end?phrase.length:0);const item=[...block.querySelectorAll('[data-pdf-char-start]')].find(n=>offset>=+n.dataset.pdfCharStart&&(end?offset<=+n.dataset.pdfCharEnd:offset<+n.dataset.pdfCharEnd));let remaining=offset-+item.dataset.pdfCharStart,node;const walker=document.createTreeWalker(item,NodeFilter.SHOW_TEXT);while(node=walker.nextNode()){if(remaining<=node.length)return[node,remaining];remaining-=node.length;}throw new Error('Range endpoint missing');}
  const range=document.createRange();range.setStart(...point(1,'Start at the orchard gate',false));range.setEnd(...point(3,'Finish beside the river',true));getSelection().removeAllRanges();getSelection().addRange(range);
 });
 await page.waitForFunction(()=>!document.querySelector('[data-annotation="underline"]').disabled);await page.locator('[data-annotation="underline"]').click();await page.waitForFunction(()=>window.__jtApp.entries().some(e=>e.verbId==='underline-range'));
 assert.equal((await active()).at(-1).resolvedSegments.length,3);assert.equal((await active()).at(-1).markupColor,'pink');
 const width=await page.$eval('.pdf-page',n=>n.getBoundingClientRect().width);await page.locator('#pdf-zoom-out').click();await page.waitForFunction(width=>document.querySelector('.pdf-page').getBoundingClientRect().width<width&&!document.getElementById('pdf-zoom-out').disabled,{},width);
 assert.equal(await page.$$eval('[data-markup="underline"]',n=>new Set(n.map(n=>n.closest('.pdf-page').dataset.page)).size),3);
 await page.reload();await page.waitForFunction(()=>window.__jtApp?.booted);await page.evaluate(async id=>{const {getDoc}=await import('/src/db.js');await window.__jtApp.openDocument(await getDoc(id));window.__jtApp.showView('read');},sourceId);await page.locator('[data-workspace="annotate"]').click();
 assert.equal(await page.$eval('#annotation-color',n=>n.value),'pink');assert.equal((await active()).length,4);assert.equal(await page.$$eval('[data-markup="underline"]',n=>new Set(n.map(n=>n.closest('.pdf-page').dataset.page)).size),3);
 assert.deepEqual(await page.evaluate(()=>Array.from(new Uint8Array(window.__jtApp.currentDoc().sourceBytes))),Array.from(await readFile(fixture)));
 async function exportUi(target,folder){await mkdir(folder,{recursive:true});const cdp=await target.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:folder});await target.locator('[data-annotation="export"]').click();await target.waitForFunction(()=>document.getElementById('pdf-review-dialog').open&&!document.getElementById('pdf-review-download').disabled);await target.locator('#pdf-review-download').click();let name;for(let i=0;i<100;i++){name=(await readdir(folder)).find(n=>n.endsWith('.pdf'));if(name)break;await new Promise(r=>setTimeout(r,100));}assert.ok(name);await target.keyboard.press('Escape');return readFile(path.join(folder,name));}
 async function inspect(bytes){const task=getDocument({data:new Uint8Array(bytes)});try{const pdf=await task.promise,result=[];for(let i=1;i<=pdf.numPages;i++)for(const a of await(await pdf.getPage(i)).getAnnotations())if(['Highlight','Underline','StrikeOut'].includes(a.subtype)){assert.ok(a.quadPoints?.length);result.push({page:i,type:a.subtype,color:Array.from(a.color)});}return result;}finally{await task.destroy();}}
 const output=await exportUi(page,path.join(directory,'original')),annotations=await inspect(output);
 assert.deepEqual(annotations,[{page:1,type:'Highlight',color:[255,217,0]},{page:1,type:'Underline',color:[51,191,89]},{page:1,type:'StrikeOut',color:[51,140,255]},{page:1,type:'Underline',color:[255,89,166]},{page:2,type:'Underline',color:[255,89,166]},{page:3,type:'Underline',color:[255,89,166]}]);
 const backup=await page.evaluate(async()=>{const {readLibrarySnapshot}=await import('/src/db.js'),{encodeLibraryBackup}=await import('/src/library-backup.js');return encodeLibraryBackup(await readLibrarySnapshot());});
 const context=await browser.createBrowserContext();const restored=await boot(context);
 const receipt=await restored.evaluate(async backup=>{const {readLibrarySnapshot,restoreLibrarySnapshot}=await import('/src/db.js'),{decodeLibraryBackup}=await import('/src/library-backup.js');const before=await readLibrarySnapshot();if(before.docs.length||before.records.length)throw new Error('Restore target was not empty');return restoreLibrarySnapshot(await decodeLibraryBackup(backup));},backup);assert.ok(receipt.records>=5);
 await restored.evaluate(async id=>{const {getDoc}=await import('/src/db.js');await window.__jtApp.openDocument(await getDoc(id));window.__jtApp.showView('read');},sourceId);await restored.locator('[data-workspace="annotate"]').click();
 assert.equal(await restored.$$eval('[data-markup="underline"]',n=>new Set(n.map(n=>n.closest('.pdf-page').dataset.page)).size),3);
 assert.deepEqual(await inspect(await exportUi(restored,path.join(directory,'restored'))),annotations);
 if(process.env.JETT_MARKUP_EVIDENCE_DIR){const out=process.env.JETT_MARKUP_EVIDENCE_DIR;await mkdir(out,{recursive:true});await writeFile(path.join(out,'exported.pdf'),output);await writeFile(path.join(out,'readback.json'),JSON.stringify({annotations,backupRestored:true,sourceUnchanged:true},null,2));await restored.$eval('.pdf-page',n=>n.scrollIntoView({block:'start'}));await restored.screenshot({path:path.join(out,'desktop.png')});await restored.setViewport({width:390,height:844});await openReaderView(restored,'#pdf-fit-width');await restored.locator('#pdf-fit-width').click();await restored.keyboard.press('Escape');await restored.waitForFunction(()=>document.querySelector('.pdf-page').getBoundingClientRect().width<=innerWidth&&!document.getElementById('pdf-zoom-out').disabled);await restored.evaluate(()=>scrollTo({top:0,behavior:'instant'}));assert.ok(await restored.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'phone document must not overflow horizontally');await restored.screenshot({path:path.join(out,'phone.png')});}
});
