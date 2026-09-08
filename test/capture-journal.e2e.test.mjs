import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';

test('capture-only failure and retried command have honest correlated journal records in the app',{timeout:90000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4986','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill('SIGTERM'));
 const url='http://127.0.0.1:4986/';for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===99)throw Error('Vite unavailable');await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());const page=await browser.newPage();
 await page.evaluateOnNewDocument(()=>{
  localStorage.setItem('jt.welcomed','1');localStorage.setItem('jt.mic','off');
  window.__recognizers=[];window.__microphoneRequests=0;
  navigator.mediaDevices.getUserMedia=async()=>{window.__microphoneRequests++;throw Error('physical capture forbidden by test');};
  const schedule=window.setTimeout;window.setTimeout=function(fn,delay,...args){if(delay===20000){window.__noWordsDeadline=fn;return schedule(()=>{},delay);}return schedule(fn,delay,...args);};
  window.SpeechRecognition=class{
   constructor(){window.__recognizers.push(this);}
   start(){queueMicrotask(()=>this.onstart?.());}
   abort(){this.onend?.();}
  };
 });
 await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);await page.click('#home-sample');await page.waitForFunction(()=>document.body.dataset.view==='read');
 await page.evaluate(()=>window.__jtApp.commandJournal.clear());await page.click('#voice-toggle');await page.waitForFunction(()=>window.__jtApp.micState()==='listening');
 await page.evaluate(()=>{window.__recognizers[0].onspeechstart();window.__noWordsDeadline();});
 await page.waitForFunction(()=>window.__jtApp.micState()==='error');
 let rows=await page.evaluate(()=>window.__jtApp.commandJournal.list());assert.equal(rows.length,1);
 assert.ok(rows[0].events.every(e=>e.stage==='capture'),'no fabricated heard event');
 assert.ok(rows[0].events.some(e=>e.reason==='recognition-no-results'&&e.status==='failed'));
 const failedId=rows[0].id;await page.click('#voice-toggle');await page.waitForFunction(()=>window.__jtApp.micState()==='listening');
 await page.evaluate(()=>window.__recognizers[1].onresult({results:[{0:{transcript:'Highlight a late charge'},isFinal:true}]}));
 await page.waitForFunction(()=>window.__jtApp.entries().some(e=>e.anchor?.quotedText==='a late charge'));
 rows=await page.evaluate(()=>window.__jtApp.commandJournal.list());const capture=rows.find(row=>row.id!==failedId&&row.events.every(e=>e.stage==='capture')),command=rows.find(row=>row.events.some(e=>e.stage==='heard'));
 assert.ok(capture);assert.equal(command.captureId,capture.id);assert.ok(command.events.some(e=>e.status==='saved'));assert.ok(!capture.events.some(e=>e.status==='saved'));
 await page.click('#voice-toggle');assert.equal(await page.evaluate(()=>window.__jtApp.micState()),'paused');
 const before=await page.evaluate(()=>window.__jtApp.commandJournal.list());
 await page.evaluate(()=>{window.__recognizers[0].onresult({results:[{0:{transcript:'undo'},isFinal:true}]});window.__recognizers[1].onstart();});
 assert.deepEqual(await page.evaluate(()=>window.__jtApp.commandJournal.list()),before,'old capture callbacks cannot add commands or reopen sessions');
 assert.equal(await page.evaluate(()=>window.__microphoneRequests),0);
 const exported=await page.evaluate(()=>window.__jtApp.commandJournal.export());assert.ok(exported.some(e=>e.properties.capture_id===capture.id));assert.ok(!JSON.stringify(exported).includes('Highlight a late charge'));
});
