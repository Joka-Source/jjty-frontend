import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import puppeteer from 'puppeteer-core';
const {PDFDocument,StandardFonts}=createRequire(import.meta.url)('../../backend/node_modules/pdf-lib');
const dir=await mkdtemp(join(tmpdir(),'jett-proposal-'));
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),sheet=pdf.addPage([700,800]);
sheet.drawText('Deep learning needs a lot of data because many parameters must be trained from examples.',{x:40,y:720,size:12,font});
sheet.drawText('Ocean currents shape coastlines.',{x:40,y:680,size:12,font});
const file=join(dir,'synthetic-proposal.pdf');await writeFile(file,await pdf.save());
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
try{
 const page=await browser.newPage();await page.setViewport({width:1280,height:900});
 await page.goto('http://127.0.0.1:5174/');await page.waitForFunction(()=>window.__jtApp?.booted);
 await page.locator('#welcome-next').click();await page.locator('#welcome-skip').click();
 await(await page.$('#home-file-input')).uploadFile(file);await page.waitForSelector('.pdf-page',{visible:true,timeout:60000});
 await page.locator('#server-panel summary').click();
 for(const [id,value]of Object.entries({'server-origin':'http://127.0.0.1:8000','server-token':'jtty-local-development','server-actor':'actor-1','server-tenant':'tenant-1','server-project':'project-1'}))await page.type(`#${id}`,value);
 await page.locator('#server-connect button').click();await page.locator('#server-upload').click();
 await page.waitForFunction(()=>document.getElementById('server-status').textContent.includes('Server copy ready'),{timeout:60000});
 const propose=async()=>{
  await page.$eval('#server-command',n=>n.value='');await page.type('#server-command','Highlight the part where the author explains why deep learning needs a lot of data.');
  await page.locator('#server-command-form button').click();await page.waitForFunction(()=>!document.getElementById('server-proposal').hidden,{timeout:30000});
 };
 await propose();assert.equal(await page.$('.server-work-layer polygon'),null);
 assert.match(await page.$eval('#server-proposal-text',n=>n.textContent),/Deep learning needs a lot of data/);
 await page.locator('#server-apply').click();await page.waitForSelector('.server-work-layer polygon',{timeout:30000});
 await page.locator('#server-undo').click();await page.waitForFunction(()=>!document.querySelector('.server-work-layer polygon'));
 await propose();await page.locator('#server-cancel').click();await page.waitForFunction(()=>document.getElementById('server-proposal').hidden);
 assert.equal(await page.$('.server-work-layer polygon'),null);
 console.log(JSON.stringify({result:'PASS_LOCAL',proposalBeforeEffect:true,quotedTargetVisible:true,explicitApply:true,undo:true,cancelNoEffect:true}));
}finally{await browser.close();await rm(dir,{recursive:true,force:true});}
