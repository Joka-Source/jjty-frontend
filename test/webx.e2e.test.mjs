import test from 'node:test';
import assert from 'node:assert/strict';
import {preview} from 'vite';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';

test('WebX keeps app state, pauses capture and recovers offline without replacing reader storage',{timeout:90000},async t=>{
 const server=await preview({root,preview:{host:'127.0.0.1',port:0}});const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});t.after(async()=>{const timer=setTimeout(()=>browser.process()?.kill('SIGKILL'),3000);try{await browser.close();}finally{clearTimeout(timer);server.httpServer.closeAllConnections();await new Promise(r=>server.httpServer.close(r));}});
 const page=await browser.newPage(),base=`http://127.0.0.1:${server.httpServer.address().port}`;const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>document.querySelector('iframe[data-tool="documents"]')?.contentDocument?.body.innerText.includes('Your work'));
 const switchTo=async id=>{await page.click(`[data-tool="${id}"]:not(iframe)`);await page.waitForFunction(id=>document.querySelector(`iframe[data-tool="${id}"]`)&&!document.querySelector('#loading').hidden===false,{},id);};
 await switchTo('reader');await page.waitForFunction(()=>document.querySelector('iframe[data-tool="reader"]').contentWindow.__jtApp?.booted);
 const id=await page.evaluate(async()=>{const win=document.querySelector('iframe[data-tool="reader"]').contentWindow;await win.__jtApp.addDocument('Synthetic source preserved across workspace apps.','Convergence proof');win.__pauseCount=0;win.addEventListener('webx:pause',()=>win.__pauseCount++);return win.__jtApp.currentDoc().id;});
 await switchTo('notebooks');await page.waitForFunction(()=>document.querySelector('iframe[data-tool="notebooks"]').contentDocument.body.innerText.includes('New notebook'));assert.equal(await page.evaluate(()=>document.querySelector('iframe[data-tool="reader"]').contentWindow.__pauseCount),1);
 await switchTo('reader');assert.equal(await page.evaluate(()=>document.querySelector('iframe[data-tool="reader"]').contentWindow.__jtApp.currentDoc().id),id);
 await switchTo('tenders');await page.waitForFunction(()=>document.querySelector('iframe[data-tool="tenders"]').contentDocument.body.innerText.includes('Kothali'));await page.setViewport({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.$$eval('[data-tool]:not(iframe)',els=>els.every(e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.width>=44;})),true);
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.setOfflineMode(true);await page.reload();await page.waitForFunction(()=>document.querySelector('iframe[data-tool="tenders"]')?.contentDocument.body.innerText.includes('Kothali'));await page.setOfflineMode(false);
 await page.goto(base+'/reader/');await page.waitForFunction(()=>window.__jtApp?.booted);assert.ok(await page.evaluate(id=>window.__jtApp.exportData().then(data=>JSON.stringify(data).includes(id)),id));assert.deepEqual(errors,[]);
 await page.goto(base+'/webx/');await page.waitForSelector('[aria-label="Workspace apps"]');assert.match(await page.title(),/WebX/);
});
