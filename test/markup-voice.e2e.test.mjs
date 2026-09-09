import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';

// Transcript injection verifies the actual app dispatch; it is not microphone evidence.
test('simulated markup speech preserves actual acts and colors in JS and WASM readers',{timeout:120000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5091','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill());
 const url='http://127.0.0.1:5091/';let ready=false;
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());
 for(const kind of ['js','wasm']){
  const context=await browser.createBrowserContext();const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.evaluateOnNewDocument(()=>{localStorage.setItem('jt.welcomed','1');localStorage.setItem('jt.mic','off');if(!localStorage.getItem('jt.markupColor'))localStorage.setItem('jt.markupColor','blue');});
  await page.goto(url+'?engine='+kind);await page.waitForFunction(()=>window.__jtApp?.booted);
  await(await page.$('#home-file-input')).uploadFile(path.join(root,'test/fixtures/jett-annotations.pdf'));
  await page.waitForFunction(()=>document.body.dataset.view==='read'&&document.getElementById('reader-page-total').textContent==='of 3');
  assert.equal(await page.evaluate(()=>window.__jtApp.engineKind()),kind);
  await page.click('[data-workspace="annotate"]');
  const readAndSay=async(text,command)=>page.evaluate(async({text,command})=>{window.__jtApp.follow(text);await window.__jtApp.voiceSegment(text);await window.__jtApp.voiceSegment(command);},{text,command});
  const quote='The northern orchard produces crisp apples every autumn.';
  await readAndSay(quote,'underline this');
  await page.waitForFunction(()=>window.__jtApp.entries().some(entry=>entry.act==='underline'));
  await page.select('#annotation-color','red');
  await readAndSay(quote,'strike through that');
  const records=await page.evaluate(()=>window.__jtApp.entries().filter(entry=>entry.kind==='act'));
  assert.deepEqual(records.map(entry=>[entry.act,entry.markupColor]),[['underline','blue'],['strikethrough','red']],kind);
  for(const entry of records){assert.equal(entry.arrival,'exact');assert.equal(entry.anchor.quotedText,quote.replace(/\.$/,''));assert.ok(entry.cursor&&entry.receipt);assert.equal(entry.modality,'voice');}
  for(const command of ['underline from this to that','underline this range','strike through this range'])await readAndSay(quote,command);
  assert.deepEqual(await page.evaluate(()=>window.__jtApp.entries().filter(entry=>entry.kind==='act').map(entry=>entry.id)),records.map(entry=>entry.id),'unsupported speech never creates a different act');
  await page.reload();await page.waitForFunction(()=>window.__jtApp?.booted);
  assert.deepEqual(await page.evaluate(()=>window.__jtApp.entries().filter(entry=>entry.kind==='act').map(({id,act,markupColor})=>({id,act,markupColor}))),records.map(({id,act,markupColor})=>({id,act,markupColor})),kind+' durable reload');
  for(const act of ['underline','strikethrough'])assert.ok(await page.$(`#doc [data-markup="${act}"]`),kind+' repaints '+act);
  assert.deepEqual(errors,[]);await context.close();
 }
});
