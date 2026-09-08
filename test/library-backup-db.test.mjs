import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';

test('actual IndexedDB snapshot and add-only restore are atomic across all three stores', {timeout:60000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4972','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill('SIGTERM'));
 const url='http://127.0.0.1:4972/';let ready=false;for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});t.after(()=>browser.close());
 const page=await browser.newPage();await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);
 const proof=await page.evaluate(async()=>{
  const db=await import('/src/db.js');const raw=await db.openDb();
  // This isolated browser profile owns its fixture database only.
  await new Promise((resolve,reject)=>{const tx=raw.transaction(['docs','records','positions'],'readwrite');for(const name of ['docs','records','positions'])tx.objectStore(name).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  const at='2026-09-08T12:00:00.000Z';
  const fixture=(suffix)=>({docs:[{id:'doc-'+suffix,title:suffix,text:'The orchard is ready.',revision:1,createdAt:at}],records:[{id:'record-'+suffix,docId:'doc-'+suffix,kind:'act',act:'highlight',blockIndex:0,createdAt:at}],positions:[{docId:'doc-'+suffix,revision:1,blockIndex:0,blockCount:1,updatedAt:at}]});
  const first=fixture('first');const counts=await db.restoreLibrarySnapshot(first);const original=await db.readLibrarySnapshot();
  const attempts=[];
  for(const collision of ['document','record','position']){
   const next=fixture(collision);
   if(collision==='document'){next.docs.push(structuredClone(first.docs[0]));}
   if(collision==='record'){next.records[0].id=first.records[0].id;}
   if(collision==='position'){
    // A pre-existing orphan position must also abort all new document/record writes.
    await db.putPosition({...next.positions[0],blockCount:2,blockIndex:1});
   }
   const before=await db.readLibrarySnapshot();let message;
   try{await db.restoreLibrarySnapshot(next);}catch(error){message=error.message;}
   const after=await db.readLibrarySnapshot();attempts.push({collision,message,unchanged:JSON.stringify(before)===JSON.stringify(after)});
  }
  const invalid=fixture('invalid');invalid.records[0].blockEnd=999999999;let invalidMessage;
  const before=await db.readLibrarySnapshot();try{await db.restoreLibrarySnapshot(invalid);}catch(error){invalidMessage=error.message;}
  const after=await db.readLibrarySnapshot();
  // Export snapshots must request all stores in one readonly transaction.
  const native=raw.transaction.bind(raw),calls=[];raw.transaction=(stores,mode,...rest)=>{calls.push({stores:Array.from(stores),mode});return native(stores,mode,...rest);};
  await db.readLibrarySnapshot();raw.transaction=native;
  return {counts,original,attempts,invalidMessage,invalidUnchanged:JSON.stringify(before)===JSON.stringify(after),calls};
 });
 assert.deepEqual(proof.counts,{documents:1,records:1,positions:1});assert.equal(proof.original.docs[0].id,'doc-first');
 for(const attempt of proof.attempts){assert.equal(attempt.message,'BACKUP_ID_COLLISION',attempt.collision);assert.equal(attempt.unchanged,true,attempt.collision);}
 assert.match(proof.invalidMessage,/BACKUP_INVALID_RECORD/);assert.equal(proof.invalidUnchanged,true);
 assert.deepEqual(proof.calls,[{stores:['docs','records','positions'],mode:'readonly'}]);
});
