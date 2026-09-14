import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {selectPdfQuote} from '../test/pdf-selection-helpers.mjs';
const directory=process.env.JETT_ANNOTATION_EVIDENCE_DIR;
assert.ok(directory);await mkdir(directory,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage(),errors=[],geometry=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluateOnNewDocument(()=>{localStorage.setItem('jt.welcomed','1');localStorage.setItem('jt.mic','off');});
 await page.setViewport({width:1440,height:1000});await page.goto(process.env.JETT_URL || 'http://127.0.0.1:5174');await page.waitForFunction(()=>window.__jtApp?.booted);
 await (await page.$('#home-file-input')).uploadFile(new URL('../test/fixtures/jett-annotations.pdf',import.meta.url).pathname);
 await page.waitForFunction(()=>document.querySelector('#reader-tabs [aria-selected="true"]')?.dataset.documentId===window.__jtApp.currentDoc()?.id);
 await page.locator('[data-workspace="annotate"]').click();
 await selectPdfQuote(page,'The orchard is ready.',1);
 await page.locator('[data-annotation="highlight"]').click();await page.waitForFunction(()=>window.__jtApp.entries().some(e=>e.act==='highlight'));
 for(const [name,width,height] of [['desktop',1440,1000],['tablet',834,1112],['phone',390,844]]){
  await page.setViewport({width,height});await page.locator('#pdf-fit-width').click();
  await page.waitForFunction(()=>document.querySelector('.pdf-page')?.getBoundingClientRect().width<=innerWidth-8);
  await page.$eval('.pdf-page[data-page="2"]',n=>{scrollTo({top:scrollY+n.getBoundingClientRect().top-document.getElementById('reader-chrome').getBoundingClientRect().bottom-12,behavior:'instant'});});
  geometry.push(await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,toolbar:document.getElementById('annotation-toolbar').getBoundingClientRect().toJSON()})));
  assert.equal(geometry.at(-1).scrollWidth,width);await page.screenshot({path:path.join(directory,`${name}.png`)});
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(directory,'smoke.json'),JSON.stringify({selection:'Browser DOM Range with real toolbar clicks; physical drag not covered',geometry,errors},null,2));
}finally{await browser.close();}
