import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const directory=process.env.JETT_READER_EVIDENCE_DIR;
assert.ok(directory,'Set JETT_READER_EVIDENCE_DIR to a synthetic evidence directory');
await mkdir(directory,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage(), errors=[],geometry=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.evaluateOnNewDocument(()=>{localStorage.setItem('jt.welcomed','1');localStorage.setItem('jt.mic','off');});
 await page.setViewport({width:1440,height:1000});
 await page.goto(process.env.JETT_URL || 'http://127.0.0.1:5174');
 await page.waitForFunction(()=>window.__jtApp?.booted);
 await (await page.$('#home-file-input')).uploadFile(new URL('../test/fixtures/jett-fillable.pdf',import.meta.url).pathname);
 await page.waitForFunction(()=>document.body.dataset.view==='read'&&document.querySelector('#reader-tabs [aria-selected="true"]')?.dataset.documentId===window.__jtApp.currentDoc()?.id);
 for(const [name,width,height] of [['desktop',1440,1000],['tablet',834,1112],['phone',390,844]]) {
  await page.setViewport({width,height});
  await page.locator('#pdf-fit-width').click();
  await page.waitForFunction(()=>document.querySelector('.pdf-page')?.getBoundingClientRect().width<=innerWidth-8);
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,toolbar:document.querySelector('#reader-toolbar').getBoundingClientRect().toJSON(),page:document.querySelector('.pdf-page').getBoundingClientRect().toJSON()}));
  assert.equal(metrics.scrollWidth,width);geometry.push(metrics);
  await page.screenshot({path:path.join(directory,`chrome-reader-${name}.png`)});
 }
 await page.locator('#reader-search-toggle').click();
 await page.screenshot({path:path.join(directory,'chrome-reader-phone-search.png')});
 await page.locator('#reader-search-toggle').click();
 await page.locator('#tab-more').click();
 await page.waitForFunction(()=>document.body.classList.contains('sheet-more')&&document.activeElement?.closest('#more-panel'));
 await page.screenshot({path:path.join(directory,'chrome-more-drawer.png')});
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>!document.body.classList.contains('sheet-more'));
 assert.equal(await page.evaluate(()=>document.activeElement.id),'tab-more');
 assert.deepEqual(errors,[]);
 await writeFile(path.join(directory,'chrome-smoke.json'),JSON.stringify({result:'PASS_CHROME_MENU_DRAWER_AND_RESPONSIVE_SMOKE',geometry,drawerKeyboardFocus:true,errors},null,2)+'\n');
 console.log('PASS responsive Reader and drawer focus');
} finally {await browser.close();}
