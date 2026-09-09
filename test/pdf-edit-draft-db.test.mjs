import test from 'node:test';import assert from 'node:assert/strict';import {spawn}from'node:child_process';import path from'node:path';import puppeteer from'puppeteer-core';import {root}from'./validate.mjs';
test('edit draft transactions preserve concurrent form work, refuse changed sources and do not resurrect discarded edits',{timeout:60000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5097','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill());const url='http://127.0.0.1:5097';for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(url);
 const result=await page.evaluate(async()=>{
  const db=await import('/src/db.js'),sourceBytes=new Uint8Array(await(await fetch('/test/fixtures/jett-range.pdf')).arrayBuffer());
  const digest='sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',sourceBytes)),v=>v.toString(16).padStart(2,'0')).join('');
  const doc={id:'draft',title:'Original',text:'Text',createdAt:new Date().toISOString(),revision:1,sourceBytes,provenance:{sourceKind:'pdf',contentDigest:digest,byteSize:sourceBytes.length,capturedAt:new Date().toISOString()}};
  await db.putDoc(doc);const draft={sourceDigest:digest,pageIndex:0,paragraphId:1,originalBox:{x:50,top:100,w:200,h:20},originalRotation:0,originalText:'Text',text:'Edit'};
  await Promise.all([db.saveTextEditDraft(doc.id,digest,draft),db.putDoc({...doc,formDraft:{sourceDigest:digest,values:{name:'Latest answer'}}})]);
  const saved=await db.getDoc(doc.id);const stale=structuredClone(saved);
  await Promise.all([db.saveTextEditDraft(doc.id,digest,null),db.putDoc(stale)]);const discarded=await db.getDoc(doc.id);
  const before=JSON.stringify(discarded);let mismatch=false,writeFailure=false;
  try{await db.saveTextEditDraft(doc.id,'sha256:'+'0'.repeat(64),null);}catch{mismatch=true;}
  const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='docs')throw new DOMException('Full','QuotaExceededError');return put.apply(this,args);};
  try{await db.saveTextEditDraft(doc.id,digest,draft);}catch{writeFailure=true;}finally{IDBObjectStore.prototype.put=put;}
  const unchanged=JSON.stringify(await db.getDoc(doc.id))===before;await db.saveTextEditDraft(doc.id,digest,{...draft,text:'Retry'});
  const codec=await import('/src/library-backup.js'),backup=await codec.decodeLibraryBackup(await codec.encodeLibraryBackup({docs:[await db.getDoc(doc.id)],records:[],positions:[]}));
  return {saved:saved.textEditDraft,answer:saved.formDraft.values.name,discarded:discarded.textEditDraft??null,mismatch,writeFailure,unchanged,retry:backup.docs[0].textEditDraft.text};
 });
 assert.equal(result.saved.text,'Edit');assert.equal(result.answer,'Latest answer');assert.equal(result.discarded,null);assert.equal(result.mismatch,true);assert.equal(result.writeFailure,true);assert.equal(result.unchanged,true);assert.equal(result.retry,'Retry');
});
