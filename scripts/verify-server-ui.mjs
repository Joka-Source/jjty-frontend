import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const url=process.argv[2] || 'http://127.0.0.1:5174/';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw new Error('Use a loopback test web app.');
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
try{
 const page=await browser.newPage();await page.setViewport({width:1280,height:900});
 let uploads=0;page.on('request',r=>{if(r.url()==='http://127.0.0.1:8000/api/v1/uploads'&&r.method()==='POST')uploads++;});
 await page.goto(url);await page.waitForFunction(()=>window.__jtApp?.booted);
 await page.locator('#welcome-next').click();await page.locator('#welcome-skip').click();
 await (await page.$('#home-file-input')).uploadFile('../backend/tests/fixtures/frontier-gdp-evidence-brief.pdf');
 await page.waitForSelector('.pdf-page',{visible:true,timeout:60000});
 assert.equal(uploads,0,'local import must not upload');
 const connect=async()=>{
   await page.locator('#server-panel summary').click();
   for(const [id,value]of Object.entries({'server-origin':'http://127.0.0.1:8000','server-token':'jtty-local-development','server-actor':'actor-1','server-tenant':'tenant-1','server-project':'project-1'}))await page.type(`#${id}`,value);
   await page.locator('#server-connect button').click();
   await page.waitForFunction(()=>!document.getElementById('server-upload').hidden);
 };
 await page.evaluate(()=>{
   const originalFetch=window.fetch;let dropped=false;
   window.fetch=async(...args)=>{const response=await originalFetch(...args);if(String(args[0]).endsWith('/api/v1/interactions')&&!dropped){dropped=true;throw new TypeError('Synthetic lost response');}return response;};
 });
 await connect();assert.equal(uploads,0,'configuration must not upload');
 await page.locator('#server-upload').click();await page.waitForFunction(()=>document.getElementById('server-status').textContent.includes('Server copy ready'),{timeout:60000});
 assert.equal(uploads,1);assert.equal(await page.$eval('#server-token',n=>n.value),'');
 await page.type('#server-command','Highlight the first paragraph.');await page.locator('#server-command-form button').click();
 await page.waitForFunction(()=>!document.getElementById('server-retry').hidden);
 await page.waitForFunction(()=>!document.getElementById('server-retry').disabled);
 assert.equal(await page.$('.server-work-layer polygon'),null,'lost acknowledgement must not paint optimistic work');
 await page.reload();await page.waitForSelector('.pdf-page',{visible:true,timeout:60000});
 await connect();await page.locator('#server-upload').click();
 await page.waitForFunction(()=>document.getElementById('server-status').textContent.includes('previous request'));
 await page.locator('#server-retry').click();
 await page.waitForFunction(()=>document.getElementById('server-retry').hidden);
 await page.waitForSelector('.server-work-layer polygon',{timeout:30000});
 assert.match(await page.$eval('#server-work-count',n=>n.textContent),/^1 saved mark/);

 assert.equal(await page.evaluate(()=>window.__jtApp.entries().filter(e=>e.kind==='act').length),0,'server marks must not fabricate local act receipts');
 await (await page.$('.pdf-page[data-page="1"]')).screenshot({path:'../jett-server-highlight.png'});
 assert.ok(await page.$eval('.server-work-layer polygon',n=>{const r=n.getBoundingClientRect(),p=n.closest('.pdf-page').getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom;}));
 await page.reload();await page.waitForSelector('.pdf-page',{visible:true,timeout:60000});
 assert.equal(await page.$('.server-work-layer'),null,'reopening must not present unverified server state');
 assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('jtty-local-development')),false);
 await connect();assert.match(await page.$eval('#server-upload',n=>n.textContent),/Open saved copy/);
 await page.locator('#server-upload').click();await page.waitForSelector('.server-work-layer polygon',{timeout:30000});assert.equal(uploads,1,'reconnect should reattach without uploading again');
 await page.locator('#server-undo').click();await page.waitForFunction(()=>document.querySelectorAll('.server-work-layer polygon').length===0);
 await page.setViewport({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log(JSON.stringify({result:'PASS_LOCAL',explicitUploads:uploads,serverGeometryVisible:true,reconnectRestores:true,undoRemoves:true,tokenNotPersisted:true,lostResponseRecoveredAfterReload:true}));
}finally{await browser.close();}
