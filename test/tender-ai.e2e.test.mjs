import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {preview} from 'vite';
import puppeteer from 'puppeteer-core';

const root=path.resolve(import.meta.dirname,'..');

test('Kothali AI review is explicit, grounded, persistent and cannot advance the bid',{timeout:180000},async t=>{
 const source=Buffer.from('%PDF-1.4\nTender closes 18 September 2026 at 5:00 PM.\n%%EOF');
 const hash=createHash('sha256').update(source).digest('hex');
 let analyses=0,received='',requests=[];
 const ai=createServer((request,response)=>{
  requests.push(`${request.method} ${request.url}`);
  response.setHeader('access-control-allow-origin','*');response.setHeader('access-control-allow-methods','GET,POST,OPTIONS');response.setHeader('access-control-allow-headers','content-type');response.setHeader('access-control-allow-private-network','true');response.setHeader('content-type','application/json');
  if(request.method==='OPTIONS'){response.statusCode=204;return response.end();}
  if(request.url==='/health')return response.end(JSON.stringify({status:'ready',parser:'FakeParser',reasoner:'FakeReasoner',authority:'advisory_only'}));
  if(request.url==='/v1/tenders/analyze'&&request.method==='POST'){
   analyses+=1;const chunks=[];request.on('data',chunk=>chunks.push(chunk));request.on('end',()=>{
    received=Buffer.concat(chunks).toString('latin1');
    response.end(JSON.stringify({schema:'jjty-tender-analysis-v1',state:'ready_for_review',summary:'One deadline needs review.',documents:[{name:'Tendernotice_1.pdf',sha256:hash,size:source.length}],findings:[{kind:'deadline',title:'Submission deadline',detail:'Confirm this against current corrigenda.',evidence:{document_sha256:hash,page:1,quote:'18 September 2026 at 5:00 PM'}}],authority:'advisory_only',submission_allowed:false}));
   });return;
  }
  response.statusCode=404;response.end(JSON.stringify({detail:'not found'}));
 });
 await new Promise(resolve=>ai.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>ai.close(resolve)));
 const site=await preview({root,preview:{host:'127.0.0.1',port:0}});t.after(()=>new Promise(resolve=>{site.httpServer.closeAllConnections?.();site.httpServer.close(resolve);}));
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(async()=>{const timer=setTimeout(()=>browser.process()?.kill('SIGKILL'),3000);try{await browser.close();}finally{clearTimeout(timer);}});
 const dir=await mkdtemp(path.join(tmpdir(),'kothali-ai-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'Tendernotice_1.pdf');await writeFile(file,source);
 const page=await browser.newPage(),errors=[],browserRequests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>browserRequests.push(request.url()));await page.evaluateOnNewDocument(url=>{globalThis.__JJTY_TENDER_AI_URL__=url;},`http://127.0.0.1:${ai.address().port}`);
 await page.goto(`http://127.0.0.1:${site.httpServer.address().port}/workspace/index.html#Tenders`);await page.waitForSelector('#tender-ai-review',{timeout:10000}).catch(async error=>{throw Error(`${error.message}\nPage errors: ${errors.join(' | ')}\nBody: ${(await page.$eval('body',node=>node.innerText)).slice(0,1200)}`);});
 await page.waitForFunction(()=>document.querySelector('#tender-ai-service-state').textContent.includes('Local service ready'),{timeout:5000}).catch(async error=>{const config=await page.evaluate(()=>globalThis.__JJTY_TENDER_AI_URL__);throw Error(`${error.message}; state=${await page.$eval('#tender-ai-service-state',node=>node.textContent)}; service error=${await page.$eval('.tender-ai',node=>node.dataset.serviceError)}; config=${config}; server requests=${requests.join(',')}; browser requests=${browserRequests.join(',')}; errors=${errors.join(' | ')}`);});
 assert.equal(analyses,0);
 await (await page.$('[data-upload=nit]')).uploadFile(file);await page.waitForSelector('[data-reviewed=nit]');
 assert.equal(await page.$eval('[data-reviewed=nit]',node=>node.checked),false);
 assert.equal(await page.$eval('#eligibility',node=>node.checked),false);
 await page.click('#tender-ai-review');await page.waitForFunction(()=>document.querySelector('#tender-status').textContent.includes('AI document review saved'),{timeout:30000});
 assert.equal(analyses,1);assert.match(received,/Tender closes 18 September 2026/);
 assert.match(await page.$eval('.tender-ai-findings',node=>node.textContent),/Submission deadline/);
 assert.match(await page.$eval('.tender-ai-findings',node=>node.textContent),/Page 1/);
 assert.equal(await page.$eval('[data-reviewed=nit]',node=>node.checked),false);
 assert.equal(await page.$eval('#eligibility',node=>node.checked),false);
 await page.reload();await page.waitForSelector('.tender-ai-findings');assert.match(await page.$eval('.tender-ai-findings',node=>node.textContent),/18 September 2026/);
 const replacement=Buffer.from('%PDF-1.4\nReplacement source\n%%EOF');await writeFile(file,replacement);await (await page.$('[data-upload=nit]')).uploadFile(file);
 await page.waitForFunction(()=>document.querySelector('#tender-status').textContent.includes('Notice inviting tender added'));
 assert.equal(await page.$('.tender-ai-findings'),null);
 assert.match(await page.$eval('.tender-ai-empty',node=>node.textContent),/Run a new review/);
 assert.deepEqual(errors,[]);
});
