import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';

test('short distinctive spoken jumps move the cursor before an explicit act, in both engines', {timeout:60000}, async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','4992','--strictPort'],{cwd:root,stdio:'ignore'});
 t.after(()=>server.kill('SIGTERM'));
 const url='http://127.0.0.1:4992/';let ready=false;
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));}
 assert.ok(ready);
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
 t.after(()=>browser.close());
 for(const kind of ['js','wasm']){
  const page=await browser.newPage();
  await page.evaluateOnNewDocument(()=>{localStorage.setItem('jt.welcomed','1');localStorage.setItem('jt.mic','off');});
  await page.goto(url+'?engine='+kind);await page.waitForFunction(()=>window.__jtApp?.booted);
  await page.evaluate(async()=>{
   await window.__jtApp.addDocument('The deposit is one months rent held in a protected account.\n\nThe tenant reports leaks faults and failures promptly.','Jump fixture');
   window.__jtApp.showView('read');
   window.__jtApp.follow('The deposit is one months rent');
  });
  assert.equal(await page.evaluate(()=>window.__jtApp.engineKind()),kind);
  assert.equal(await page.evaluate(()=>window.__jtApp.currentBlock()),0);
  await page.evaluate(()=>window.__jtApp.follow('The deposit is one months rent and failures and failures','and failures and failures'));
  assert.equal(await page.evaluate(()=>window.__jtApp.currentBlock()),1,kind+' follows a distinctive word instead of stale context');
  assert.equal(await page.$eval('#marker',n=>n.classList.contains('on')),true);
  assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act').length),0,'pointing must not mutate the document');
  await page.evaluate(()=>window.__jtApp.voiceSegment('highlight this'));
  await page.waitForFunction(()=>window.__jtApp.entries().some(e=>e.kind==='act'));
  const act=await page.evaluate(()=>window.__jtApp.entries().find(e=>e.kind==='act'));
  assert.equal(act.act,'highlight');
  assert.equal(act.anchor?.quotedText,'and failures');
  await page.reload();await page.waitForFunction(()=>window.__jtApp?.booted);
  assert.equal(await page.evaluate(id=>window.__jtApp.entries().filter(e=>e.kind==='act'&&e.id===id).length,act.id),1);
  await page.evaluate(async()=>{
   await window.__jtApp.addDocument('The deposit is held in a protected account.\n\nThe roof needs repairs before winter.','Rejected speech');
   window.__jtApp.follow('The deposit is held in a protected account');
   await window.__jtApp.voiceSegment('The deposit is held in a protected account');
   window.__jtApp.follow('volcanoes orbit galaxies purple elephants juggle quantum spaghetti');
   await window.__jtApp.voiceSegment('volcanoes orbit galaxies purple elephants juggle quantum spaghetti');
   await window.__jtApp.voiceSegment('highlight this');
  });
  assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act').length),0,'unmatched reading cannot authorize an old highlight');
  await page.evaluate(()=>window.__jtApp.showView('read'));
  await page.click('#doc .reading-block:last-child');
  await page.evaluate(()=>window.__jtApp.voiceSegment('highlight this'));
  assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act').length),1,'explicit pointer selection restores voice targeting');
  await page.evaluate(async()=>{
   window.__jtApp.follow('volcanoes orbit galaxies purple elephants juggle quantum spaghetti');
   await window.__jtApp.voiceSegment('volcanoes orbit galaxies purple elephants juggle quantum spaghetti');
   const rejected = window.__jtApp.voiceSegment('highlight this');
   document.querySelectorAll('#doc .reading-block')[1].click();
   await rejected;
  });
  assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act').length),1,'a later click cannot authorize an already rejected command');
  await page.evaluate(async()=>{
   window.__jtApp.follow('The roof needs repairs before winter');
   const accepted = window.__jtApp.voiceSegment('highlight this');
   window.__jtApp.follow('volcanoes orbit galaxies purple elephants juggle quantum spaghetti');
   const reading=window.__jtApp.voiceSegment('volcanoes orbit galaxies purple elephants juggle quantum spaghetti');
   await Promise.all([accepted,reading]);
  });
  assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act').length),2,'later unmatched speech cannot revoke a previously resolved command');
  await page.evaluate(async()=>{
   document.querySelectorAll('#doc .reading-block')[1].click();
   window.__jtApp.follow('mark');
   window.__jtApp.follow('mark this');
   window.__jtApp.follow('mark this important');
   await window.__jtApp.voiceSegment('mark this important');
  });
  assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act'&&e.act==='important').length),1,'partial command prefixes preserve pointer authority');
  assert.equal(await page.$eval('#marker',n=>n.classList.contains('on')),true,'recognized command restores its valid guide');
  const beforeCourtesy=await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act').length);
  await page.evaluate(async()=>{
   document.querySelectorAll('#doc .reading-block')[1].click();
   window.__jtApp.follow('please');
   window.__jtApp.follow('please highlight this');
   await window.__jtApp.voiceSegment('please highlight this');
  });
  assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act').length),beforeCourtesy+1,'polite command preserves deliberate selection');
  await page.close();
 }
});
