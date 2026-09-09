import {openReaderView} from './reader-navigation.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';

async function environment(t, {beforeLoad} = {}) {
  const port = 5078;
  const url = `http://127.0.0.1:${port}/`;
  const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'),
    '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {cwd: root, stdio: 'ignore'});
  t.after(() => server.kill('SIGTERM'));
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'owned Vite server starts');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--no-first-run'],
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setViewport({width: 1440, height: 1000});
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('jt.welcomed', '1');
    localStorage.setItem('jt.mic', 'off');
  });
  if (beforeLoad) await beforeLoad(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  try { await page.waitForFunction(() => window.__jtApp?.booted); }
  catch(error) { throw new Error(`Reader boot failed: ${errors.join('; ')}`, {cause:error}); }
  return {page, url, errors};
}

async function importPdf(page, name) {
  await page.locator('#topnav [data-view-link="home"]').click();
  await page.waitForFunction(() => document.body.dataset.view === 'home');
  await (await page.$('#home-file-input')).uploadFile(path.join(root, 'test/fixtures', name));
  await page.waitForFunction(name => document.body.dataset.view === 'read'
    && window.__jtApp?.currentDoc()?.provenance?.name === name
    && document.querySelector('#reader-tabs [role="tab"][aria-selected="true"]')?.dataset.documentId
      === window.__jtApp.currentDoc().id, {}, name);
  return page.evaluate(() => window.__jtApp.currentDoc().id);
}

async function activate(page, id) {
  await page.locator(`#reader-tabs [role="tab"][data-document-id="${id}"]`).click();
  await page.waitForFunction(id => document.querySelector(
    `#reader-tabs [role="tab"][data-document-id="${id}"]`)?.getAttribute('aria-selected') === 'true'
    && window.__jtApp?.currentDoc()?.id === id, {}, id);
}

async function placeAtPage(page, number) {
  await page.$eval(`.pdf-page[data-page="${number}"]`, node => {
    window.scrollBy({top: node.getBoundingClientRect().top - 200, behavior: 'instant'});
  });
  await new Promise(resolve => setTimeout(resolve, 150));
  return page.$eval(`.pdf-page[data-page="${number}"]`, node => node.getBoundingClientRect().top);
}

test('document tabs retain independent view, workspace and answers through switches, close and reload', {timeout: 180000}, async t => {
  const {page, errors} = await environment(t);
  const a = await importPdf(page, 'jett-annotations.pdf');
  await page.locator('#pdf-zoom-in').click();
  await page.waitForFunction(() => !document.querySelector('#pdf-zoom-in').disabled);
  const zoomA = await page.$eval('#pdf-zoom-value', node => node.textContent);
  const topA = await placeAtPage(page, 3);
  const b = await importPdf(page, 'jett-fillable.pdf');
  assert.notEqual(a, b);
  await page.select('#reader-workspace', 'fill');
  await page.waitForSelector('[data-field-name="full_name"]', {visible: true});
  await page.locator('[data-field-name="full_name"]').fill('Retained across reader tabs');
  await page.waitForFunction(() => !document.querySelector('#pdf-form-download').disabled);
  await page.evaluate(() => { window.readerHeldCanvas = document.querySelector('.pdf-page canvas'); });
  await activate(page, b);
  await page.select('#reader-workspace', 'read');
  await page.select('#reader-workspace', 'fill');
  assert.equal(await page.evaluate(() => window.readerHeldCanvas === document.querySelector('.pdf-page canvas')), true,
    'clicking the selected tab does not recreate the active PDF');
  await activate(page, a);
  assert.equal(await page.$eval('#pdf-zoom-value', node => node.textContent), zoomA);
  const restoredTop = await page.$eval('.pdf-page[data-page="3"]', node => node.getBoundingClientRect().top);
  assert.ok(Math.abs(restoredTop - topA) < 35, `page offset restored: ${restoredTop} versus ${topA}`);
  await activate(page, b);
  assert.equal(await page.$eval('#reader-workspace', node => node.value), 'fill');
  assert.equal(await page.$eval('[data-field-name="full_name"]', node => node.value), 'Retained across reader tabs');
  await page.reload();
  await page.waitForFunction(id => window.__jtApp?.booted && window.__jtApp.currentDoc()?.id === id
    && document.querySelectorAll('#reader-tabs [role="tab"]').length === 2, {}, b);
  assert.equal(await page.$eval('#reader-workspace', node => node.value), 'fill');
  await page.waitForSelector('[data-field-name="full_name"]', {visible: true});
  assert.equal(await page.$eval('[data-field-name="full_name"]', node => node.value), 'Retained across reader tabs');
  await page.locator(`#reader-tabs [data-close-document-id="${a}"]`).click();
  await page.waitForFunction(() => document.querySelectorAll('#reader-tabs [role="tab"]').length === 1);
  assert.equal(await page.evaluate(() => window.__jtApp.currentDoc().id), b, 'closing inactive tab keeps active work');
  await page.locator(`#reader-tabs [data-close-document-id="${b}"]`).click();
  await page.waitForFunction(() => document.body.dataset.view === 'home'
    && document.querySelectorAll('#reader-tabs [role="tab"]').length === 0);
  const stored = await page.evaluate(async () => {
    const {getDocs} = await import('/src/db.js');
    return (await getDocs()).map(doc => ({id: doc.id, bytes: doc.sourceBytes?.byteLength, draft: doc.formDraft}));
  });
  assert.equal(stored.length, 2, 'closing tabs does not delete originals');
  assert.ok(stored.every(doc => doc.bytes > 0));
  assert.ok(JSON.stringify(stored.find(doc => doc.id === b).draft).includes('Retained across reader tabs'));
  assert.deepEqual(errors, []);
});

test('Fit width renders a phone-sized PDF and tabs support manual keyboard activation', {timeout: 120000}, async t => {
  const {page, errors} = await environment(t);
  const a = await importPdf(page, 'jett-annotations.pdf');
  const b = await importPdf(page, 'jett-fillable.pdf');
  await page.focus(`#reader-tabs [role="tab"][data-document-id="${b}"]`);
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.documentId), a);
  assert.equal(await page.evaluate(() => window.__jtApp.currentDoc().id), b, 'arrows move focus without expensive activation');
  await page.keyboard.press('Enter');
  await page.waitForFunction(id => window.__jtApp.currentDoc()?.id === id
    && document.querySelector(`[role="tab"][data-document-id="${id}"]`)?.getAttribute('aria-selected') === 'true', {}, a);
  await page.setViewport({width: 390, height: 844});
  await openReaderView(page,'#pdf-fit-width');await page.locator('#pdf-fit-width').click();
  await page.waitForFunction(() => {
    const paper = document.querySelector('.pdf-page');
    return paper && paper.getBoundingClientRect().width <= innerWidth - 8;
  });
  const dimensions = await page.evaluate(() => ({viewport: innerWidth,
    page: document.querySelector('.pdf-page').getBoundingClientRect().width,
    document: document.documentElement.scrollWidth}));
  assert.ok(dimensions.page <= dimensions.viewport - 8, JSON.stringify(dimensions));
  assert.ok(dimensions.document <= dimensions.viewport + 1, 'Fit width has no document-level horizontal overflow');
  await page.reload();
  await page.waitForFunction(() => window.__jtApp?.booted && document.querySelector('.pdf-page')?.getBoundingClientRect().width <= innerWidth - 8);
  assert.deepEqual(errors, []);
});

test('failed answer save keeps the active tab and draft until Retry succeeds', {timeout:120000}, async t => {
  const {page, errors} = await environment(t);
  const a = await importPdf(page, 'jett-annotations.pdf');
  const b = await importPdf(page, 'jett-fillable.pdf');
  await page.select('#reader-workspace', 'fill');
  await page.evaluate(() => {
    window.readerOriginalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, ...rest) {
      if (this.name === 'docs' && value.formDraft) throw new DOMException('Injected answer save failure', 'QuotaExceededError');
      return window.readerOriginalPut.call(this, value, ...rest);
    };
  });
  await page.locator('[data-field-name="full_name"]').fill('Keep this failed draft');
  await page.waitForSelector('#pdf-form-retry:not([hidden])');
  const close = `button[data-close-document-id="${b}"]`;
  await page.locator(close).click();
  await page.waitForFunction(() => /save|answers/i.test(document.getElementById('reader-persistence-status').textContent)
    || /save|answers/i.test(document.getElementById('status-text').textContent));
  assert.equal(await page.evaluate(() => window.__jtApp.currentDoc()?.id), b);
  assert.equal(await page.$eval('[data-field-name="full_name"]', node => node.value), 'Keep this failed draft');
  assert.equal(await page.$$eval('#reader-tabs [role="tab"]', nodes => nodes.length), 2);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.closeDocumentId), b, 'failed close must retain focus and its tab');
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.readerOriginalPut; });
  await page.locator('#pdf-form-retry').click();
  await page.waitForFunction(() => document.getElementById('pdf-form-retry').hidden);
  await page.locator(close).click();
  await page.waitForFunction(id => window.__jtApp.currentDoc()?.id === id
    && document.querySelectorAll('#reader-tabs [role="tab"]').length === 1, {}, a);
  const stored = await page.evaluate(async id => Object.values((await (await import('/src/db.js')).getDoc(id)).formDraft.values), b);
  assert.ok(stored.includes('Keep this failed draft'));
  assert.deepEqual(errors, []);
});

test('missing tab recovery and unavailable session storage preserve the Library', {timeout:120000}, async t => {
  const {page, errors} = await environment(t);
  const id = await importPdf(page, 'jett-fillable.pdf');
  await page.evaluate(id => {
    const key = 'jett.reader-session.v1', saved = JSON.parse(localStorage.getItem(key));
    saved.tabs.unshift('missing-document'); saved.activeId = 'missing-document';
    localStorage.setItem(key, JSON.stringify(saved)); location.hash = '#/home';
  }, id);
  await page.reload();
  await page.waitForFunction(() => window.__jtApp?.booted);
  assert.equal(await page.evaluate(() => document.body.dataset.view), 'home', 'explicit Library route survives boot');
  assert.deepEqual(await page.evaluate(() => window.__jtApp.readerSession().tabs), [id]);
  await page.evaluate(() => {
    window.readerOriginalStorageSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'jett.reader-session.v1') throw new DOMException('Injected session quota', 'QuotaExceededError');
      return window.readerOriginalStorageSet.call(this, key, value);
    };
  });
  await page.locator('#topnav [data-view-link="read"]').click();
  await page.waitForFunction(() => document.body.dataset.view === 'read');
  await page.select('#reader-workspace', 'fill');
  await page.waitForSelector('#reader-persistence-status:not([hidden])');
  await page.locator('[data-field-name="full_name"]').fill('Independent document storage');
  await page.waitForFunction(() => !document.getElementById('pdf-form-download').disabled);
  const stored = await page.evaluate(async id => {
    const doc = await (await import('/src/db.js')).getDoc(id);
    return {answers:Object.values(doc.formDraft.values), bytes:doc.sourceBytes.byteLength};
  }, id);
  assert.ok(stored.answers.includes('Independent document storage'));
  assert.ok(stored.bytes > 0);
  assert.deepEqual(errors, []);
});

test('JETT toolbar creates and undoes a cross-page range and drops selections on document switch', {timeout:120000},async t=>{
  const {page,errors}=await environment(t);
  await importPdf(page,'jett-annotations.pdf');
  await page.locator('[data-workspace="annotate"]').click();
  const {selectPdfQuote}=await import('./pdf-selection-helpers.mjs');
  await selectPdfQuote(page,'The northern orchard',0,2);
  await page.evaluate(()=>{window.rangeStartForTest=getSelection().getRangeAt(0).cloneRange();});
  await selectPdfQuote(page,'Rotated orchard passage.',0,3);
  await page.evaluate(()=>{const end=getSelection().getRangeAt(0),range=window.rangeStartForTest;range.setEnd(end.endContainer,end.endOffset);getSelection().removeAllRanges();getSelection().addRange(range);});
  await page.waitForFunction(()=>!document.querySelector('[data-annotation="highlight"]').disabled&&document.querySelector('[data-annotation="note"]').disabled);
  await page.locator('[data-annotation="highlight"]').click();
  await page.waitForFunction(()=>window.__jtApp.entries().some(e=>e.rangeAnchor));
  const range=await page.evaluate(()=>window.__jtApp.entries().find(e=>e.rangeAnchor));
  assert.ok(range.rangeAnchor.start.blockIndex<range.rangeAnchor.end.blockIndex);
  await page.locator('[data-annotation="undo"]').click();
  await page.waitForFunction(()=>window.__jtApp.entries().some(e=>e.kind==='undo'));
  assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act'&&!e.undone).length),0);
  await selectPdfQuote(page,'The northern orchard',0,2);
  await importPdf(page,'jett-fillable.pdf');
  await page.locator('[data-workspace="annotate"]').click();
  assert.equal(await page.$eval('[data-annotation="highlight"]',n=>n.disabled),true,'selection from the previous PDF cannot target the new document');
  assert.deepEqual(errors,[]);
});

test('numbered page navigation clears old selections and keeps blank pages untargeted',{timeout:60000},async t=>{
 const {page,errors}=await environment(t);await importPdf(page,'jett-annotations.pdf');await page.locator('[data-workspace="annotate"]').click();
 const {selectPdfQuote}=await import('./pdf-selection-helpers.mjs');await selectPdfQuote(page,'The northern orchard',0,2);
 await page.locator('#reader-page-number').fill('1');await page.keyboard.press('Enter');await page.waitForFunction(()=>document.getElementById('reader-page-number').value==='1'&&!document.getElementById('reader-page-return').disabled);
 assert.equal(await page.$eval('[data-annotation="highlight"]',n=>n.disabled),true);assert.equal(await page.evaluate(()=>getSelection().toString()),'');
 assert.equal(await page.$eval('#marker',n=>n.classList.contains('on')),false);assert.equal(await page.evaluate(()=>document.activeElement.dataset.page),'1');
 const returnLabel=await page.$eval('#reader-page-return',n=>n.textContent);await selectPdfQuote(page,'The northern orchard',0,2);
 await page.$eval('.pdf-page[data-page="1"]',n=>scrollBy({top:n.getBoundingClientRect().top-document.getElementById('reader-chrome').getBoundingClientRect().bottom-12,behavior:'instant'}));
 await page.waitForFunction(()=>document.getElementById('reader-page-number').value==='1');
 await page.click('#reader-page-number');await page.keyboard.press('Enter');await page.waitForFunction(()=>getSelection().toString()==='');
 assert.equal(await page.$eval('[data-annotation="highlight"]',n=>n.disabled),true,'same physical page jump also clears old selection');assert.equal(await page.$eval('#reader-page-return',n=>n.textContent),returnLabel);assert.deepEqual(errors,[]);
});
