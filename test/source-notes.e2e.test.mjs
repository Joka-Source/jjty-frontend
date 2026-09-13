import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';
test('source notes share transactional notebook storage, reject stale writers and reopen', {timeout:90000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4998','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill());
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4998/studio/index.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(async()=>{const timer=setTimeout(()=>browser.process()?.kill('SIGKILL'),3000);try{await browser.close();}finally{clearTimeout(timer);}});
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4998/notebooks/design/tokens.json');
 const result=await page.evaluate(async()=>{
  const s=await import('/notebooks/storage.js'),other=await import('/notebooks/storage.js?writer=other'),m=await import('/notebooks/model.js'),api=await import('/notebooks/source-notes.js');
  const ref={documentId:'source-a',contentDigest:'sha256:'+'a'.repeat(64),title:'Real source',pageCount:3};
  const initial={version:1,notebooks:[m.notebook('Existing')]};await s.loadWorkspace();await s.saveWorkspace(initial);const legacy=await s.loadWorkspace(),stale=await other.loadWorkspace();
  const books=await Promise.all([api.openOrCreateSourceNotebook(ref),api.openOrCreateSourceNotebook(ref)]);
  const note=await api.saveSourceNote(ref,{pageIndex:2,text:'Third physical page'});
  legacy.notebooks[0].title='Updated legacy';await s.saveWorkspace(legacy);legacy.notebooks[0].title='Updated again';await s.saveWorkspace(legacy);
  const merged=await s.loadWorkspace();
  stale.notebooks[0].title='Stale overwrite';let conflict;try{await other.saveWorkspace(stale);}catch(e){conflict=e.code;}
  const revised=await api.saveSourceNote(ref,{...note,text:'Revised',expectedRevision:note.revision});
  let noteConflict;try{await api.saveSourceNote(ref,{...note,text:'Lost update',expectedRevision:note.revision});}catch(e){noteConflict=e.code;}
  const after=await s.loadWorkspace();const book=after.notebooks.find(n=>n.sourceRef);book.pages[2].items[0].text='Edited in notebook UI';await s.saveWorkspace(after);
  let uiConflict;try{await api.saveSourceNote(ref,{...revised,text:'Overwrite UI',expectedRevision:revised.revision});}catch(e){uiConflict=e.code;}
  const backup=m.validate(JSON.parse(JSON.stringify(await s.loadWorkspace())));
  const different=await api.openOrCreateSourceNotebook({...ref,contentDigest:'sha256:'+'b'.repeat(64)});
  return {same:books[0].id===books[1].id,merged:merged.notebooks.length,conflict,noteConflict,uiConflict,notes:await api.listSourceNotes(ref),linkage:backup.notebooks.find(n=>n.sourceRef).sourceLinkage,hasSource:!!book.source,distinct:different.id!==book.id,staleDraft:stale.notebooks[0].title};
 });
 assert.equal(result.same,true);assert.equal(result.merged,2);assert.equal(result.conflict,'NOTEBOOK_CONFLICT');assert.equal(result.noteConflict,'SOURCE_NOTE_CONFLICT');assert.equal(result.uiConflict,'SOURCE_NOTE_CONFLICT');assert.equal(result.notes[0].text,'Edited in notebook UI');assert.equal(result.notes[0].pageIndex,2);assert.equal(result.linkage,'reference-only');assert.equal(result.hasSource,false);assert.equal(result.distinct,true);assert.equal(result.staleDraft,'Stale overwrite');
 await page.reload();const reopened=await page.evaluate(async()=>{const{listSourceNotes}=await import('/notebooks/source-notes.js');return listSourceNotes({documentId:'source-a',contentDigest:'sha256:'+'a'.repeat(64)});});assert.equal(reopened[0].text,'Edited in notebook UI');
});
