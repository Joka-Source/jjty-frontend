import {openReaderMenu,selectWorkspace,clickReaderControl} from './reader-navigation.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {root} from './validate.mjs';

test('filled copy can include committed marks with saved answers and preserve the original', {timeout:90000},async t=>{
 const directory=process.env.JETT_COMBINED_PROOF_DIR?path.resolve(process.env.JETT_COMBINED_PROOF_DIR):await mkdtemp(path.join(tmpdir(),'jett-combined-'));
 await mkdir(directory,{recursive:true});if(!process.env.JETT_COMBINED_PROOF_DIR)t.after(()=>rm(directory,{recursive:true,force:true}));
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4968','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill('SIGTERM'));
 const url='http://127.0.0.1:4968/';let ready=false;
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});t.after(()=>browser.close());
 const page=await browser.newPage();await page.setViewport({width:1280,height:900});const cdp=await page.createCDPSession();
 await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);await clickReaderControl(page,'#welcome-next');await clickReaderControl(page,'#welcome-skip');
 const fixture=path.join(root,'test/fixtures/jett-fillable.pdf'),original=await readFile(fixture);
 await (await page.$('#home-file-input')).uploadFile(fixture);await page.waitForSelector('#pdf-form-panel:not([hidden])');
 await selectWorkspace(page,'fill');await openReaderMenu(page,'pdf-form-panel');
 const values={full_name:'Taylor Example',reference:'JETT-042',category:'Research',delivery:'Post',consent:true,notes:'Send the draft by email.\nKeep the original for reference.'};
 for(const [name,value] of Object.entries(values))await page.$eval(`[data-field-name="${name}"]`,(n,value)=>{if(n.type==='checkbox')n.checked=value;else n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));},value);
 await page.waitForFunction(()=>!document.getElementById('pdf-form-preview').disabled);
 const proof=await page.evaluate(async()=>{
  const {tokenizeWithSpans}=await import('/src/match.js');const doc=window.__jtApp.currentDoc(),blockIndex=doc.blocks.findIndex(b=>b.text.includes('Contact and delivery'));
  const tokens=tokenizeWithSpans(doc.blocks[blockIndex].text),start=tokens.findIndex(t=>t.text==='Contact');
  if(start<0)throw new Error('Instruction target missing');
  await window.__jtApp.perform('highlight',blockIndex,{tokenStart:start,tokenEnd:start+2});
  await window.__jtApp.perform('annotate',blockIndex,{tokenStart:start,tokenEnd:start+2,noteText:'Review delivery before sending.\nSynthetic note only.'});
  return {id:doc.id,entries:window.__jtApp.entries().filter(e=>e.kind==='act'&&!e.undone)};
 });
 await page.reload();await page.waitForFunction(()=>window.__jtApp?.booted);
 await page.evaluate(async id=>{const {getDoc}=await import('/src/db.js');await window.__jtApp.openDocument(await getDoc(id));window.__jtApp.showView('read');},proof.id);
 await selectWorkspace(page,'fill');await openReaderMenu(page,'pdf-form-panel');
 assert.equal(await page.$eval('[data-field-name="full_name"]',n=>n.value),values.full_name);
 assert.equal(await page.$eval('#pdf-form-include-marks',n=>n.checked),false,'marks inclusion requires an explicit choice');
 const download=async(label,preview=true)=>{
  const folder=path.join(directory,label);await mkdir(folder,{recursive:true});await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:folder});
  if(preview){await clickReaderControl(page,'#pdf-form-preview');try { await page.waitForFunction(()=>document.getElementById('pdf-review-dialog').open&&!document.getElementById('pdf-review-download').disabled); }
  catch(error) { const state=await page.evaluate(()=>({view:document.body.dataset.view,dialog:document.getElementById('pdf-review-dialog').open,review:document.getElementById('pdf-review-dialog').textContent,form:document.getElementById('pdf-form-panel').textContent,previewDisabled:document.getElementById('pdf-form-preview').disabled,status:document.getElementById('status-text').textContent}));throw new Error(`${label} review did not become ready: ${JSON.stringify(state)}`,{cause:error}); }if(label==='combined')assert.equal(await page.$eval('#pdf-review-title',n=>n.textContent),'Review filled and annotated copy');await clickReaderControl(page,'#pdf-review-download');}
  else await clickReaderControl(page,'#pdf-form-download');
  let filename;for(let i=0;i<100;i++){filename=(await readdir(folder)).find(n=>n.endsWith('.pdf'));if(filename)break;await new Promise(r=>setTimeout(r,100));}assert.ok(filename);
  if(preview)await page.keyboard.press('Escape');return path.join(folder,filename);
 };
 const inspect=async(file,expectedMarks)=>{
  const task=getDocument({data:new Uint8Array(await readFile(file))});
  try{const pdf=await task.promise,fields=await pdf.getFieldObjects();
   for(const [name,value] of Object.entries(values)){
    const widgets=fields[name].filter(f=>f.value!==undefined);assert.ok(widgets.length,`readable ${name}`);
    for(const widget of widgets){if(name==='consent')assert.notEqual(widget.value,'Off');else assert.equal(widget.value,value,`saved ${name}`);}
   }
   const annotations=[];for(let p=1;p<=pdf.numPages;p++)annotations.push(...(await (await pdf.getPage(p)).getAnnotations()).filter(a=>['Highlight','Text'].includes(a.subtype)));
   assert.equal(annotations.length,expectedMarks);
   if(expectedMarks){assert.equal(annotations.find(a=>a.subtype==='Text').contentsObj.str,'Review delivery before sending.\nSynthetic note only.');assert.equal(annotations.find(a=>a.subtype==='Highlight').contentsObj.str,'Contact and delivery');}
  }finally{await task.destroy();}
 };
 const formOnly=await download('form-only');await inspect(formOnly,0);
 await clickReaderControl(page,'#pdf-form-include-marks');
 const combined=await download('combined');await inspect(combined,2);
 const direct=await download('combined-direct',false);await inspect(direct,2);
 await page.evaluate(async()=>{await window.__jtApp.perform('undo',undefined,{});await window.__jtApp.perform('undo',undefined,{});});
 const undone=await download('undone');await inspect(undone,0);
 assert.deepEqual(await page.evaluate(()=>Object.values(window.__jtApp.currentDoc().sourceBytes)),[...original]);assert.deepEqual(await readFile(fixture),original);
 await writeFile(path.join(directory,'result.json'),JSON.stringify({result:'PASS',formOnly,combined,direct,undone,values,expectedAnnotations:proof.entries.map(e=>({page:1,nm:'jett:'+e.id,subtype:e.act==='note'?'/Text':'/Highlight',contents:e.act==='note'?e.noteText:e.anchor.quotedText}))},null,2));
});
