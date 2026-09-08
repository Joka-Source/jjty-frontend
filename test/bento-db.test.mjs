import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { root } from './validate.mjs';
test('concurrent Bento imports use one durable document and retries preserve later work', {timeout:60000}, async t => {
  const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host','127.0.0.1','--port','4979','--strictPort'], {cwd:root,stdio:'ignore'});
  t.after(()=>server.kill('SIGTERM'));
  const url='http://127.0.0.1:4979/'; let ready=false;
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{} await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready);
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
  t.after(()=>browser.close()); const page=await browser.newPage();await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);
  const result=await page.evaluate(async()=>{
    const db=await import('/src/db.js');
    const source={id:'bento-concurrent',title:'First result',revision:1,sourceBytes:new Uint8Array([1,2,3])};
    const imports=await Promise.all(Array.from({length:12},()=>db.putDocIfAbsent(source)));
    await db.renameDocument(source.id,'My renamed Bento result');
    await db.putDoc({...await db.getDoc(source.id),formDraft:{values:{name:'My later work'}}});
    const retry=await db.putDocIfAbsent({...source,title:'Stale result'});
    return {ids:imports.map(doc=>doc.id),count:(await db.getDocs()).filter(doc=>doc.id===source.id).length,title:retry.title,draft:retry.formDraft};
  });
  const denied = await page.evaluate(async()=>{
    document.body.innerHTML='<button id="bento-original"></button><button id="bento-tools"></button><aside id="bento-return"><p id="bento-status"></p><button id="bento-save"></button><button id="bento-resume"></button><button id="bento-dismiss"></button></aside>';
    Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new Error('Storage denied');}});
    let opened; window.open=url=>{opened=url;};
    const {initBentoPanel}=await import('/src/bento-panel.js');
    initBentoPanel({getCurrentDocument:()=>null,getDocument:async()=>null,importDocument:async()=>null});
    document.getElementById('bento-tools').click();
    document.getElementById('bento-original').click();
    return {opened,status:document.getElementById('bento-status').textContent};
  });
  assert.equal(denied.opened,'http://127.0.0.1:5181/tools.html'); assert.match(denied.status,/local storage/);
  assert.equal(result.count,1);assert.equal(new Set(result.ids).size,1);assert.equal(result.title,'My renamed Bento result');assert.deepEqual(result.draft,{values:{name:'My later work'}});
});
