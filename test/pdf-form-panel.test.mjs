import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {root} from './validate.mjs';

test('form answers survive delayed and failed saves while leaving and reopening the document', {timeout:60000},async t=>{
  const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4962','--strictPort'],{cwd:root,stdio:'ignore'});
  t.after(()=>server.kill('SIGTERM'));
  const url='http://127.0.0.1:4962/';let ready=false;
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,'test module server must start');
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
  t.after(()=>browser.close());
  const page=await browser.newPage();await page.setRequestInterception(true);
  page.on('request',request=>{
    if(request.isNavigationRequest()&&request.frame()===page.mainFrame())return request.respond({status:200,contentType:'text/html',body:'<!doctype html><section id="pdf-form-panel"><p id="pdf-form-status"></p><div id="pdf-form-fields"></div><input type="checkbox" id="pdf-form-include-marks"><button id="pdf-form-download">Download</button><button id="pdf-form-preview">Review</button><button id="pdf-form-retry" hidden>Retry save</button></section><dialog id="pdf-review-dialog"><button id="pdf-review-close">Close</button><p id="pdf-review-status"></p><button id="pdf-review-download">Download review</button><div id="pdf-review-pages"></div></dialog>'});
    void request.continue();
  });
  await page.goto(url);
  const source=[...await readFile(path.join(root,'test/fixtures/jett-fillable.pdf'))];
  await page.evaluate(async source=>{
    const {initPdfFormPanel}=await import('/src/pdf-form-panel.js');
    window.formProof={writes:[],saved:[]};
    window.formProof.original={id:'synthetic-form',sourceBytes:new Uint8Array(source),provenance:{sourceKind:'pdf',contentDigest:'fixture-sha',name:'jett-fillable.pdf'}};
    window.formProof.panel=initPdfFormPanel({saveDocument:doc=>new Promise((resolve,reject)=>window.formProof.writes.push({doc,resolve:()=>{window.formProof.saved.push(structuredClone(doc));resolve();},reject}))});
    await window.formProof.panel.setDocument(structuredClone(window.formProof.original));
  },source);
  const edit=async value=>page.$eval('[data-field-name="full_name"]',(n,value)=>{n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));},value);
  await edit('Retained while saving');await page.waitForFunction(()=>window.formProof.writes.length===1);
  assert.equal(await page.$eval('#pdf-form-include-marks',n=>n.disabled),true,'combined export control waits for durable answers');
  await page.evaluate(()=>{
    void window.formProof.panel.setDocument(null);
    window.formProof.reopened=window.formProof.panel.setDocument(structuredClone(window.formProof.original));
  });
  assert.equal(await page.$eval('#pdf-form-panel',n=>n.hidden),true,'reopening must wait for the pending save');
  await page.evaluate(async()=>{window.formProof.writes[0].resolve();await window.formProof.reopened;});
  assert.equal(await page.$eval('[data-field-name="full_name"]',n=>n.value),'Retained while saving');
  await edit('Retained after save failure');await page.waitForFunction(()=>window.formProof.writes.length===2);
  await page.evaluate(()=>{
    void window.formProof.panel.setDocument(null);
    window.formProof.reopened=window.formProof.panel.setDocument(structuredClone(window.formProof.original));
  });
  await page.evaluate(async()=>{window.formProof.writes[1].reject(new Error('Synthetic storage failure'));await window.formProof.reopened;});
  assert.equal(await page.$eval('[data-field-name="full_name"]',n=>n.value),'Retained after save failure');
  assert.equal(await page.$eval('#pdf-form-download',n=>n.disabled),true,'unsaved answers must not be presented as durably saved');
  assert.equal(await page.$eval('#pdf-form-include-marks',n=>n.disabled),true,'failed save disables combined export choice');
  assert.equal(await page.$eval('#pdf-form-retry',n=>n.hidden),false);
  await page.locator('#pdf-form-retry').click();await page.waitForFunction(()=>window.formProof.writes.length===3);
  await page.evaluate(()=>window.formProof.writes[2].resolve());
  await page.waitForFunction(()=>!document.getElementById('pdf-form-download').disabled);
  assert.equal(await page.$eval('#pdf-form-retry',n=>n.hidden),true);
  assert.equal(await page.evaluate(()=>Object.values(window.formProof.saved.at(-1).formDraft.values).includes('Retained after save failure')),true);
  assert.deepEqual(await page.evaluate(()=>Object.values(window.formProof.saved.at(-1).sourceBytes)),source,'draft writes retain original PDF bytes');
});
