import test from 'node:test';import assert from 'node:assert/strict';import {spawn}from'node:child_process';import path from'node:path';import puppeteer from'puppeteer-core';import {root}from'./validate.mjs';
test('atomic rename preserves document data and survives queued stale form/server writes', {timeout:60000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4975','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill('SIGTERM'));
 const url='http://127.0.0.1:4975/';let ready=false;for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);
 const proof=await page.evaluate(async()=>{
  const db=await import('/src/db.js'),codec=await import('/src/library-backup.js'),at='2026-09-08T12:00:00.000Z';
  const sourceBytes=new TextEncoder().encode('The orchard is ready.');const hash='sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',sourceBytes)),v=>v.toString(16).padStart(2,'0')).join('');
  const doc={id:'rename-source',title:'Original',text:'The orchard is ready.',revision:1,createdAt:at,sourceBytes,provenance:{sourceKind:'text',contentDigest:hash,byteSize:sourceBytes.length,capturedAt:at},formDraft:{sourceDigest:hash,values:{name:'Original answer'}},serverLink:{objectId:'original-link'}};
  await db.putDoc(doc);await db.putRecord({id:'rename-mark',docId:doc.id,kind:'act',act:'highlight',createdAt:at,blockIndex:0});await db.putPosition({docId:doc.id,revision:1,blockIndex:0,blockCount:1,updatedAt:at});
  const before=await db.getDoc(doc.id),records=await db.getRecords(doc.id),position=await db.getPosition(doc.id);
  const renamed=await db.renameDocument(doc.id,'  New Unicode नाम  '),expected={...before,title:'New Unicode नाम',titleRevision:1};
  const preserved=JSON.stringify(renamed)===JSON.stringify(expected);
  // Both orders of queued transactions must preserve the latest renamed title.
  const staleForm={...before,formDraft:{sourceDigest:hash,values:{name:'New answer'}}};
  await Promise.all([db.renameDocument(doc.id,'Second title'),db.putDoc(staleForm)]);
  const afterForm=await db.getDoc(doc.id);
  const staleServer={...afterForm,title:'Original',titleRevision:0,serverLink:{objectId:'new-link'}};
  await Promise.all([db.putDoc(staleServer),db.renameDocument(doc.id,'Third title')]);
  const afterServer=await db.getDoc(doc.id);
  await Promise.all([db.renameDocument(doc.id,'Fourth title'),db.renameDocument(doc.id,'Fifth title')]);
  const latest=await db.getDoc(doc.id),beforeFailures=await db.readLibrarySnapshot(),failures=[];
  for(const [id,title]of [[doc.id,'   '],[doc.id,'a'.repeat(201)],[doc.id,null],['missing','Valid']])try{await db.renameDocument(id,title);}catch(error){failures.push(error.message);}
  const unchanged=JSON.stringify(beforeFailures)===JSON.stringify(await db.readLibrarySnapshot());
  const encoded=await codec.encodeLibraryBackup({docs:[latest],records:[],positions:[]});const restored=await codec.decodeLibraryBackup(encoded);
  restored.docs[0].id='restored-rename';await db.restoreLibrarySnapshot(restored);await db.putDoc({...restored.docs[0],title:'Stale title'});
  const restoredTitle=await db.getDoc('restored-rename');
  return {preserved,afterForm:{title:afterForm.title,titleRevision:afterForm.titleRevision,answer:afterForm.formDraft.values.name},afterServer:{title:afterServer.title,titleRevision:afterServer.titleRevision,link:afterServer.serverLink.objectId},latest:{title:latest.title,titleRevision:latest.titleRevision},recordsUnchanged:JSON.stringify(records)===JSON.stringify(await db.getRecords(doc.id)),positionUnchanged:JSON.stringify(position)===JSON.stringify(await db.getPosition(doc.id)),failures,unchanged,restored:{title:restoredTitle.title,titleRevision:restoredTitle.titleRevision}};
 });
 assert.equal(proof.preserved,true);assert.deepEqual(proof.afterForm,{title:'Second title',titleRevision:2,answer:'New answer'});assert.deepEqual(proof.afterServer,{title:'Third title',titleRevision:3,link:'new-link'});assert.deepEqual(proof.latest,{title:'Fifth title',titleRevision:5});assert.equal(proof.recordsUnchanged,true);assert.equal(proof.positionUnchanged,true);assert.deepEqual(proof.failures,['DOCUMENT_TITLE_INVALID','DOCUMENT_TITLE_INVALID','DOCUMENT_TITLE_INVALID','DOCUMENT_NOT_FOUND']);assert.equal(proof.unchanged,true);assert.deepEqual(proof.restored,proof.latest);
});
