import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import puppeteer from 'puppeteer-core';
const root=path.resolve(import.meta.dirname,'..');
const url=new URL(process.env.JETT_URL??'http://127.0.0.1:5174/');
if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('Loopback proof only');
const out=path.resolve(root,'../runtime/range-proof',String(Date.now()));await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
try{
 const page=await browser.newPage();await page.setViewport({width:1280,height:900});
 const cdp=await page.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:out});
 await page.goto(url.href);await page.waitForFunction(()=>window.__jtApp?.booted);
 await page.locator('#welcome-next').click();await page.locator('#welcome-skip').click();
 const fixture=path.join(root,'test/fixtures/jett-range.pdf'),original=await readFile(fixture);
 await (await page.$('#home-file-input')).uploadFile(fixture);await page.waitForSelector('#pdf-annotation-panel:not([hidden])');
 const result=await page.evaluate(async()=>{
  await window.__jtApp.perform('highlight-range',undefined,{fromAnchor:'Start at the orchard gate',toAnchor:'Finish beside the river'});
  const entry=window.__jtApp.entries().find(e=>e.kind==='act'&&!e.undone);
  if(!entry?.rangeAnchor||entry.resolvedSegments.length!==3)throw new Error('Exact range was not saved');
  return {entry,source:[...new Uint8Array(Object.values(window.__jtApp.currentDoc().sourceBytes))]};
 });
 if(!original.equals(Buffer.from(result.source)))throw new Error('Original changed in app');
 await page.locator('#pdf-annotation-panel summary').click();await page.locator('#pdf-annotation-preview').click();
 await page.waitForFunction(()=>document.getElementById('pdf-review-dialog').open&&!document.getElementById('pdf-review-download').disabled);
 await page.screenshot({path:path.join(out,'review.png'),fullPage:true});
 await page.locator('#pdf-review-download').click();let filename;
 for(let i=0;i<100;i++){filename=(await readdir(out)).find(n=>n.endsWith('.pdf'));if(filename)break;await new Promise(r=>setTimeout(r,100));}
 if(!filename)throw new Error('No downloaded PDF');
 if(!original.equals(await readFile(fixture)))throw new Error('Fixture changed');
 const expected=result.entry.resolvedSegments.map((s,i)=>({page:i+1,nm:`jett:${result.entry.id}:range:${i}`,subtype:'/Highlight',contents:s.quotedText}));
 await writeFile(path.join(out,'expected.json'),JSON.stringify(expected,null,2));
 await writeFile(path.join(out,'result.json'),JSON.stringify({result:'PASS_UI_DOWNLOAD',file:path.join(out,filename),sourceSha256:createHash('sha256').update(original).digest('hex'),entry:result.entry},null,2));
 console.log(JSON.stringify({out,file:path.join(out,filename),sourceSha256:createHash('sha256').update(original).digest('hex')}));
}finally{await browser.close();}
