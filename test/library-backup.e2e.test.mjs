import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import puppeteer from 'puppeteer-core';import {root} from './validate.mjs';

test('downloaded library backup restores originals and saved work atomically in a fresh context', {timeout:90000},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'jett-library-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4971','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill('SIGTERM'));
 const url='http://127.0.0.1:4971/';let ready=false;for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});t.after(()=>browser.close());
 const boot=async()=>{const context=await browser.createBrowserContext(),page=await context.newPage();await page.setViewport({width:1280,height:900});await page.evaluateOnNewDocument(()=>{localStorage.setItem('jt.welcomed','1');localStorage.setItem('jt.mic','off');});await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);return page;};
 const source=await boot(),fixture=path.join(root,'test/fixtures/jett-fillable.pdf'),original=await readFile(fixture);
 await (await source.$('#home-file-input')).uploadFile(fixture);await source.waitForSelector('#pdf-form-panel:not([hidden])');await source.locator('#pdf-form-panel summary').click();
 await source.$eval('[data-field-name="full_name"]',n=>{n.value='Backup Example';n.dispatchEvent(new Event('input',{bubbles:true}));});await source.waitForFunction(()=>!document.getElementById('pdf-form-download').disabled);
 const saved=await source.evaluate(async()=>{await window.__jtApp.perform('highlight',0,{tokenStart:0,tokenEnd:2});return {pdfId:window.__jtApp.currentDoc().id,mark:window.__jtApp.entries().find(e=>e.kind==='act')};});
 const textId=await source.evaluate(async()=>{await window.__jtApp.addDocument('Opening passage.\n\nRemember this second passage.\n\nClosing passage.','Backup reading position');return window.__jtApp.currentDoc().id;});
 await source.click('#doc p[data-block="1"]');await source.waitForFunction(async id=>{const {getPosition}=await import('/src/db.js');return (await getPosition(id))?.blockIndex===1;},{},textId);
 const png=Buffer.from(await source.evaluate(()=>{const c=document.createElement('canvas');c.width=32;c.height=24;c.getContext('2d').fillRect(0,0,32,24);return c.toDataURL('image/png').split(',')[1];}),'base64');
 const imageFile=path.join(directory,'source.png');await writeFile(imageFile,png);await (await source.$('#home-file-input')).uploadFile(imageFile);
 await source.waitForFunction(()=>window.__jtApp.currentDoc()?.provenance?.sourceKind==='image');const imageId=await source.evaluate(()=>window.__jtApp.currentDoc().id);
 const markdown=Buffer.from('# Saved markdown\r\n\r\nA **restored** passage.\r\n'),markdownFile=path.join(directory,'source.md');await writeFile(markdownFile,markdown);await (await source.$('#home-file-input')).uploadFile(markdownFile);
 await source.waitForFunction(()=>window.__jtApp.currentDoc()?.provenance?.sourceKind==='markdown');const markdownId=await source.evaluate(()=>window.__jtApp.currentDoc().id);
 await source.evaluate(()=>window.__jtApp.showView('settings'));
 const cdp=await source.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:directory});await source.locator('#library-backup-download').click();
 let filename;for(let i=0;i<100;i++){filename=(await readdir(directory)).find(n=>n.startsWith('jett-library-')&&n.endsWith('.json'));if(filename)break;await new Promise(r=>setTimeout(r,100));}assert.ok(filename,'backup must be an actual downloaded file');const backup=path.join(directory,filename);
 const destination=await boot();const existing=await destination.evaluate(async()=>{await window.__jtApp.addDocument('Existing destination document.','Preserve this document');return window.__jtApp.currentDoc().id;});await destination.evaluate(()=>window.__jtApp.showView('settings'));
 await (await destination.$('#library-backup-file')).uploadFile(backup);await destination.waitForFunction(()=>!document.getElementById('library-backup-restore').disabled);
 assert.match(await destination.$eval('#library-backup-preview',n=>n.textContent),/4 documents/,'preview describes incoming documents');
 await destination.setViewport({width:390,height:844});
 await destination.$eval('#library-backup-restore',n=>n.scrollIntoView({block:'center'}));
 assert.equal(await destination.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'restore settings fit a phone viewport');
 if(process.env.JETT_BACKUP_PROOF_DIR){await mkdir(process.env.JETT_BACKUP_PROOF_DIR,{recursive:true});await destination.screenshot({path:path.join(process.env.JETT_BACKUP_PROOF_DIR,'phone-preview.png')});}
 await destination.locator('#library-backup-restore').click();
 await destination.waitForFunction(async id=>{const {getDoc}=await import('/src/db.js');return !!await getDoc(id);},{},saved.pdfId);
 await destination.reload();await destination.waitForFunction(()=>window.__jtApp?.booted);
 const restored=await destination.evaluate(async({pdfId,textId,existing})=>{const {getDoc,getRecords,getPosition,getDocs}=await import('/src/db.js');const pdf=await getDoc(pdfId);return {source:Object.values(pdf.sourceBytes),draft:pdf.formDraft,marks:await getRecords(pdfId),position:await getPosition(textId),existing:await getDoc(existing),count:(await getDocs()).length};},{...saved,textId,existing});
 assert.deepEqual(restored.source,[...original]);assert.ok(Object.values(restored.draft.values).includes('Backup Example'));assert.ok(restored.marks.some(e=>e.id===saved.mark.id&&e.anchor.quotedText===saved.mark.anchor.quotedText));assert.deepEqual(restored.marks.find(e=>e.id===saved.mark.id).receipt,saved.mark.receipt,'historical receipt survives backup unchanged');assert.equal(restored.position.blockIndex,1);assert.equal(restored.existing.id,existing);assert.equal(restored.count,5);
 for(const [id,bytes,kind]of[[imageId,png,'image'],[markdownId,markdown,'markdown']]){
  assert.deepEqual(await destination.evaluate(async id=>{const {getDoc}=await import('/src/db.js');const doc=await getDoc(id);await window.__jtApp.openDocument(doc);window.__jtApp.showView('read');return Object.values(doc.sourceBytes);},id),[...bytes]);
  if(kind==='image')assert.equal(await destination.$eval('#doc img',n=>n.complete&&n.naturalWidth===32&&n.naturalHeight===24),true,'restored image decodes at original dimensions');
  else assert.match(await destination.$eval('#doc',n=>n.textContent),/Saved markdown/);
 }
 await destination.evaluate(async id=>{const {getDoc}=await import('/src/db.js');await window.__jtApp.openDocument(await getDoc(id));window.__jtApp.showView('read');},saved.pdfId);
 assert.equal(await destination.$eval('[data-field-name="full_name"]',n=>n.value),'Backup Example');assert.equal(await destination.evaluate(()=>window.__jtApp.entries().some(e=>e.kind==='act'&&!e.undone)),true);
 await destination.evaluate(()=>window.__jtApp.showView('settings'));
 const snapshot=()=>destination.evaluate(async()=>{const {readLibrarySnapshot}=await import('/src/db.js');return JSON.stringify(await readLibrarySnapshot());});const before=await snapshot();
 await (await destination.$('#library-backup-file')).uploadFile(backup);
 await destination.waitForFunction(()=>!document.getElementById('library-backup-restore').disabled);
 await destination.locator('#library-backup-restore').click();await destination.waitForFunction(()=>document.getElementById('library-backup-status').textContent.startsWith('Could not restore'));assert.match(await destination.$eval('#library-backup-status',n=>n.textContent),/exist|conflict|collision|already/i);assert.equal(await snapshot(),before,'colliding backup must not overwrite or partly restore');
 const malformed=path.join(directory,'malformed.json');await writeFile(malformed,'{"format":"jett","documents":[{"id":"untrusted"}]}');
 await (await destination.$('#library-backup-file')).uploadFile(malformed);await destination.waitForFunction(()=>/could not|invalid|unsupported/i.test(document.getElementById('library-backup-status').textContent));assert.equal(await destination.$eval('#library-backup-restore',n=>n.disabled||n.hidden),true);assert.equal(await snapshot(),before,'malformed backup must not mutate library');
 assert.deepEqual(await readFile(fixture),original);
 if(process.env.JETT_BACKUP_PROOF_DIR){await writeFile(path.join(process.env.JETT_BACKUP_PROOF_DIR,'library.json'),await readFile(backup));await writeFile(path.join(process.env.JETT_BACKUP_PROOF_DIR,'result.json'),JSON.stringify({result:'PASS_LOCAL_RESTORE',documents:restored.count,restoredDocuments:4,originalBytesMatch:true,imageAndMarkdownBytesMatch:true,savedAnswer:true,receiptUnchanged:true,readingPosition:restored.position.blockIndex,collisionAtomic:true,malformedNoMutation:true},null,2));}
});
