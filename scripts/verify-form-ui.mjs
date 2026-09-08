import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(), output=path.resolve('../runtime/form-proof/downloads',String(Date.now()));await mkdir(output,{recursive:true});
const fixture=path.resolve('test/fixtures/jett-fillable.pdf'), original=await readFile(fixture);
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
try{
 const page=await browser.newPage();await page.setViewport({width:1280,height:1000});
 const cdp=await page.createCDPSession();await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:output});
 await page.goto('http://127.0.0.1:5174/');await page.waitForFunction(()=>window.__jtApp?.booted);
 await page.locator('#welcome-next').click();await page.locator('#welcome-skip').click();
 await (await page.$('#home-file-input')).uploadFile(fixture);
 await page.waitForSelector('#pdf-form-panel:not([hidden])');await page.locator('#pdf-form-panel summary').click();
 const fill=async(name,value)=>{const s=`#pdf-form-fields [data-field-name="${name}"]`;await page.$eval(s,(n,v)=>{n.value=v;n.dispatchEvent(new Event('input',{bubbles:true}));},value);};
 await fill('full_name','Taylor Example');await fill('reference','JETT-042');await fill('notes','Please send the draft by email.\nKeep the original for reference.');
 await page.select('[data-field-name="category"]','Research');await page.select('[data-field-name="delivery"]','Post');await page.locator('[data-field-name="consent"]').click();
 await page.waitForFunction(()=>!document.getElementById('pdf-form-download').disabled);
 await page.reload();await page.waitForFunction(()=>window.__jtApp?.booted);await page.waitForSelector('#pdf-form-panel:not([hidden])');
 if(!await page.$eval('#pdf-form-panel',n=>n.open))await page.locator('#pdf-form-panel summary').click();
 const saved=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#pdf-form-fields [data-field-name]')].map(n=>[n.dataset.fieldName,n.type==='checkbox'?n.checked:n.value])));
 assert.deepEqual(saved,{full_name:'Taylor Example',reference:'JETT-042',category:'Research',delivery:'Post',consent:true,notes:'Please send the draft by email.\nKeep the original for reference.'});
 const custody=await page.evaluate(()=>Object.values(window.__jtApp.currentDoc().sourceBytes));assert.deepEqual(Buffer.from(custody),original);
 await page.screenshot({path:path.resolve('../runtime/form-proof/form-ui.png'),fullPage:true});
 await page.locator('#pdf-form-download').click();
 let file;
 for(let i=0;i<100;i++){file=(await readdir(output)).find(n=>n.endsWith('.pdf'));if(file)break;await new Promise(r=>setTimeout(r,100));}
 assert.ok(file,await page.$eval('#pdf-form-status',n=>n.textContent));
 const exported=path.join(output,file);assert.ok((await readFile(exported)).length>1000);
 assert.deepEqual(await readFile(fixture),original);
 await page.setViewport({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const result={result:'PASS_LOCAL_UI',exported,saved,reload:true,sourceSHA256:createHash('sha256').update(original).digest('hex'),originalUnchanged:true};
 await writeFile(path.resolve('../runtime/form-proof/ui-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
