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
    window.localVoiceProbe={starts:[],aborts:0,checks:[],installs:[],acquisitions:0,stops:0,tracks:[],contexts:[],instances:[]};
    navigator.mediaDevices.getUserMedia=async()=>{
      const probe=window.localVoiceProbe;probe.acquisitions++;
      // A generated silent track, never a physical microphone.
      const context=new AudioContext(),stream=context.createMediaStreamDestination().stream;
      probe.contexts.push(context);
      for(const track of stream.getTracks()){
        probe.tracks.push(track);const stop=track.stop.bind(track);
        track.stop=()=>{probe.stops++;stop();void context.close();};
      }
      return stream;
    };
    class Recognition {
      constructor(){window.localVoiceProbe.instances.push(this);}
      static async available(options){
        window.localVoiceProbe.checks.push(options);
        if(window.localVoiceProbe.deferCheck){window.localVoiceProbe.deferCheck=false;await new Promise(resolve=>window.localVoiceProbe.releaseCheck=resolve);}
        return sessionStorage.getItem('test-language-installed')?'available':'downloadable';
      }
      static async install(options){window.localVoiceProbe.installs.push(options);sessionStorage.setItem('test-language-installed','yes');return true;}
      start(track){window.localVoiceProbe.starts.push({local:this.processLocally,lang:this.lang,track});if(!window.localVoiceProbe.holdStart)this.onstart?.();}
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
  assert.equal(await page.evaluate(()=>window.localVoiceProbe.acquisitions),0,'browser mode, checks and missing language packs must not acquire a local stream');
  await page.locator('#set-local-voice-install').click();
  await page.waitForFunction(()=>window.localVoiceProbe.installs.length===1);
  await page.waitForFunction(()=>!document.getElementById('set-local-voice-check').disabled);
  await page.evaluate(()=>window.localVoiceProbe.holdStart=true);
  await page.locator('#voice-toggle').click();
  await page.waitForFunction(()=>window.localVoiceProbe.starts.length===2);
  assert.equal(await page.evaluate(()=>window.__jtApp.micState()),'starting');
  assert.equal(await page.evaluate(()=>window.localVoiceProbe.tracks[0].readyState),'live');
  assert.equal(await page.evaluate(()=>window.__jtApp.micAudioHeld()),true);
  assert.match(await page.$eval('#status-text',n=>n.textContent),/microphone is on.*starting recognition/i);
  assert.match(await page.$eval('#set-voice-state',n=>n.textContent),/microphone is on.*starting recognition/i);
  await page.evaluate(()=>{window.localVoiceProbe.holdStart=false;window.localVoiceProbe.instances.at(-1).onstart();});
  await page.waitForFunction(()=>window.__jtApp.micState()==='listening');
  assert.deepEqual(await page.evaluate(()=>window.localVoiceProbe.starts.map(s=>s.local)),[false,true]);
  assert.ok(await page.evaluate(()=>window.localVoiceProbe.checks.every(check=>check.processLocally===true)));
  assert.equal(await page.evaluate(()=>window.localVoiceProbe.acquisitions),1);
  assert.equal(await page.evaluate(()=>window.localVoiceProbe.starts[1].track===window.localVoiceProbe.tracks[0]),true,'local recognition must receive the owned track');
  const interrupted=await page.evaluate(()=>{
    window.localVoiceProbe.instances.at(-1).onend();
    return {state:window.__jtApp.micState(),track:window.localVoiceProbe.tracks[0].readyState,status:document.getElementById('status-text').textContent,settings:document.getElementById('set-voice-state').textContent};
  });
  assert.equal(interrupted.state,'reconnecting');
  assert.equal(interrupted.track,'live','recognizer restart retains the actual owned audio track');
  assert.match(interrupted.status,/microphone.*(?:remains|still).*on/i,'reconnect must disclose continued microphone capture');
  assert.match(interrupted.status,/reconnect/i,'continued capture must not be presented as successful recognition');
  assert.match(interrupted.settings,/microphone remains on.*reconnecting/i);
  await page.waitForFunction(()=>window.localVoiceProbe.starts.length===3);
  assert.equal(await page.evaluate(()=>window.localVoiceProbe.acquisitions),1,'recognizer restart must retain the microphone stream');
  assert.equal(await page.evaluate(()=>window.localVoiceProbe.starts[2].track===window.localVoiceProbe.starts[1].track),true);
  await page.locator('#voice-toggle').click();
  assert.equal(await page.evaluate(()=>window.localVoiceProbe.stops),1,'pause must release the microphone');
  assert.equal(await page.evaluate(()=>window.localVoiceProbe.tracks[0].readyState),'ended');
  assert.match(await page.$eval('#status-text',n=>n.textContent),/paused|not listening/i);
  assert.doesNotMatch(await page.$eval('#status-text',n=>n.textContent),/microphone.*(?:remains|still).*on/i,'pause must clear the continued-capture disclosure');
  await page.reload();await page.waitForFunction(()=>window.__jtApp?.booted);
  await page.evaluate(()=>window.__jtApp.showView('settings'));
  assert.equal(await page.$eval('#set-voice-processing',n=>n.value),'local','processing preference must survive reload');
  assert.equal(await page.evaluate(()=>window.localVoiceProbe.installs.length),0,'reload must not install again');
  await page.locator('#voice-toggle').click();await page.waitForFunction(()=>window.__jtApp.micState()==='listening');
  assert.deepEqual(await page.evaluate(()=>window.localVoiceProbe.starts.map(s=>s.local)),[true]);
  await page.select('#set-voice-processing','browser');
  assert.equal(await page.evaluate(()=>window.__jtApp.micState()),'paused');
  assert.equal(await page.evaluate(()=>window.localVoiceProbe.stops),1,'changing processing mode must release the owned microphone');
});
