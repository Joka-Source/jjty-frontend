import {prepareStudioControl} from './helpers/studio-controls.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';

test('real PDF margin note opens in the notebook and returns to the exact source page',{timeout:120000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5195','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill());
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5195')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(async()=>{const timer=setTimeout(()=>browser.process()?.kill('SIGKILL'),3000);try{await browser.close();}finally{clearTimeout(timer);}});
 const page=await browser.newPage();await page.setViewport({width:390,height:844});
 const errors=[];page.on('dialog',async dialog=>{t.diagnostic('Unexpected dialog: '+dialog.message());await dialog.dismiss();});page.on('pageerror',e=>errors.push(e.message));
 const click=async selector=>{await prepareStudioControl(page,selector);t.diagnostic('Click '+selector);await page.waitForSelector(selector,{visible:true});await page.$eval(selector,e=>e.scrollIntoView({block:'center',behavior:'instant'}));await page.locator(selector).click();};
 await page.goto('http://127.0.0.1:5195/studio/index.html#files');await page.waitForFunction(()=>document.querySelector('#real-status')?.textContent==='Your PDF will be stored in this browser.');
 await click('[data-doc-action="sample"]');await page.waitForFunction(()=>document.querySelector('#real-status')?.textContent.startsWith('Opened from'));
 const source=await page.evaluate(async()=>{const {getDocs}=await import('/src/db.js');const d=(await getDocs())[0];return{id:d.id,bytes:Array.from(d.sourceBytes)};});
 await click('[data-doc-action="next"]');await page.waitForFunction(()=>document.querySelector('#real-page-num')?.textContent==='Page 2 of 3');
 await click('[data-doc-action="focus-note"]');assert.equal(await page.$eval('#source-note-input',e=>document.activeElement===e),true);
 await page.locator('#source-note-input').fill('Return to the orchard gate with the revised plan.');
 await page.evaluate(()=>{const descriptor=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete');Object.defineProperty(IDBTransaction.prototype,'oncomplete',{...descriptor,set(handler){descriptor.set.call(this,function(event){if(this.db.name==='jett-notebooks'&&this.mode==='readwrite'&&!window.heldNoteSave){window.heldNoteSave=true;Object.defineProperty(IDBTransaction.prototype,'oncomplete',descriptor);window.releaseNoteSave=()=>handler.call(this,event);}else handler.call(this,event);});}});});
 await click('#source-note-form [type="submit"]');
 await page.waitForFunction(()=>window.heldNoteSave===true);
 await page.goto('http://127.0.0.1:5195/studio/index.html#files');await page.waitForSelector('#real-file-list');await page.goto('http://127.0.0.1:5195/studio/index.html#editor/'+source.id+'/2');await page.waitForSelector('#source-note-input');assert.equal(await page.$eval('#source-note-input',e=>e.disabled),true);assert.equal(await page.$eval('#source-note-input',e=>e.value),'Return to the orchard gate with the revised plan.');
 await click('[data-doc-action="next"]');await page.evaluate(()=>window.releaseNoteSave());await page.waitForFunction(()=>document.querySelector('#source-note-status')?.textContent.startsWith('Note saved')&&!document.querySelector('#source-note-input').disabled);
 await click('[data-doc-action="focus-note"]');await click('[data-note-page="1"]');await page.waitForFunction(()=>document.querySelector('#real-page-num')?.textContent==='Page 2 of 3');
 assert.match(await page.$eval('#source-note-status',e=>e.textContent),/Note saved/);
 assert.match(await page.$eval('.real-source-note',e=>e.textContent),/Page 2/);
 await click('#source-notebook-open');await page.waitForSelector('#notebook-source-return a');
 assert.match(await page.$eval('#notebook-source-return a',e=>e.textContent),/page 1/);
 // The full notebook opens at its own saved position; the physical source-page note is on notebook page 2.
 await click('[data-page="1"]');await page.waitForFunction(()=>document.querySelector('#notebook-source-return a')?.textContent.includes('page 2'));
 assert.match(await page.$eval('#ink',e=>e.textContent),/Return to the orchard gate/);await click('#read-linked-notes');await page.locator('[data-linked-note] textarea').fill('Edited in the full notebook.');await click('[data-linked-note] [type="submit"]');await page.waitForFunction(()=>document.querySelector('.footer span:last-child')?.textContent==='Saved on this browser');
 await click('#notebook-source-return a');await page.waitForFunction(()=>document.querySelector('#real-page-num')?.textContent==='Page 2 of 3');
 await page.waitForSelector('.real-source-note');assert.equal(await page.$eval('.real-source-note p',e=>e.textContent),'Edited in the full notebook.');
 await click('[data-doc-action="focus-note"]');await click('[data-note-edit]');await page.locator('#source-note-input').fill('The revision is ready for review.');await click('#source-note-form [type="submit"]');await page.waitForFunction(()=>document.querySelector('#source-note-status')?.textContent.startsWith('Note saved'));
 await page.reload();await page.waitForSelector('.real-source-note');assert.equal(await page.$eval('.real-source-note p',e=>e.textContent),'The revision is ready for review.');
 assert.deepEqual(await page.evaluate(async id=>Array.from((await (await import('/src/db.js')).getDoc(id)).sourceBytes),source.id),source.bytes);
 await click('[data-doc-action="export-panel"]');await page.evaluate(()=>{window.bridgeCalls=0;window.JettyPdfExport={save(){window.bridgeCalls++;}};});await click('[data-doc-action="download-current"]');await click('[data-doc-action="download-current"]');assert.equal(await page.evaluate(()=>window.bridgeCalls),1);assert.match(await page.$eval('#real-status',e=>e.textContent),/Finish the current PDF export/);assert.match(await page.$eval('.real-activity-capsule',e=>e.textContent),/Preparing PDF export/);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jetty-native-export',{detail:{status:'cancelled',message:'Cancelled in the test adapter.'}})));assert.match(await page.$eval('.real-activity-capsule',e=>e.textContent),/Export cancelled/);await click('[data-doc-action="download-current"]');assert.equal(await page.evaluate(()=>window.bridgeCalls),2);await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jetty-native-export',{detail:{status:'saved',message:'Saved in the test adapter.'}})));assert.match(await page.$eval('.real-activity-capsule',e=>e.textContent),/PDF exported/);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
});
