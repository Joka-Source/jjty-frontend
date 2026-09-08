import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';

test('actual app automatically sends command outcomes and feedback, retries across reload and honors opt-out across tabs',{timeout:90000},async t=>{
 const received=[];let available=true;
 const ingest=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:4983');res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  let body='';for await(const chunk of req)body+=chunk;
  received.push({ok:available,payload:JSON.parse(body)});res.writeHead(available?200:503,{'Content-Type':'application/json'});res.end('{"status":1}');
 });await new Promise(resolve=>ingest.listen(0,'127.0.0.1',resolve));t.after(()=>{ingest.closeAllConnections();ingest.close();});
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4983','--strictPort'],{cwd:root,stdio:'ignore',env:{...process.env,VITE_POSTHOG_HOST:`http://127.0.0.1:${ingest.address().port}`,VITE_POSTHOG_PROJECT_TOKEN:'phc_loopback_fixture'}});t.after(()=>server.kill('SIGTERM'));
 const url='http://127.0.0.1:4983/';for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===99)throw Error('Vite unavailable');await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();await page.setViewport({width:1100,height:850});await page.evaluateOnNewDocument(()=>{localStorage.setItem('jt.welcomed','1');localStorage.setItem('jt.mic','off');});
 console.error('analytics step boot');await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);
 await page.evaluate(()=>window.__jtApp.showView('settings'));
 assert.equal(await page.$eval('#product-analytics-enabled',el=>el.checked),true,'enabled without opt-in');
 await page.evaluate(()=>window.__jtApp.showView('home'));await page.click('#home-sample');await page.waitForSelector('#doc p[data-block="0"]');
 console.error('analytics step command');await page.evaluate(()=>window.__jtApp.voiceSegment('highlight a late charge'));
 await page.evaluate(()=>window.__jtApp.productAnalytics.settled());
 await page.waitForFunction(()=>{const s=window.__jtApp.productAnalytics.getState();return s.pending===0&&!s.sending});
 const events=()=>received.filter(r=>r.ok).flatMap(r=>r.payload.batch);
 assert.ok(events().some(e=>e.properties.status==='saved'&&e.properties.actual==='durable-entry'));
 console.error('analytics step feedback');const beforeFeedback=structuredClone(events());
 await page.evaluate(()=>{const j=window.__jtApp.commandJournal;j.feedback(j.list().at(-1).id,{rating:'missed',expectedIntent:'highlight'});});
 await page.evaluate(()=>window.__jtApp.productAnalytics.settled());
 await page.waitForFunction(()=>{const s=window.__jtApp.productAnalytics.getState();return s.pending===0&&!s.sending});
 assert.ok(events().some(e=>e.event==='jett_command_feedback'&&e.properties.feedback_rating==='missed'));
 assert.deepEqual(events().slice(0,beforeFeedback.length),beforeFeedback,'delivered events immutable');
 assert.equal(JSON.stringify(received).includes('late charge'),false,'no recognized or document words sent');
 console.error('analytics step failed request');available=false;
 await page.evaluate(()=>window.__jtApp.voiceSegment('highlight the deposit'));
 await page.waitForFunction(()=>window.__jtApp.productAnalytics.getState().lastError==='http-503');
 const rejected=received.filter(r=>!r.ok).flatMap(r=>r.payload.batch).map(e=>e.uuid);
 console.error('analytics step reload');assert.ok(rejected.length>0);await page.reload();await page.waitForFunction(()=>window.__jtApp?.booted);
 assert.ok(await page.evaluate(()=>window.__jtApp.productAnalytics.getState().pending)>0);
 console.error('analytics step retry');available=true;await page.evaluate(()=>window.__jtApp.productAnalytics.flush());
 await page.waitForFunction(()=>{const s=window.__jtApp.productAnalytics.getState();return s.pending===0&&!s.sending});
 assert.ok(rejected.every(id=>events().some(e=>e.uuid===id)),'same UUID retried after reload');
 console.error('analytics step second tab');const second=await browser.newPage();await second.goto(url);await second.waitForFunction(()=>window.__jtApp?.booted);
 await page.evaluate(()=>window.__jtApp.showView('settings'));console.error('analytics step optout');await page.bringToFront();await page.click('#product-analytics-enabled');
 await page.waitForFunction(()=>window.__jtApp.productAnalytics.getState().enabled===false);
 await second.waitForFunction(()=>window.__jtApp.productAnalytics.getState().enabled===false);
 console.error('analytics step off window');const count=received.length;
 await second.evaluate(async()=>{await window.__jtApp.voiceSegment('highlight this');await window.__jtApp.productAnalytics.flush();});
 assert.equal(received.length,count,'other tab cannot send after opt-out');
 await page.reload();await page.waitForFunction(()=>window.__jtApp?.booted);assert.equal(await page.evaluate(()=>window.__jtApp.productAnalytics.getState().enabled),false);
 console.error('analytics step enable');await page.evaluate(()=>window.__jtApp.productAnalytics.setEnabled(true));await page.evaluate(()=>window.__jtApp.productAnalytics.flush());
 assert.equal(received.length,count,'reenabling does not replay off-window/history');
 assert.equal(await page.evaluate(()=>window.__jtApp.micAudioHeld()),false);
});
