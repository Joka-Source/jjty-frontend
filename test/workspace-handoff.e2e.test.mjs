import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { root } from './validate.mjs';
test('PDF attachment review returns an independent copy to its draft', {timeout:90000}, async t=>{
 const server=await createServer({root,server:{host:'127.0.0.1',port:0}});await server.listen();t.after(()=>server.close());
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 t.after(async()=>{const timer=setTimeout(()=>browser.process()?.kill('SIGKILL'),3000);try{await browser.close();}finally{clearTimeout(timer);}});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/workspace/index.html`);
 await page.type('textarea','Please review the attached PDF.');
 await (await page.$('#file')).uploadFile(`${root}/test/fixtures/jett-fillable.pdf`);
 await page.waitForFunction(()=>document.querySelector('#attachment')?.textContent.includes('Review PDF'));
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Review PDF').click());
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Attach reviewed copy to draft'&&!b.disabled),{timeout:60000});
 await page.evaluate(()=>window.__jtApp.perform('highlight',0,{tokenStart:0,tokenEnd:1}));
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Attach reviewed copy to draft').click());
 await page.waitForFunction(()=>document.querySelector('.reviewed-copy')||[...document.querySelectorAll('aside[aria-label="Attachment review"] button')].some(b=>!b.disabled),{timeout:30000});
 assert.ok(await page.$('.reviewed-copy'),await page.$eval('body',n=>n.querySelector('aside[aria-label="Attachment review"]')?.textContent||'No returned copy'));
 assert.equal(await page.$eval('textarea',e=>e.value),'Please review the attached PDF.');
 assert.match(await page.$eval('.reviewed-copy',e=>e.textContent),/Original attachment retained/);
 const result=await page.evaluate(async()=>{const {attachmentStore}=await import('/workspace/attachments.js');const id=new URL(location.href).searchParams.get('review');const session=await attachmentStore(`handoff:${id}`);const a=await attachmentStore('Inbox'),b=await attachmentStore(`result:${session.resultId}`);return {original:a.name,result:b.name,bytes:b.size,fields:(await (await import('/src/pdf-forms.js')).inspectPdfForm(new Uint8Array(await b.arrayBuffer()))).fields.map(f=>({name:f.name,value:f.value}))};});
 assert.equal(result.original,'jett-fillable.pdf');assert.equal(result.result,'jett-fillable-reviewed.pdf');assert.ok(result.bytes>100);assert.equal(result.fields.find(f=>f.name==='full_name').value,'');
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/workspace/index.html`);await page.waitForSelector('.reviewed-copy');
});


test('Studio handoff rejects invalid sessions, guards document ownership and returns exact independent bytes', {timeout:60000}, async t=>{
 const server=await createServer({root,server:{host:'127.0.0.1',port:0}});await server.listen();t.after(()=>server.close());
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());
 const page=await browser.newPage(),base=`http://127.0.0.1:${server.httpServer.address().port}`;
 await page.goto(`${base}/studio/index.html`);
 const setup=await page.evaluate(async()=>{
  const api=await import('/workspace/pdf-handoff.js'),{attachmentStore}=await import('/workspace/attachments.js');
  const bytes=new Uint8Array(await (await fetch('/test/fixtures/jett-fillable.pdf')).arrayBuffer()),file=new File([bytes],'original.pdf',{type:'application/pdf'});
  const errors=[];for(const action of [()=>api.startPdfHandoff('https://evil.invalid',file),()=>api.readPdfHandoff('bad')]){try{await action();errors.push(null);}catch(e){errors.push(e.message);}}
  const invalid=crypto.randomUUID();await attachmentStore(`handoff:${invalid}`,{id:invalid,destination:'https://evil.invalid'});
  try{await api.readPdfHandoff(invalid);errors.push(null);}catch(e){errors.push(e.message);}
  const id=await api.startPdfHandoff('Studio',file);history.replaceState(null,'',`/studio/index.html?workspaceSession=${id}`);
  let current={id:'wrong'};let exports=0;const expected=bytes.slice();expected[expected.length-1]=10;
  const {mountWorkspaceReturn}=await import('/src/workspace-return.js');
  await mountWorkspaceReturn({importFile:async()=>({id:'owned-document'}),getDocument:async()=>null,openDocument:async()=>{},currentDocument:()=>current,exportDocument:async()=>{exports++;return expected;}});
  const bar=document.querySelector('[aria-label="Attachment review"]');await bar.querySelector('button').onclick();
  const guard={message:bar.textContent,exports,back:bar.querySelector('a').getAttribute('href'),label:bar.querySelector('button').textContent};
  window.testStudioRelease=()=>{current={id:'owned-document'};};
  return {id,errors,guard,expected:Array.from(expected),original:Array.from(bytes)};
 });
 assert.ok(setup.errors.every(Boolean));assert.equal(setup.guard.exports,0);assert.match(setup.guard.message,/Reopen this attachment/);
 assert.equal(setup.guard.back,`/studio/index.html?review=${setup.id}#files`);assert.equal(setup.guard.label,'Save reviewed copy to Jetty');
 await page.evaluate(()=>{window.testStudioRelease();document.querySelector('[aria-label="Attachment review"] button').click();});
 await page.waitForFunction(id=>location.search===`?review=${id}`&&location.hash==='#files',{},setup.id);
 const result=await page.evaluate(async id=>{const {readPdfHandoff}=await import('/workspace/pdf-handoff.js'),{attachmentStore}=await import('/workspace/attachments.js');const session=await readPdfHandoff(id),file=await attachmentStore(`result:${session.resultId}`);return {session:{status:session.status,documentId:session.documentId,destination:session.destination},original:Array.from(new Uint8Array(await session.file.arrayBuffer())),result:Array.from(new Uint8Array(await file.arrayBuffer())),name:file.name};},setup.id);
 assert.deepEqual(result.session,{status:'returned',documentId:'owned-document',destination:'Studio'});assert.deepEqual(result.original,setup.original);assert.deepEqual(result.result,setup.expected);assert.equal(result.name,'original-reviewed.pdf');
});
