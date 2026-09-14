// Feed known generated audio directly to the real local engine. No mic capture.
import puppeteer from 'puppeteer-core';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const area=path.resolve('../runtime/local-speech-proof');
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:path.join(area,'chrome-profile'),args:['--no-first-run','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const events=[];
try{
const page=await browser.newPage();await page.goto('http://127.0.0.1:5174/');
await page.exposeFunction('trackProofEvent',(type,value)=>{events.push({type,value});console.log(JSON.stringify({type,value}));});
const b64=(await readFile(path.join(area,'reading.wav'))).toString('base64');
await page.evaluate(async b64=>{
 if(await SpeechRecognition.available({langs:['en-US'],processLocally:true})!=='available')throw new Error('Install the local language through the app first.');
 const ctx=new AudioContext({sampleRate:16000});await ctx.resume();
 const source=ctx.createBufferSource();source.buffer=await ctx.decodeAudioData(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)).buffer);
 const destination=ctx.createMediaStreamDestination();source.connect(destination);
 const rec=new SpeechRecognition();rec.lang='en-US';rec.processLocally=true;rec.interimResults=true;rec.continuous=true;
 window.trackProof={rec,ctx,source,destination};
 for(const name of ['start','audiostart','end','error','result'])rec.addEventListener(name,e=>window.trackProofEvent(name,name==='result'?Array.from(e.results,r=>({text:r[0].transcript,final:r.isFinal})):e.error || ''));
 rec.start(destination.stream.getAudioTracks()[0]);source.start(ctx.currentTime+1);
},b64);
await new Promise(resolve=>setTimeout(resolve,22000));
await page.evaluate(()=>{window.trackProof.rec.abort();window.trackProof.ctx.close();});
}finally{try{for(const p of await browser.pages())await p.evaluate(()=>{const t=window.trackProof;if(t){try{t.rec.abort();t.source.stop();}catch{}t.destination.stream.getTracks().forEach(track=>track.stop());void t.ctx.close();}});await writeFile(path.join(area,'direct-track-result.json'),JSON.stringify(events,null,2));}finally{await browser.close();}}
