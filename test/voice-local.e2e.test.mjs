import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { root } from './validate.mjs';

test('local voice requires an explicit language download and never falls back to remote recognition', {timeout:60000}, async t=>{
  const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','4961','--strictPort'],{cwd:root,stdio:'ignore'});
  t.after(()=>server.kill('SIGTERM'));
  const url='http://127.0.0.1:4961/';
  let ready=false;
  for(let i=0;i<100;i++){
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'preview must start');
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
  t.after(()=>browser.close());
  const page=await browser.newPage();await page.setViewport({width:1280,height:900});
  await page.evaluateOnNewDocument(()=>{
    window.localVoiceProbe={starts:[],aborts:0,checks:[],installs:[],preflights:0};
    navigator.mediaDevices.getUserMedia=()=>{window.localVoiceProbe.preflights++;throw new Error('Unexpected audio preflight');};
    class Recognition {
      static async available(options){
        window.localVoiceProbe.checks.push(options);
        if(window.localVoiceProbe.deferCheck){window.localVoiceProbe.deferCheck=false;await new Promise(resolve=>window.localVoiceProbe.releaseCheck=resolve);}
        return sessionStorage.getItem('test-language-installed')?'available':'downloadable';
      }
      static async install(options){window.localVoiceProbe.installs.push(options);sessionStorage.setItem('test-language-installed','yes');return true;}
      start(){window.localVoiceProbe.starts.push({local:this.processLocally,lang:this.lang});this.onstart?.();}
      abort(){window.localVoiceProbe.aborts++;this.onend?.();}
    }
    Recognition.prototype.processLocally=false;
    window.SpeechRecognition=Recognition;
  });
  await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);
  await page.locator('#welcome-next').click();await page.locator('#welcome-skip').click();
  await page.locator('#voice-toggle').click();
  await page.waitForFunction(()=>window.__jtApp.micState()==='listening');
  await page.evaluate(()=>window.__jtApp.showView('settings'));
  await page.select('#set-voice-processing','local');
  assert.equal(await page.evaluate(()=>window.__jtApp.micState()),'paused','changing processing must close the previous capture');
  assert.equal(await page.evaluate(()=>window.localVoiceProbe.aborts),1);
  await page.evaluate(()=>window.localVoiceProbe.deferCheck=true);
  await page.locator('#set-local-voice-check').click();
  await page.waitForFunction(()=>!!window.localVoiceProbe.releaseCheck);
  await page.select('#set-voice-processing','browser');
  await page.evaluate(async()=>{window.localVoiceProbe.releaseCheck();await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(await page.$eval('#set-local-voice-status',n=>n.textContent),'','a stale check must not overwrite the changed processing choice');
  assert.equal(await page.$eval('#set-local-voice-install',n=>n.hidden),true);
  await page.select('#set-voice-processing','local');
  await page.locator('#set-local-voice-check').click();
  await page.waitForFunction(()=>window.localVoiceProbe.checks.length>0);
  assert.equal(await page.evaluate(()=>window.localVoiceProbe.installs.length),0,'checking must never download');
  await page.locator('#voice-toggle').click();
  await page.waitForFunction(()=>window.__jtApp.micState()==='local-unavailable');
  assert.equal(await page.evaluate(()=>window.localVoiceProbe.starts.length),1,'missing local pack must not start a recognizer');
  await page.locator('#set-local-voice-install').click();
  await page.waitForFunction(()=>window.localVoiceProbe.installs.length===1);
  await page.waitForFunction(()=>!document.getElementById('set-local-voice-check').disabled);
  await page.locator('#voice-toggle').click();
  await page.waitForFunction(()=>window.__jtApp.micState()==='listening');
  assert.deepEqual(await page.evaluate(()=>window.localVoiceProbe.starts.map(s=>s.local)),[false,true]);
  assert.ok(await page.evaluate(()=>window.localVoiceProbe.checks.every(check=>check.processLocally===true)));
  assert.equal(await page.evaluate(()=>window.localVoiceProbe.preflights),0);
  await page.locator('#voice-toggle').click();
  await page.reload();await page.waitForFunction(()=>window.__jtApp?.booted);
  await page.evaluate(()=>window.__jtApp.showView('settings'));
  assert.equal(await page.$eval('#set-voice-processing',n=>n.value),'local','processing preference must survive reload');
  assert.equal(await page.evaluate(()=>window.localVoiceProbe.installs.length),0,'reload must not install again');
  await page.locator('#voice-toggle').click();await page.waitForFunction(()=>window.__jtApp.micState()==='listening');
  assert.deepEqual(await page.evaluate(()=>window.localVoiceProbe.starts.map(s=>s.local)),[true]);
});
