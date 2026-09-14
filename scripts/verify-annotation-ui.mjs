import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Run against the local development app; uses an isolated browser profile.
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output=path.resolve(root,'../runtime/annotation-proof',String(Date.now()));
await mkdir(output,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
  const page=await browser.newPage();await page.setViewport({width:1280,height:900});
  const cdp=await page.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:output});
  await page.goto(process.env.JETT_URL || 'http://127.0.0.1:5174/');await page.waitForFunction(()=>window.__jtApp?.booted);
  await page.locator('#welcome-next').click();await page.locator('#welcome-skip').click();
  await (await page.$('#home-file-input')).uploadFile(path.join(root,'test/fixtures/jett-annotations.pdf'));
  await page.waitForSelector('#pdf-annotation-panel:not([hidden])');
  const proof=await page.evaluate(async()=>{
    const doc=window.__jtApp.currentDoc();
    const {tokenizeWithSpans}=await import('/src/match.js');
    const b=doc.blocks.findIndex(b=>b.locator==='page:2'),r=doc.blocks.findIndex(b=>b.locator==='page:3');
    const mark=async(blockIndex,phrase,act='highlight',noteText='',occurrence=0)=>{
      const text=doc.blocks[blockIndex].text,tokens=tokenizeWithSpans(text);
      let offset=-1;for(let n=0;n<=occurrence;n++)offset=text.indexOf(phrase,offset+1);
      const start=tokens.findIndex(t=>t.start===offset),end=tokens.findLastIndex(t=>t.end<=offset+phrase.length);
      if(offset<0 || start<0 || end<start)throw new Error('Missing proof target');
      return window.__jtApp.perform(act,blockIndex,{tokenStart:start,tokenEnd:end,noteText});
    };
    const records=[];
    records.push(await mark(b,'The orchard is ready.','highlight','',1));
    records.push(await mark(b,'The orchard is ready.','annotate','Check the harvest date.',1));
    const text=doc.blocks[b].text,from=text.indexOf('The northern orchard'),end=text.indexOf('winter.')+7;
    records.push(await mark(b,text.slice(from,end)));
    records.push(await mark(r,'Rotated orchard passage.','important'));
    const actual=await crypto.subtle.digest('SHA-256',new Uint8Array(Object.values(doc.sourceBytes)));
    const digest=[...new Uint8Array(actual)].map(n=>n.toString(16).padStart(2,'0')).join('');
    return {originalSha256:digest,expected:records.map(record=>({
      page:Number(doc.blocks[record.blockIndex].locator.split(':')[1]),nm:`jett:${record.id}`,
      subtype:record.act==='note'?'/Text':'/Highlight',
      contents:record.act==='note'?record.noteText:record.act==='important'?`Important: ${record.anchor.quotedText}`:record.anchor.quotedText,
    }))};
  });
  await writeFile(path.join(output,'expected.json'),JSON.stringify(proof.expected,null,2)+'\n');
  await page.locator('#pdf-annotation-panel summary').click();await page.locator('#pdf-annotation-preview').click();
  await page.waitForFunction(()=>document.querySelectorAll('.pdf-review-page').length===3&&!document.querySelector('#pdf-review-download').disabled);
  assert.deepEqual(await page.$$eval('.pdf-review-notes li p',nodes=>nodes.map(n=>n.textContent)),proof.expected.filter(n=>n.subtype==='/Text').map(n=>n.contents));
  await page.locator('.pdf-review-notes summary').click();
  await page.$eval('.pdf-review-notes',n=>n.scrollIntoView({block:'center'}));
  await page.screenshot({path:path.join(output,'review-desktop.png')});
  await page.setViewport({width:390,height:844});
  await page.$eval('.pdf-review-notes',n=>n.scrollIntoView({block:'center'}));
  await page.screenshot({path:path.join(output,'review-phone.png')});
  await page.locator('#pdf-review-download').click();
  let file;for(let n=0;n<100;n++){file=(await readdir(output)).find(n=>n.endsWith('.pdf'));if(file)break;await new Promise(r=>setTimeout(r,100));}
  if(!file)throw new Error('No PDF downloaded');
  console.log(JSON.stringify({result:'PASS_LOCAL_UI',pdf:path.join(output,file),expected:path.join(output,'expected.json'),originalSha256:proof.originalSha256},null,2));
} finally {await browser.close();}
