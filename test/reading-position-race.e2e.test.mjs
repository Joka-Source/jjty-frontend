import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import * as mupdf from 'mupdf';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';

async function bookmarkedPdf() {
  const doc=new mupdf.PDFDocument(await readFile(path.join(root,'test/fixtures/jett-annotations.pdf')));
  const held=[],keep=v=>(held.push(v),v),trailer=keep(doc.getTrailer()),catalog=keep(trailer.get('Root')),page=doc.loadPage(2);
  try {
    const tree=keep(doc.addObject({Count:2})),chapter=keep(doc.addObject({})),blank=keep(doc.addObject({}));
    tree.put('First',chapter);tree.put('Last',blank);chapter.put('Parent',tree);
    chapter.put('Next',blank);blank.put('Prev',chapter);blank.put('Parent',tree);
    blank.put('Title',keep(doc.newString('Blank first page')));
    blank.put('Dest',[0,keep(doc.newName('Fit'))]);
    chapter.put('Title',keep(doc.newString('Chapter three')));
    chapter.put('Dest',[keep(page.getObject()),keep(doc.newName('Fit'))]);
    catalog.put('Outlines',tree);
    const buffer=doc.saveToBuffer();
    try{return new Uint8Array(buffer.asUint8Array());}finally{buffer.destroy();}
  } finally {held.reverse().forEach(v=>v.destroy());page.destroy();doc.destroy();}
}

test('a bookmark selected while saved reading position returns keeps the newer place',{timeout:90000},async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'jett-position-race-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'position-race.pdf'),bytes=await bookmarkedPdf();await writeFile(file,bytes);
  const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4988','--strictPort'],{cwd:root,stdio:'ignore'});
  t.after(()=>server.kill('SIGTERM'));
  const url='http://127.0.0.1:4988/';
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===99)throw Error('Vite startup failed');await new Promise(r=>setTimeout(r,100));}
  // Pause only the actual open-document restore, after its real IndexedDB read.
  // Library cards also read positions, so gating position.js indiscriminately
  // would test the wrong read. All controller/selection/restore code stays real.
  const anchor='const position = await positionForDoc(doc);';
  const main=await(await fetch(url+'src/main.js')).text();
  assert.equal(main.split(anchor).length-1,1,'one precise restore boundary');
  const instrumented=main.replace(anchor,anchor+'\nif(window.__positionRestoreGate) await window.__positionRestoreGate(position);').replace('const zoom = state.pdf.model.setZoom(nextZoom);','const zoom = state.pdf.model.setZoom(nextZoom); (window.__fitTransitions ??= []).push({previousZoom,zoom,mode});');
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  t.after(()=>browser.close());const page=await browser.newPage();await page.setViewport({width:1280,height:900});
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  async function step(name,run) {
    try {return await run();}
    catch(error) {
      const state=await page.evaluate(()=>({view:document.body.dataset.view,booted:window.__jtApp?.booted,
        currentBlock:window.__jtApp?.currentBlock(),docId:window.__jtApp?.currentDoc()?.id,
        contents:document.querySelectorAll('#pdf-contents-list .pdf-contents-target').length,
        held:window.__heldPosition,releaseReady:typeof window.__releasePositionRestore==='function',
        layer:[...document.querySelectorAll('.pdf-text-layer[data-block="0"]')].map(n=>({rect:n.getBoundingClientRect().toJSON(),display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility})),
        status:document.querySelector('[role="status"]')?.textContent})).catch(cause=>({diagnosticError:cause.message}));
      throw new Error(`${name}: ${error.message}; state=${JSON.stringify(state)}; pageErrors=${JSON.stringify(pageErrors)}`,{cause:error});
    }
  }
  await page.setRequestInterception(true);
  page.on('request',request=>request.url()===url+'src/main.js'?request.respond({status:200,contentType:'text/javascript',body:instrumented}):request.continue());
  await page.evaluateOnNewDocument(()=>{localStorage.setItem('jt.welcomed','1');localStorage.setItem('jt.mic','off');});
  await step('navigate',()=>page.goto(url));await step('boot ready',()=>page.waitForFunction(()=>window.__jtApp?.booted));
  await step('import PDF',async()=>await(await page.$('#home-file-input')).uploadFile(file));
  await step('initial contents ready',()=>page.waitForFunction(()=>document.querySelector('#pdf-contents-list .pdf-contents-target')));
  // Contents load before openDocumentNow finishes showing the reader. Starting
  // locator auto-scroll while that surface is hidden can leave it polling an
  // offscreen layer after the surface changes. Wait for the real surface and
  // click a text span, rather than the full-page transparent overlay.
  await step('reader surface visible',()=>page.waitForFunction(()=>document.body.dataset.view==='read'));
  await step('select initial text block zero',()=>page.locator('.pdf-text-layer[data-block="0"] span[data-pdf-char-start]').click());
  await page.evaluate(()=>window.__jtApp.position.flush());
  assert.equal((await page.evaluate(()=>window.__jtApp.position.read())).blockIndex,0);
  const chapterBlock=await page.evaluate(()=>window.__jtApp.currentDoc().blocks.findIndex(b=>b.locator==='page:3'));
  assert.equal(chapterBlock,1,'fixture has two extracted text blocks following a blank first page');
  assert.equal(await page.evaluate(()=>window.__jtApp.currentDoc().blocks.findIndex(b=>b.locator==='page:1')),-1);
  if(!await page.$eval('#reader-page-browser',n=>n.open)){await page.click('#reader-pages-toggle');await page.waitForFunction(()=>document.getElementById('reader-page-browser').open);}
  await page.evaluate(()=>{
    window.__positionRestoreGate=position=>{
      window.__heldPosition=position;
      delete window.__positionRestoreGate;
      return new Promise(resolve=>{window.__releasePositionRestore=resolve;});
    };
    window.__reopening=window.__jtApp.openDocument(window.__jtApp.currentDoc());
  });
  await step('saved restore held',()=>page.waitForFunction(()=>typeof window.__releasePositionRestore==='function'));
  assert.equal(await page.evaluate(()=>window.__heldPosition.blockIndex),0,'held result really is the old saved place');
  if(!await page.$eval('#reader-page-browser',n=>n.open))await page.click('#reader-pages-toggle');await page.$eval('#pdf-contents',node=>{node.open=true;});
  await step('choose chapter bookmark',()=>page.click('#pdf-contents-list .pdf-contents-target'));
  assert.doesNotMatch(await page.$eval('#pdf-contents-status',n=>n.textContent),/Opened page/,'queued bookmark does not report success before restore releases');
  await step('release saved restore',()=>page.evaluate(async()=>{window.__releasePositionRestore();await window.__reopening;}));
  await page.waitForFunction(()=>document.getElementById('pdf-contents-status').textContent==='Opened page 3.');
  assert.equal(await page.evaluate(()=>window.__jtApp.currentBlock()),chapterBlock,'late saved position must not overwrite a newer bookmark selection');
  await page.evaluate(()=>window.__jtApp.position.flush());
  assert.equal((await page.evaluate(()=>window.__jtApp.position.read())).blockIndex,chapterBlock);
  // With no newer selection, the ordinary reopen still restores block 1.
  await step('untouched reopen',()=>page.evaluate(()=>window.__jtApp.openDocument(window.__jtApp.currentDoc())));
  assert.equal(await page.evaluate(()=>window.__jtApp.currentBlock()),chapterBlock,'untouched reopen restores the saved place');
  if(!await page.$eval('#reader-page-browser',n=>n.open)){await page.click('#reader-pages-toggle');await page.waitForFunction(()=>document.getElementById('reader-page-browser').open);}
  await page.evaluate(()=>{
    delete window.__releasePositionRestore;
    window.__positionRestoreGate=position=>{
      window.__heldPosition=position;
      delete window.__positionRestoreGate;
      return new Promise(resolve=>{window.__releasePositionRestore=resolve;});
    };
    window.__reopening=window.__jtApp.openDocument(window.__jtApp.currentDoc());
  });
  await step('blank-page restore held',()=>page.waitForFunction(()=>typeof window.__releasePositionRestore==='function'));
  assert.equal(await page.evaluate(()=>window.__heldPosition.blockIndex),chapterBlock,'blank-page trial holds the previous real text position');
  if(!await page.$eval('#reader-page-browser',n=>n.open))await page.click('#reader-pages-toggle');await page.$eval('#pdf-contents',node=>{node.open=true;});
  await step('choose blank-page bookmark',()=>page.click('#pdf-contents-list > li:last-child .pdf-contents-target'));
  assert.doesNotMatch(await page.$eval('#pdf-contents-status',n=>n.textContent),/Opened page/,'blank-page jump waits for the owned restore');
  await step('release saved restore',()=>page.evaluate(async()=>{window.__releasePositionRestore();await window.__reopening;}));
  await page.waitForFunction(()=>document.getElementById('pdf-contents-status').textContent==='Opened page 1.');
  assert.equal(await page.evaluate(()=>window.__jtApp.currentBlock()),-1,'late text position cannot override a newer blank-page selection');
  await page.evaluate(()=>window.__jtApp.position.flush());
  assert.equal((await page.evaluate(()=>window.__jtApp.position.read())).blockIndex,chapterBlock,'blank page does not fabricate a persisted text anchor');
  // An explicit saved passage from Library must beat a stored first-page view,
  // including when the initially hidden reader forces a real fit-width rerender.
  await page.evaluate(()=>window.__jtApp.showView('home'));
  await page.setViewport({width:390,height:844});
  await page.evaluate(()=>{window.__fitTransitions=[];});
  await step('open explicit saved passage with changed fit',()=>page.evaluate(async()=>{
    const {createAnchor}=await import('/src/anchors.js');
    const doc=window.__jtApp.currentDoc(),blockIndex=doc.blocks.findIndex(block=>block.locator==='page:3');
    const savedAnchor=createAnchor({blockTexts:doc.blocks.map(block=>block.text),blockIndex,tokenStart:0,tokenEnd:2,docDigest:doc.provenance.contentDigest});
    await window.__jtApp.perform('open-document',0,{document:doc,options:{savedAnchor}});
  }));
  assert.equal(await page.evaluate(()=>window.__fitTransitions.some(change=>change.mode==='fit-width'&&change.zoom!==change.previousZoom)),true,'fixture exercises a changed fit render, not the early-return branch');
  assert.equal(await page.evaluate(()=>window.__jtApp.currentBlock()),chapterBlock);
  assert.equal(await page.$eval('.pdf-page[data-page="3"]',node=>{const r=node.getBoundingClientRect(),top=document.getElementById('reader-toolbar').getBoundingClientRect().bottom;return r.bottom>top&&r.top<innerHeight;}),true,'saved passage page remains in view after fitting');
  assert.deepEqual(await page.evaluate(()=>Object.values(window.__jtApp.currentDoc().sourceBytes)),[...bytes]);
  assert.deepEqual(await readFile(file),Buffer.from(bytes));
});
