import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';

test('reader keeps content visible and common controls reachable at phone sizes',{timeout:90000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5356','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill());
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5356')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(async()=>{await Promise.race([browser.close(),new Promise(r=>setTimeout(()=>{browser.process()?.kill('SIGKILL');browser.disconnect();r();},3000))]);});
 const page=await browser.newPage();await page.setViewport({width:390,height:844});await page.goto('http://127.0.0.1:5356/studio/index.html#files');await page.waitForFunction(()=>document.querySelector('#real-status')?.textContent==='Your PDF will be stored in this browser.');await page.$eval('[data-doc-action="sample"]',e=>e.scrollIntoView({block:'center',behavior:'instant'}));await page.locator('[data-doc-action="sample"]').click();await page.waitForFunction(()=>document.querySelector('#real-canvas')?.width>0).catch(async e=>{throw new Error(e.message+' '+await page.evaluate(()=>location.hash+' '+document.querySelector('#main')?.textContent));});
 await mkdir('/tmp/jetty-cycle2-chrome',{recursive:true});
 for(const width of [320,390,768]){
  await page.setViewport({width,height:844});
  const reading=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,hint:document.querySelector('#real-mode-hint').checkVisibility(),navigation:document.querySelector('.real-page-nav').checkVisibility(),top:document.querySelector('.real-paper').getBoundingClientRect().top,controls:[...document.querySelectorAll('.real-jelly button,.real-document-header button,.real-document-header a')].filter(e=>e.checkVisibility()).map(e=>({label:e.getAttribute('aria-label')||e.textContent,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))}));
  assert.equal(reading.overflow,false);assert.equal(reading.hint,false);assert.equal(reading.navigation,false);assert.ok(reading.top<130,JSON.stringify(reading));for(const c of reading.controls){assert.ok(c.width>=44&&c.height>=44,JSON.stringify(c));}
  await page.screenshot({path:`/tmp/jetty-cycle2-chrome/read-${width}.png`});
  await page.locator('[data-doc-action="write-panel"]').click();
  const tools=await page.evaluate(()=>({paperTop:document.querySelector('.real-paper').getBoundingClientRect().top,panelTop:document.querySelector('.real-context').getBoundingClientRect().top,buttons:[...document.querySelectorAll('.real-annotation-grid button')].map(e=>({text:e.textContent,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))}));
  assert.ok(tools.panelTop-tools.paperTop>=180,JSON.stringify(tools));assert.equal(tools.buttons.length,6);for(const c of tools.buttons)assert.ok(c.w>=44&&c.h>=44,JSON.stringify(c));
  await page.screenshot({path:`/tmp/jetty-cycle2-chrome/annotate-${width}.png`});await page.locator('[data-doc-action="close-panel"]').click();
 }
});
