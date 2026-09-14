import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import * as mupdf from 'mupdf';
import {root} from './validate.mjs';
const bytes=Array.from(readFileSync(path.join(root,'test/fixtures/jett-annotations.pdf')));
function inspect(input){const d=new mupdf.PDFDocument(new Uint8Array(input));try{return Array.from({length:d.countPages()},(_,i)=>{const p=d.loadPage(i),s=p.toStructuredText(),o=p.getObject(),r=o.get('Rotate');try{return {text:s.asText(),rotation:r.isNull()?0:r.asNumber()};}finally{r.destroy();o.destroy();s.destroy();p.destroy();}});}finally{d.destroy();}}
test('page tools produce real copies, recover invalid input, and suppress stale callbacks',{timeout:120000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4999','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill());
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4999')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(async()=>{const timer=setTimeout(()=>browser.process()?.kill('SIGKILL'),3000);try{await browser.close();}finally{clearTimeout(timer);}});
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4999/notebooks/design/tokens.json');
 await page.evaluate(async bytes=>{const m=await import('/studio/page-tools.js');document.body.innerHTML=m.pageToolsView();location.hash='#editor/proof/1';window.outputs=[];window.original={id:'proof',title:'Proof.pdf',sourceBytes:bytes,provenance:{pageCount:3}};window.control=m.mountPageTools({host:document.body,source:original,getPage:()=>1,createCopy:async(b,title,operation)=>{if(window.rejectSave)throw new Error('Storage is full');outputs.push({bytes:Array.from(b),title,operation});}});},bytes);
 const act=async(action,count)=>{await page.click(`[data-page-action="${action}"]`);await page.waitForFunction(n=>outputs.length===n&&!control.pending(),{},count);};
 await act('rotate',1);await page.locator('[name="page-order"]').fill('1,1,3');await page.click('[data-page-action="reorder"]');await page.waitForFunction(()=>document.querySelector('[data-page-status]').dataset.state==='error');assert.equal(await page.evaluate(()=>outputs.length),1);
 await page.locator('[name="page-order"]').fill('3,1,2');await act('reorder',2);await page.locator('[name="page-selection"]').fill('2-3');await act('extract',3);
 const files=await page.$('[name="merge-files"]');await files.uploadFile(path.join(root,'test/fixtures/jett-annotations.pdf'));await act('merge',4);
 const results=await page.evaluate(()=>({outputs,original:original.sourceBytes}));assert.deepEqual(results.original,bytes);const original=inspect(bytes);assert.equal(inspect(results.outputs[0].bytes)[1].rotation,90);assert.deepEqual(inspect(results.outputs[1].bytes).map(p=>p.text),[original[2].text,original[0].text,original[1].text]);assert.deepEqual(inspect(results.outputs[2].bytes).map(p=>p.text),original.slice(1).map(p=>p.text));assert.equal(inspect(results.outputs[3].bytes).length,6);
 await page.evaluate(()=>{window.rejectSave=true;});await page.click('[data-page-action="rotate"]');await page.waitForFunction(()=>!control.pending()&&document.querySelector('[data-page-status]').textContent.includes('Storage is full'));assert.equal(await page.evaluate(()=>outputs.length),4);await page.evaluate(()=>{window.rejectSave=false;original.sourceBytes.fill(0);});await act('rotate',5);assert.deepEqual(inspect(await page.evaluate(()=>outputs[4].bytes)).map(p=>p.text),original.map(p=>p.text));
 await page.evaluate(()=>{document.querySelector('[data-page-action="rotate"]').click();location.hash='#editor/other/0';});await new Promise(r=>setTimeout(r,400));assert.equal(await page.evaluate(()=>outputs.length),5);await page.evaluate(()=>control.dispose());
});
