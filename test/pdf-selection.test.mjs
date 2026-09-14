import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {root} from './validate.mjs';

test('PDF selection rejects missing, reordered and untrusted interior text and revalidates retained ranges',async t=>{
 const url='http://127.0.0.1:5079';
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5079','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill('SIGTERM'));
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();await page.setRequestInterception(true);
 page.on('request',r=>r.isNavigationRequest()?r.respond({status:200,contentType:'text/html',body:'<!doctype html><main id="fixture"></main>'}):r.continue());
 await page.goto(url);
 const result=await page.evaluate(async()=>{
   const {pdfSelectionTarget,selectionStillCurrent}=await import('/src/pdf-selection.js');
   const host=document.getElementById('fixture');const doc={id:'source',revision:1,provenance:{contentDigest:'same'},blocks:[{text:'Alpha Beta Gamma Omega'}]};
   const span=(text,start)=>`<span data-pdf-char-start="${start}" data-pdf-char-end="${start+text.length}">${text}</span>`;
   const a=span('Alpha',0),b=span('Beta',6),g=span('Gamma',11),o=span('Omega',17);
   function select(html){host.innerHTML=`<div data-block="0">${html}</div>`;const first=host.querySelector('span'),last=host.querySelector('span:last-child');const r=document.createRange();r.setStart(first.firstChild,0);r.setEnd(last.firstChild,last.textContent.length);const selection=getSelection();selection.removeAllRanges();selection.addRange(r);return pdfSelectionTarget(selection,doc,host);}
   const valid=select(a+b+g+o);const good=valid?.quote==='Alpha Beta Gamma Omega'&&selectionStillCurrent(valid,doc,host);
   host.querySelectorAll('span')[1].remove();const stale=!selectionStillCurrent(valid,doc,host);
   return {good,stale,missing:select(a+o)===null,reordered:select(a+g+b+o)===null,rogue:select(a+'<i>WRONG</i>'+o)===null,wrong:select(a+span('WRONG',6)+o)===null};
 });
 assert.deepEqual(result,{good:true,stale:true,missing:true,reordered:true,rogue:true,wrong:true});
});
