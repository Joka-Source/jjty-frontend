import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';

test('saved passage and note search filters all documents and jumps without writing acts',{timeout:90000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4993','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill('SIGTERM'));
 const url='http://127.0.0.1:4993/';
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===99)throw Error('Vite unavailable');await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage();await page.setViewport({width:1100,height:850});
 await page.evaluateOnNewDocument(()=>{localStorage.setItem('jt.welcomed','1');localStorage.setItem('jt.mic','off');});
 const boundary='const docDigest = doc.provenance?.contentDigest ?? await contentDigest(doc.text ?? state.blockTexts.join("\\n\\n"));';
 const main=await (await fetch(url+'src/main.js')).text();
 assert.equal(main.split(boundary).length-1,1,'one saved-anchor digest boundary');
 const instrumented=main.replace(boundary,boundary+'\nif(window.__savedDigestGate) await window.__savedDigestGate();');
 await page.setRequestInterception(true);
 page.on('request',request=>request.url()===url+'src/main.js'?request.respond({status:200,contentType:'text/javascript',body:instrumented}):request.continue());
 await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);
 await page.evaluate(()=>window.__jtApp.addDocument('Opening sentence\n\nThe silver deposit is returned promptly.','First contract'));
 await page.evaluate(()=>window.__jtApp.voiceSegment('highlight silver deposit'));
 await page.waitForFunction(()=>window.__jtApp.entries().some(e=>e.act==='highlight'));
 const first=await page.evaluate(()=>window.__jtApp.currentDoc().id);
 await page.evaluate(()=>window.__jtApp.addDocument('A separate opening\n\nThe roof stays sound.','Second contract'));
 await page.evaluate(()=>window.__jtApp.perform('annotate',1,{tokenStart:1,tokenEnd:3,noteText:'Ask architect about drainage'}));
 const before=await page.evaluate(async()=>{const db=await import('/src/db.js');return Promise.all((await db.getDocs()).map(async d=>[d.id,await db.getRecords(d.id)]));});
 await page.click('[data-view-link="history"]');
 await page.waitForSelector('#history-search');
 async function search(text,count){await page.$eval('#history-search',(el,text)=>{el.value=text;el.dispatchEvent(new Event('input',{bubbles:true}));},text);await page.waitForFunction(count=>document.querySelector('#history-search-status').textContent===`${count} matches`,{},count);}
 await search('SILVER deposit',1);
 assert.match(await page.$eval('#history-all',el=>el.textContent),/First contract/);
 await page.click('#history-all .jump-btn');
 await page.waitForFunction(id=>window.__jtApp.view()==='read'&&window.__jtApp.currentDoc().id===id&&window.__jtApp.currentBlock()===1,{},first);
 assert.match(await page.$eval('#status-text',el=>el.textContent),/silver deposit/);
 await page.click('[data-view-link="history"]');await search('drainage',1);
 assert.match(await page.$eval('#history-all',el=>el.textContent),/Ask architect/);
 await page.click('#history-all .jump-btn');
 await page.waitForFunction(()=>window.__jtApp.view()==='read'&&window.__jtApp.currentDoc().title==='Second contract'&&window.__jtApp.currentBlock()===1);
 await page.click('[data-view-link="history"]');await search('unfindable quasar',0);
 assert.equal(await page.$eval('#history-empty',el=>el.hidden),false);
 const after=await page.evaluate(async()=>{const db=await import('/src/db.js');return Promise.all((await db.getDocs()).map(async d=>[d.id,await db.getRecords(d.id)]));});
 // Opening already refreshes derived anchor caches; source anchors, receipts,
 // notes, identities and all authoritative record fields must remain unchanged.
 const authoritative=docs=>docs.map(([id,rows])=>[id,rows.map(({resolvedAnchor,...row})=>row)]);
 assert.deepEqual(authoritative(after),authoritative(before),'search and passage jump must not create or change authoritative acts');
 await search('silver',1);await page.select('#history-filter',await page.evaluate(()=>window.__jtApp.currentDoc().id));
 await page.waitForFunction(()=>document.querySelector('#history-search-status').textContent==='0 matches');
 await page.select('#history-filter','all');
 await page.evaluate(()=>window.__jtApp.addDocument('Start boundary here.\n\nMiddle cobalt lantern clause.\n\nFinish boundary here.','Range contract'));
 await page.evaluate(()=>window.__jtApp.voiceSegment('highlight from Start boundary to Finish boundary'));
 await page.waitForFunction(()=>window.__jtApp.entries().some(e=>e.rangeAnchor));
 await page.click('[data-view-link="history"]');await search('cobalt lantern',1);
 assert.match(await page.$eval('#history-all',el=>el.textContent),/Range contract/);
 // Corrupt only a stored endpoint digest: old derived segments still contain
 // the clause, but must not be trusted as a current-source search index.
 await page.evaluate(async()=>{const db=await import('/src/db.js');const e=(await db.getRecords(window.__jtApp.currentDoc().id)).find(e=>e.rangeAnchor);e.rangeAnchor.end.docDigest='sha256:stale';await db.putRecord(e);});
 await search('cobalt',0);
 await search('silver deposit',1);
 await page.evaluate(async id=>{const db=await import('/src/db.js');const doc=await db.getDoc(id);delete doc.provenance.contentDigest;await db.putDoc(doc);},first);
 // Refresh the result's document snapshot so this open uses fallback hashing.
 await search('silver',1);
 await page.evaluate(()=>{window.__savedDigestGate=()=>new Promise(resolve=>{window.__releaseSavedDigest=resolve;delete window.__savedDigestGate;});});
 await page.click('#history-all .jump-btn');
 await page.waitForFunction(()=>typeof window.__releaseSavedDigest==='function');
 assert.equal(await page.evaluate(()=>window.__jtApp.currentDoc().provenance.contentDigest),undefined);
 await page.click('#doc p[data-block="0"]');
 await page.evaluate(()=>window.__releaseSavedDigest());
 await page.waitForFunction(()=>!document.querySelector('#status-text').textContent.startsWith('Saved passage:'));
 await new Promise(resolve=>setTimeout(resolve,100));
 assert.equal(await page.evaluate(()=>window.__jtApp.currentBlock()),0,'new selection survives delayed saved-anchor digest');
});
