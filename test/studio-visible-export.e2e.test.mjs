import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, readFile, readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import * as mupdf from 'mupdf';
import {root} from './validate.mjs';

test('Download PDF includes visible marks, keeps the original and supports native cancellation', {timeout:120000}, async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5206','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill());
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5206')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 t.after(async()=>{const timer=setTimeout(()=>browser.process()?.kill('SIGKILL'),3000);try{await browser.close();}finally{clearTimeout(timer);}});
 const page=await browser.newPage();await page.setViewport({width:390,height:844});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const downloadPath=await mkdtemp(path.join(os.tmpdir(),'jetty-visible-export-'));
 const client=await page.createCDPSession();await client.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath});
 const click=async s=>{await page.waitForSelector(s,{visible:true});await page.$eval(s,e=>e.scrollIntoView({block:'center',behavior:'instant'}));await page.locator(s).click();};
 await page.goto('http://127.0.0.1:5206/studio/index.html#files');await page.waitForFunction(()=>document.querySelector('#real-status')?.textContent==='Your PDF will be stored in this browser.');
 await click('[data-doc-action="sample"]');await page.waitForFunction(()=>document.querySelector('#real-status')?.textContent.startsWith('Opened from')).catch(async e=>{throw new Error(e.message+' '+await page.$eval('main',e=>e.textContent)+' '+errors.join(','));});
 const original=await page.evaluate(async()=>{const {getDocs}=await import('/src/db.js');const d=(await getDocs())[0];return{id:d.id,bytes:Array.from(d.sourceBytes)};});
 await click('[data-doc-action="write-panel"]');await click('[data-doc-action="focus-text"]');await page.locator('#real-text').fill('Ready to send');await click('#real-text-form [type="submit"]');await page.waitForFunction(()=>document.querySelector('#real-ink text')?.textContent==='Ready to send');
 await click('[data-doc-action="next"]');await page.waitForFunction(()=>document.querySelector('#real-page-input')?.value==='2');
 await click('[data-doc-action="write-panel"]');await click('[data-doc-action="ink"]');
 const point=await page.$eval('#real-ink',e=>{const r=e.getBoundingClientRect();return{x:r.x+45,y:r.y+80};});
 await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+60,point.y+25,{steps:8});await page.mouse.up();await page.waitForFunction(()=>document.querySelector('#real-save-state')?.textContent==='Saved on this device'&&document.querySelector('#real-ink polyline'));
 await click('[data-doc-action="export-panel"]');await mkdir('/tmp/jetty-rsi-export',{recursive:true});await page.screenshot({path:'/tmp/jetty-rsi-export/phone-export.png'});
 await click('[data-doc-action="download-current"]');
 let files=[];for(let i=0;i<150;i++){files=(await readdir(downloadPath)).filter(n=>n.endsWith('.pdf'));if(files.length)break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(files.length,1,'one PDF download should complete');
 const bytes=await readFile(path.join(downloadPath,files[0]));
 function inspect(bytes){const doc=mupdf.Document.openDocument(bytes,'application/pdf');try{return Array.from({length:doc.countPages()},(_,i)=>{const p=doc.loadPage(i);try{const annotations=p.getAnnotations();try{return annotations.map(a=>({type:a.getType(),text:a.getContents()}));}finally{annotations.forEach(a=>a.destroy());}}finally{p.destroy();}});}finally{doc.destroy();}}
 const annotations=inspect(bytes);assert.equal(annotations.length,3);assert.ok(annotations[0].some(a=>a.type==='FreeText'&&a.text==='Ready to send'),'download must contain the visible text');assert.ok(annotations[1].some(a=>a.type==='Ink'),'download must include ink on another page');
 assert.match(await page.$eval('#real-export-feedback',e=>e.textContent),/marks included/i);
 assert.deepEqual(await page.evaluate(async id=>Array.from((await (await import('/src/db.js')).getDoc(id)).sourceBytes),original.id),original.bytes);
 await page.evaluate(()=>{window.exports=[];window.JettyPdfExport={save(base64,name){window.exports.push({base64,name});}};});
 await click('[data-doc-action="download-current"]');await page.waitForFunction(()=>window.exports.length===1);
 const native=await page.evaluate(()=>window.exports[0]);assert.deepEqual(inspect(Buffer.from(native.base64,'base64')),annotations);
 await click('[data-doc-action="download-current"]');assert.equal(await page.evaluate(()=>window.exports.length),1);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jetty-native-export',{detail:{status:'cancelled',message:'Export cancelled.'}})));
 await click('[data-doc-action="download-original"]');await page.waitForFunction(()=>window.exports.length===2);assert.deepEqual(Array.from(Buffer.from(await page.evaluate(()=>window.exports[1].base64),'base64')),original.bytes);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jetty-native-export',{detail:{status:'saved',message:'Original exported.'}})));
 // A real engine refusal must not fall back to exporting the unmarked original.
 await click('[data-doc-action="write-panel"]');await click('[data-doc-action="focus-text"]');await page.locator('#real-text').fill('Unsupported 🦉');await click('#real-text-form [type="submit"]');await page.waitForFunction(()=>document.querySelector('#real-ink text')?.textContent==='Unsupported 🦉');
 await click('[data-doc-action="export-panel"]');await click('[data-doc-action="download-current"]');await page.waitForFunction(()=>document.querySelector('#real-context-feedback')?.textContent.includes('cannot represent'));
 assert.equal(await page.evaluate(()=>window.exports.length),2,'failed composition must never export old bytes');
 assert.match(await page.$eval('.real-activity-capsule',e=>e.textContent),/Action needs attention/);
 await click('[data-doc-action="close-panel"]');await click('[data-doc-action="undo"]');await page.waitForFunction(()=>!document.querySelector('#real-ink text'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#real-ink polyline'));assert.equal(await page.$eval('#real-mark-count',e=>e.textContent),'1 ink strokes / 1 text annotations / 0 text marks');
 await click('[data-doc-action="export-panel"]');await click('[data-a="theme"]');await page.screenshot({path:'/tmp/jetty-rsi-export/phone-export-dark.png'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
});
