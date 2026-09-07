// Opt-in real engine proof. Uses only generated audio and an isolated profile.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import {access,writeFile,readFile} from 'node:fs/promises';
const root=process.cwd(), area=path.resolve(root,'../runtime/local-speech-proof');
await access(path.join(area,'reading.wav'));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:path.join(area,'chrome-profile'),args:['--no-first-run','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--disable-audio-input',`--use-file-for-fake-audio-capture=${path.join(area,'reading.wav')}%noloop`]});
const direct=process.argv.includes('--direct-track');
const report={inputRoute:direct?'generated-audio-track':'native-fake-input',browser:await browser.version(),syntheticAudioOnly:true,events:[]};
const log=(type,value)=>{report.events.push({at:new Date().toISOString(),type,value});console.log(JSON.stringify({type,value}));};
try{
 const page=await browser.newPage();await page.setViewport({width:1280,height:900});
 page.on('pageerror',error=>log('pageerror',error.message));
 await page.exposeFunction('speechProofEvent',log);
 await page.evaluateOnNewDocument(()=>{
  const Native=window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!Native)return;
  // Observe real results. Direct-track mode substitutes only the generated
  // audio source, not transcripts, matching, intents or persistence.
  window.SpeechRecognition=class extends Native{
   start(){if(window.syntheticSpeechTrack){super.start(window.syntheticSpeechTrack);window.syntheticSpeechSource.start();}else super.start();}
   constructor(){super();for(const name of ['start','audiostart','soundstart','speechstart','speechend','audioend','end','error','result'])this.addEventListener(name,event=>window.speechProofEvent(name,name==='result'?Array.from(event.results,r=>({text:r[0].transcript,final:r.isFinal})):name==='error'?event.error:{local:this.processLocally,lang:this.lang}));}
  };
 });
 await page.goto('http://127.0.0.1:5174/');await page.waitForFunction(()=>window.__jtApp?.booted);
 if(await page.$eval('#view-welcome',n=>!n.hidden)){await page.locator('#welcome-next').click();await page.locator('#welcome-skip').click();}
 await page.evaluate(()=>window.__jtApp.showView('settings'));
 await page.select('#set-lang','en-US');await page.select('#set-voice-processing','local');
 await page.locator('#set-local-voice-check').click();await page.waitForFunction(()=>!document.getElementById('set-local-voice-check').disabled);
 log('initialAvailability',await page.$eval('#set-local-voice-status',n=>n.textContent));
 if(await page.$eval('#set-local-voice-install',n=>!n.hidden)){
  log('install','explicit click');await page.locator('#set-local-voice-install').click();
  await page.waitForFunction(()=>!document.getElementById('set-local-voice-check').disabled,{timeout:120000});
 }
 log('afterInstall',await page.$eval('#set-local-voice-status',n=>n.textContent));
 const availability=await page.evaluate(()=>SpeechRecognition.available({langs:['en-US'],processLocally:true}));
 if(availability!=='available')throw new Error(`Local pack not ready: ${availability}`);
 await page.evaluate(async()=>{await window.__jtApp.addDocument('The northern orchard produces crisp apples every autumn.','Synthetic local speech fixture');window.__jtApp.showView('read');});
 if(direct){const b64=(await readFile(path.join(area,'reading.wav'))).toString('base64');await page.evaluate(async b64=>{const ctx=new AudioContext({sampleRate:16000});await ctx.resume();const source=ctx.createBufferSource();source.buffer=await ctx.decodeAudioData(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)).buffer);const dest=ctx.createMediaStreamDestination();source.connect(dest);window.syntheticSpeechTrack=dest.stream.getAudioTracks()[0];window.syntheticSpeechSource=source;window.syntheticSpeechContext=ctx;},b64);}
 const original=await page.evaluate(()=>{const d=window.__jtApp.currentDoc();return {digest:d.provenance.contentDigest,bytes:Object.values(d.sourceBytes || {})};});
 assert.ok(original.bytes.length>0);
 await page.setOfflineMode(true);
 log('network','page/CDP offline emulation before capture; not OS-wide egress isolation');
 assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act').length),0);
 await page.locator('#voice-toggle').click();
 await page.waitForFunction(()=>window.__jtApp.entries().some(e=>e.kind==='act'),{timeout:45000});
 const work=await page.evaluate(()=>({docId:window.__jtApp.currentDoc().id,entries:window.__jtApp.entries().filter(e=>e.kind==='act'),marker:document.querySelector('#marker')?.className}));
 assert.ok(report.events.some(e=>e.type==='start'&&e.value.local===true));
 assert.ok(report.events.some(e=>e.type==='result'&&e.value.some(r=>r.final&&/highlight this/i.test(r.text))));
 assert.equal(work.entries.length,1);assert.equal(work.entries[0].act,'highlight');assert.equal(work.entries[0].modality,'voice');
 assert.equal(work.entries[0].anchor.quotedText,'The northern orchard produces crisp apples every autumn');
 assert.equal(work.marker,'on');assert.ok(work.entries[0].receipt);
 log('verifiedHighlight',{quotedText:work.entries[0].anchor.quotedText,receipt:true,processLocally:true,pageOfflineEmulation:true});
 await page.locator('#voice-toggle').click();
 await page.screenshot({path:path.join(area,'recognized-highlight.png')});
 await page.setOfflineMode(false);await page.reload();await page.waitForFunction(()=>window.__jtApp?.booted);
 await page.waitForFunction(id=>window.__jtApp.currentDoc()?.id===id,{},work.docId);
 const restored=await page.evaluate(id=>window.__jtApp.entries().find(e=>e.id===id),work.entries[0].id);
 assert.equal(restored.undone,false);assert.deepEqual(restored.receipt,work.entries[0].receipt);
 assert.deepEqual(await page.evaluate(()=>{const d=window.__jtApp.currentDoc();return {digest:d.provenance.contentDigest,bytes:Object.values(d.sourceBytes || {})};}),original);
 await page.evaluate(()=>window.__jtApp.showView('history'));
 await page.locator('#history-all .undo-btn').click();
 await page.waitForFunction(id=>window.__jtApp.entries().some(e=>e.id===id&&e.undone),{},work.entries[0].id);
 log('verifiedRecovery',{reload:true,exactReceipt:true,originalBytesUnchanged:true,undo:true});
 report.result='PASS_LOCAL_SYNTHETIC';
}catch(error){report.result='INCOMPLETE';report.error=error.message;log('failure',error.message);process.exitCode=1;}
finally{try{await writeFile(path.join(area,direct?'app-track-result.json':'native-result.json'),JSON.stringify(report,null,2));}finally{await browser.close();}}
