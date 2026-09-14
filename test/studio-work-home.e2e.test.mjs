import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';

test('home opens actual work, imports a PDF directly and searches persisted documents', {timeout:120000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5207','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill());
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5207')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(async()=>{const timer=setTimeout(()=>browser.process()?.kill('SIGKILL'),3000);try{await browser.close();}finally{clearTimeout(timer);}});
 const page=await browser.newPage();await page.setViewport({width:390,height:844});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await mkdir('/tmp/jetty-taste-home',{recursive:true});
 await page.goto('http://127.0.0.1:5207/studio/index.html');await page.waitForSelector('#work-empty-import');
 assert.equal(await page.$eval('main h1',e=>e.textContent),'Your work');
 assert.doesNotMatch(await page.$eval('body',e=>e.textContent),/River Library|Footbridge|Design preview|Earlier edition|Explore services|Product guide|Widgets/);
 assert.deepEqual(await page.$$eval('.a-rail a',links=>links.map(a=>a.getAttribute('href'))),['#desk','#files','#scan','/notebooks/index.html']);
 await page.screenshot({path:'/tmp/jetty-taste-home/phone-empty.png'});
 await page.waitForFunction(()=>typeof document.querySelector('#real-file-input')?.onchange==='function');
 await (await page.$('#real-file-input')).uploadFile(path.join(root,'public/examples/orchard-walk.pdf'));
 await page.waitForFunction(()=>document.querySelector('#real-status')?.textContent.startsWith('Opened from'));
 const id=await page.evaluate(()=>location.hash.split('/')[1]);
 await page.goto('http://127.0.0.1:5207/studio/index.html#home');await page.waitForSelector('.work-continue canvas:not([hidden])');
 assert.equal(await page.$eval('.work-continue',e=>e.getAttribute('href')),'#editor/'+id);
 await page.screenshot({path:'/tmp/jetty-taste-home/phone-home.png'});
 await page.locator('#work-search').fill('no such document');await page.waitForSelector('.work-no-results');
 assert.equal(await page.$$eval('#work-home-content .a-file-row',e=>e.length),0);
 await page.locator('#work-search').fill('orchard');await page.waitForSelector('#work-home-content .a-file-row');assert.match(await page.$eval('#work-home-content',e=>e.textContent),/orchard/i);
 await page.locator('#work-search-clear').click();await page.waitForSelector('.work-continue');assert.equal(await page.$eval('#work-search',e=>e.value),'');
 await page.locator('[data-a="search"]').click();await page.waitForSelector('.a-dialog[open] #a-search-results .a-file-row');await page.locator('#a-global-search').fill('orchard');assert.doesNotMatch(await page.$eval('#a-search-results',e=>e.textContent),/River Library|Footbridge/);await page.locator('.a-sheet-close').click();await page.waitForSelector('.a-dialog[open]',{hidden:true});
 await page.locator('[data-a="theme"]').click();await page.waitForSelector('.work-continue canvas:not([hidden])');await page.screenshot({path:'/tmp/jetty-taste-home/phone-dark.png'});
 for(const width of [320,390,768,1440]){await page.setViewport({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no overflow at ${width}`);}
 await page.screenshot({path:'/tmp/jetty-taste-home/desktop-dark.png'});await page.locator('[data-a="theme"]').click();await page.waitForSelector('.work-continue canvas:not([hidden])');await page.screenshot({path:'/tmp/jetty-taste-home/desktop-light.png'});
 await page.locator('.work-continue').click();await page.waitForFunction(()=>document.querySelector('#real-status')?.textContent.startsWith('Opened from'));assert.equal(await page.$eval('#real-title',e=>e.textContent),'orchard-walk');
 await page.goto('http://127.0.0.1:5207/studio/index.html#files');await page.waitForSelector('#real-file-list .a-file-row');await page.locator('#real-library-search').fill('missing');assert.equal(await page.$$eval('#real-file-list .a-file-row:not([hidden])',e=>e.length),0);await page.locator('#real-library-search').fill('orchard');assert.equal(await page.$$eval('#real-file-list .a-file-row:not([hidden])',e=>e.length),1);
 assert.deepEqual(errors,[]);
});
