import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {root} from './validate.mjs';

test('filled PDF review renders both pages, downloads current answers and closes on navigation', {timeout:60000},async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'jett-form-review-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','4963','--strictPort'],{cwd:root,stdio:'ignore'});
  t.after(()=>server.kill('SIGTERM'));
  let ready=false;const url='http://127.0.0.1:4963/';
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready);
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
  t.after(()=>browser.close());
  const page=await browser.newPage();await page.setViewport({width:1280,height:900});
  const cdp=await page.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:directory});
  await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);
  await page.locator('#welcome-next').click();await page.locator('#welcome-skip').click();
  const fixture=path.join(root,'test/fixtures/jett-fillable.pdf'),original=await readFile(fixture);
  await (await page.$('#home-file-input')).uploadFile(fixture);
  await page.waitForSelector('#pdf-form-panel:not([hidden])');
  await page.locator('#pdf-form-panel summary').click();
  await page.locator('[data-field-name="consent"]').click();
  const setName=async value=>{
    await page.$eval('[data-field-name="full_name"]',(n,value)=>{n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));},value);
    await page.waitForFunction(()=>!document.getElementById('pdf-form-preview').disabled);
  };
  await setName('First preview');
  await page.evaluate(()=>{
    const observer=new MutationObserver(()=>{
      if(!document.querySelector('.pdf-review-page canvas'))return;
      observer.disconnect();
      window.reviewInterrupted={pages:document.querySelectorAll('.pdf-review-page canvas').length,downloadDisabled:document.getElementById('pdf-review-download').disabled};
      document.getElementById('pdf-review-close').click();
    });
    observer.observe(document.getElementById('pdf-review-pages'),{childList:true});
  });
  await page.locator('#pdf-form-preview').click();
  await page.waitForFunction(()=>window.reviewInterrupted&&!document.getElementById('pdf-form-preview').disabled);
  assert.deepEqual(await page.evaluate(()=>window.reviewInterrupted),{pages:1,downloadDisabled:true},'download remains unavailable until all pages render');
  assert.equal(await page.$$eval('.pdf-review-page canvas',nodes=>nodes.length),0,'closing during render must prevent late pages from reappearing');
  await page.locator('#pdf-form-preview').click();
  await page.waitForSelector('#pdf-review-dialog[open]');
  await page.waitForFunction(()=>document.querySelectorAll('.pdf-review-page canvas').length===2&&!document.getElementById('pdf-review-download').disabled);
  assert.ok(await page.$$eval('.pdf-review-page canvas',nodes=>nodes.every(n=>n.width>0&&n.height>0)));
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.getElementById('pdf-review-dialog').open);
  assert.equal(await page.$$eval('.pdf-review-page canvas',nodes=>nodes.length),0,'closing review must release rendered pages');
  await setName('Latest preview');
  await page.locator('#pdf-form-preview').click();
  await page.waitForFunction(()=>document.getElementById('pdf-review-dialog').open&&!document.getElementById('pdf-review-download').disabled);
  await page.locator('#pdf-review-download').click();
  let downloaded;
  for(let i=0;i<100;i++){downloaded=(await readdir(directory)).find(name=>name.endsWith('.pdf'));if(downloaded)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(downloaded,'review must deliver an actual PDF');
  const task=getDocument({data:new Uint8Array(await readFile(path.join(directory,downloaded)))});
  try {const pdf=await task.promise;assert.equal(pdf.numPages,2);const fields=await pdf.getFieldObjects();assert.equal(fields.full_name[0].value,'Latest preview','download must contain the current review, not its predecessor');}
  finally{await task.destroy();}
  assert.deepEqual(await page.evaluate(()=>Object.values(window.__jtApp.currentDoc().sourceBytes)),[...original]);
  await page.evaluate(async()=>{window.reviewedForm=window.__jtApp.currentDoc();await window.__jtApp.addDocument('A different reading document.','Other document');});
  await page.waitForFunction(()=>!document.getElementById('pdf-review-dialog').open);
  assert.equal(await page.$$eval('.pdf-review-page canvas',nodes=>nodes.length),0,'document switching must clear review canvases');
  await page.evaluate(()=>window.__jtApp.openDocument(window.reviewedForm));
  await page.waitForSelector('[data-field-name="full_name"]');
  assert.equal(await page.$eval('[data-field-name="full_name"]',n=>n.value),'Latest preview');
  assert.deepEqual(await readFile(fixture),original);
});
