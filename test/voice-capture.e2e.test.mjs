import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { root } from './validate.mjs';

test('voice toggle owns one recognizer and ignores speech delivered after cancellation', {timeout:60000}, async t => {
  const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','4960','--strictPort'],{cwd:root,stdio:'ignore'});
  t.after(()=>server.kill('SIGTERM'));
  const url='http://127.0.0.1:4960/';
  let ready=false;
  for(let i=0;i<100;i++) {
    try { if((await fetch(url)).ok){ready=true;break;} } catch {}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'preview must start');
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
  t.after(()=>browser.close());
  const page=await browser.newPage();
  await page.setViewport({width:1280,height:900});
  await page.evaluateOnNewDocument(()=>{
    window.captureProbe={instances:[],preflights:0};
    navigator.mediaDevices.getUserMedia=()=>{window.captureProbe.preflights++;return Promise.reject(new Error('unexpected audio preflight'));};
    window.SpeechRecognition=class {
      constructor(){this.starts=0;this.aborts=0;window.captureProbe.instances.push(this);}
      start(){this.starts++;}
      abort(){this.aborts++;this.onend?.();}
      result(text){const result=[{transcript:text}];result.isFinal=true;this.onresult?.({results:[result]});}
    };
  });
  await page.goto(url);
  await page.waitForFunction(()=>window.__jtApp?.booted);
  await page.locator('#welcome-next').click();await page.locator('#welcome-skip').click();
  await page.evaluate(async()=>{
    await window.__jtApp.addDocument('The northern orchard produces crisp apples every autumn.','Voice lifecycle fixture');
    window.__jtApp.showView('read');
  });
  assert.equal(await page.$eval('#voice-toggle',n=>n.hidden),false,'skipping onboarding voice must leave a reachable voice toggle');
  await page.locator('#voice-toggle').click();
  assert.equal(await page.evaluate(()=>window.__jtApp.micState()),'starting');
  // A second click while permission/start is pending must cancel, not start a
  // second owner. Browser callbacks may still arrive after abort.
  await page.locator('#voice-toggle').click();
  await page.evaluate(()=>{const old=window.captureProbe.instances[0];old.onstart?.();old.result('highlight this');old.onend?.();});
  assert.deepEqual(await page.evaluate(()=>({count:window.captureProbe.instances.length,aborts:window.captureProbe.instances[0].aborts,state:window.__jtApp.micState(),acts:window.__jtApp.entries().filter(e=>e.kind==='act').length,preflights:window.captureProbe.preflights})),{count:1,aborts:1,state:'paused',acts:0,preflights:0});
  await page.locator('#voice-toggle').click();
  await page.evaluate(()=>window.captureProbe.instances[1].onstart());
  assert.equal(await page.evaluate(()=>window.__jtApp.micState()),'listening');
  assert.equal(await page.$eval('#voice-toggle',n=>n.textContent),'pause listening');
  await page.evaluate(()=>window.captureProbe.instances[1].result('northern orchard produces crisp apples'));
  await page.waitForSelector('#marker.on');
  await page.locator('#voice-toggle').click();
  await page.evaluate(()=>window.captureProbe.instances[1].result('highlight this'));
  assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act').length),0);
  assert.equal(await page.evaluate(()=>window.__jtApp.micState()),'paused');
  await page.locator('#voice-toggle').click();
  await page.evaluate(()=>{
    window.captureProbe.instances[2].onstart();
    window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
    window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
    window.captureProbe.instances[2].result('highlight this');
  });
  assert.equal(await page.evaluate(()=>window.__jtApp.micState()),'paused','page lifecycle recovery must not claim a disposed microphone is listening');
  assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act').length),0);
});
