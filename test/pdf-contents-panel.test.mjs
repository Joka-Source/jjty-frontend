import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';
const url='http://127.0.0.1:4983';
const html=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/style.css"><link rel="stylesheet" href="/src/jett.css"><details id="pdf-contents" class="server-panel"><summary>Contents</summary><p id="pdf-contents-status" role="status"></p><button id="pdf-contents-back">Back to reading place</button><nav aria-label="PDF contents"><ol id="pdf-contents-list"></ol></nav></details><script type="module">
import {initPdfContents} from '/src/pdf-contents.js';
window.moves=[];window.returns=[];window.placeReads=[];window.allowNavigate=true;window.allowReturn=true;
window.controller=initPdfContents({onNavigate(page,owner){moves.push({page,id:owner.id});return window.navigatePromise??allowNavigate;},getPlace(owner){placeReads.push(owner.id);return {pageNumber:7,offset:0.25};},onReturn(place,owner){returns.push({place,id:owner.id});return allowReturn;}});
window.ready=true;</script>`;
test('PDF contents controller preserves document ownership and explicit return place',{timeout:60000},async t=>{
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4983','--strictPort'],{cwd:root,stdio:'ignore'});t.after(()=>server.kill('SIGTERM'));
 for(let i=0;i<80;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===79)throw new Error('Vite unavailable');await new Promise(r=>setTimeout(r,100));}
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());
 async function pageFor(t){const page=await browser.newPage();t.after(()=>page.close());await page.setRequestInterception(true);page.on('request',r=>r.url()===url+'/__contents.html'?r.respond({status:200,contentType:'text/html',body:html}):r.continue());await page.goto(url+'/__contents.html');await page.waitForFunction(()=>window.ready);return page;}
 await t.test('nested literal titles, unsupported destination and one original return place',async t=>{
  const page=await pageFor(t);await page.evaluate(async()=>{
   await controller.setSource({id:'A',readContents:async()=>[{title:'<img src=x onerror="window.injected=true">',pageNumber:2,open:false,children:[{title:'Unicode 水\nchild',pageNumber:5,open:false,children:[]}]},{title:'External',pageNumber:null,open:false,children:[]}]});
   document.getElementById('pdf-contents').open=true;
  });
  assert.equal(await page.$eval('.pdf-contents-toggle',n=>n.getAttribute('aria-expanded')),'false');
  assert.equal(await page.$eval('#pdf-contents-list ol',n=>n.hidden),true);
  assert.equal(await page.$eval('.pdf-contents-target',n=>n.firstChild.textContent),'<img src=x onerror="window.injected=true">');
  assert.equal(await page.$$eval('#pdf-contents-list img',n=>n.length),0);
  assert.equal(await page.evaluate(()=>window.injected),undefined);
  await page.focus('.pdf-contents-toggle');await page.keyboard.press('Enter');
  assert.equal(await page.$eval('.pdf-contents-toggle',n=>n.getAttribute('aria-expanded')),'true');
  assert.equal(await page.$eval('#pdf-contents-list ol',n=>n.hidden),false);
  assert.equal(await page.$$eval('.pdf-contents-target',n=>n.at(-1).disabled),true);
  await page.evaluate(()=>{document.querySelectorAll('.pdf-contents-target')[0].click();document.querySelectorAll('.pdf-contents-target')[1].click();});
  assert.deepEqual(await page.evaluate(()=>moves),[{page:2,id:'A'},{page:5,id:'A'}]);
  assert.deepEqual(await page.evaluate(()=>placeReads),['A'],'second jump keeps first departure point');
  await page.evaluate(()=>{allowReturn=false;});await page.click('#pdf-contents-back');
  assert.equal(await page.$eval('#pdf-contents-back',n=>n.disabled),false,'failed return keeps original place');
  await page.evaluate(()=>{allowReturn=true;});await page.click('#pdf-contents-back');
  assert.equal(await page.$eval('#pdf-contents-back',n=>n.disabled),true);
  assert.deepEqual(await page.evaluate(()=>returns),Array(2).fill({place:{pageNumber:7,offset:0.25},id:'A'}));
 });
 await t.test('empty and failed contents preserve informative state without old rows',async t=>{
  const page=await pageFor(t);await page.evaluate(()=>controller.setSource({id:'empty',readContents:async()=>[]}));
  assert.equal(await page.$eval('#pdf-contents',n=>n.hidden),false);
  assert.match(await page.$eval('#pdf-contents-status',n=>n.textContent),/no readable bookmarks/);
  await page.evaluate(()=>controller.setSource({id:'failed',readContents:async()=>{throw Error('private error detail');}}));
  assert.equal(await page.$$eval('.pdf-contents-target',n=>n.length),0);
  assert.match(await page.$eval('#pdf-contents-status',n=>n.textContent),/Contents could not be read.*still read and search/);
  await page.evaluate(()=>controller.setSource(null));assert.equal(await page.$eval('#pdf-contents',n=>n.hidden),true);
 });
 for(const reject of [false,true])await t.test('late '+(reject?'rejection':'resolution')+' cannot replace newer source',async t=>{
  const page=await pageFor(t);await page.evaluate(()=>{
   window.pending=controller.setSource({id:'old',readContents:()=>new Promise((resolve,reject)=>{window.finishOld=resolve;window.failOld=reject;})});
  });
  await page.evaluate(()=>controller.setSource({id:'new',readContents:async()=>[{title:'Newer',pageNumber:3,open:false,children:[]}]}));
  await page.evaluate(async reject=>{if(reject)failOld(Error('old failure'));else finishOld([{title:'Old',pageNumber:1,open:false,children:[]}]);await pending;},reject);
  assert.deepEqual(await page.$$eval('.pdf-contents-target',n=>n.map(x=>x.firstChild.textContent)),['Newer']);
  assert.match(await page.$eval('#pdf-contents-status',n=>n.textContent),/Choose a bookmark/);
 });
 await t.test('detached target and removed-source completion cannot navigate or revive panel',async t=>{
  const page=await pageFor(t);await page.evaluate(async()=>{
   await controller.setSource({id:'old',readContents:async()=>[{title:'Old',pageNumber:2,open:false,children:[]}]});window.detached=document.querySelector('.pdf-contents-target');
   await controller.setSource({id:'new',readContents:async()=>[]});detached.click();
   window.pending=controller.setSource({id:'held',readContents:()=>new Promise(resolve=>window.finish=resolve)});
   await controller.setSource(null);finish([{title:'Late',pageNumber:1,open:false,children:[]}]);await pending;
  });
  assert.deepEqual(await page.evaluate(()=>moves),[]);assert.equal(await page.$eval('#pdf-contents',n=>n.hidden),true);
  assert.equal(await page.$$eval('.pdf-contents-target',n=>n.length),0);
  assert.equal(await page.$eval('#pdf-contents-back',n=>n.disabled),true);
 });
 await t.test('async navigation waits, reports rejection and ignores stale completion',async t=>{
  const page=await pageFor(t);await page.evaluate(async()=>{
   await controller.setSource({id:'old',readContents:async()=>[{title:'Old',pageNumber:2,children:[]}]});
   window.navigatePromise=new Promise((resolve,reject)=>{window.resolveMove=resolve;window.rejectMove=reject;});
   document.querySelector('.pdf-contents-target').click();
  });
  assert.match(await page.$eval('#pdf-contents-status',n=>n.textContent),/Choose a bookmark/);
  await page.evaluate(()=>rejectMove(Error('Save your note first.')));
  await page.waitForFunction(()=>document.getElementById('pdf-contents-status').textContent==='Save your note first.');
  assert.equal(await page.$eval('#pdf-contents-back',n=>n.disabled),true);
  await page.evaluate(async()=>{
   window.navigatePromise=new Promise(resolve=>window.resolveMove=resolve);document.querySelector('.pdf-contents-target').click();
   await controller.setSource({id:'new',readContents:async()=>[]});resolveMove(true);
  });
  assert.match(await page.$eval('#pdf-contents-status',n=>n.textContent),/no readable bookmarks/);
  assert.equal(await page.$eval('#pdf-contents-back',n=>n.disabled),true);
 });
 await t.test('32-level contents stay readable and touchable at 375px',async t=>{
  const page=await pageFor(t);await page.setViewport({width:375,height:812,deviceScaleFactor:1});
  await page.evaluate(async()=>{
   let children=[];for(let i=32;i>=1;i--)children=[{title:'Level '+i+' Long distinctive bookmark title requiring several words',pageNumber:i,open:true,children}];
   await controller.setSource({id:'deep',readContents:async()=>children});document.getElementById('pdf-contents').open=true;
  });
  const geometry=await page.evaluate(()=>{
   const nav=document.querySelector('#pdf-contents nav'),nr=nav.getBoundingClientRect();
   const targets=[...document.querySelectorAll('.pdf-contents-target')],last=targets.at(-1).getBoundingClientRect();
   return {width:nav.clientWidth,scroll:nav.scrollWidth,left:nr.left,right:nr.right,lastLeft:last.left,lastRight:last.right,
    toggles:[...document.querySelectorAll('.pdf-contents-toggle')].map(n=>({width:n.getBoundingClientRect().width,expanded:n.getAttribute('aria-expanded')})),
    count:targets.length,nested:document.querySelectorAll('#pdf-contents-list ol').length,labels:targets.map(n=>n.firstChild.textContent)};
  });
  assert.ok(geometry.scroll<=geometry.width,'contents must not require horizontal scrolling');
  assert.ok(geometry.lastLeft>=geometry.left&&geometry.lastRight<=geometry.right,'deepest target must fit within navigation');
  assert.ok(geometry.toggles.every(n=>n.width>=44&&n.expanded==='true'),'expand controls retain44px width and open state');
  assert.equal(geometry.count,32);assert.equal(geometry.nested,31);
  assert.deepEqual(geometry.labels,Array.from({length:32},(_,i)=>'Level '+(i+1)+' Long distinctive bookmark title requiring several words'));
 });

});
