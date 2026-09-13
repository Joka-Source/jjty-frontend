import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as m from 'mupdf';
import puppeteer from 'puppeteer-core';
import {createServer} from 'vite';
import {root} from './validate.mjs';

async function representative(){
 const source=new m.PDFDocument(),font=new m.Font('Helvetica'),fontRef=source.addSimpleFont(font),bold=new m.Font('Helvetica-Bold'),boldRef=source.addSimpleFont(bold);
 const content=`
  .95 .96 .9 rg 0 0 612 792 re f
  .16 .27 .20 rg BT /B 14 Tf 48 735 Td (FIELD NOTES / SEPTEMBER) Tj ET
  BT /B 42 Tf 48 661 Td (A day in) Tj 0 -48 Td (the orchard.) Tj ET
  BT /F 13 Tf 48 556 Td (Slow walks. Fresh air. Something worth keeping.) Tj ET
  .72 .80 .62 rg 48 236 516 284 re f
  .86 .70 .40 rg 450 446 45 45 re f
  .34 .48 .31 rg 48 236 m 48 342 164 438 312 346 c 432 270 488 314 564 388 c 564 236 l h f
  .18 .34 .27 rg 48 236 m 168 304 296 372 430 328 c 492 306 538 310 564 332 c 564 236 l h f
  .94 .91 .72 rg 240 236 m 273 276 300 288 358 290 c 322 271 310 253 298 236 c h f
  .16 .27 .20 rg BT /B 17 Tf 48 192 Td (Saturday, 26 September) Tj ET
  BT /F 12 Tf 48 166 Td (10:00  Meet by the garden gate) Tj 0 -21 Td (10:30  Walk, sketch and gather your notes) Tj 0 -21 Td (12:00  A shared table under the trees) Tj ET
  .40 .47 .39 rg BT /F 9 Tf 48 48 Td (Design specimen / sample event / original illustration) Tj ET`;
 const spec=source.addPage([0,0,612,792],0,{Font:{F:fontRef,B:boldRef}},content);source.insertPage(-1,spec);spec.destroy();fontRef.destroy();boldRef.destroy();font.destroy();bold.destroy();
 const page=source.loadPage(0),pix=page.toPixmap(m.Matrix.scale(1.4,1.4),m.ColorSpace.DeviceRGB,false),image=new m.Image(pix),pdf=new m.PDFDocument(),ref=pdf.addImage(image);
 try{const p=pdf.addPage([0,0,612,792],0,{XObject:{Im:ref}},'q 468 0 0 606 72 100 cm /Im Do Q');pdf.insertPage(-1,p);p.destroy();const bytes=pdf.saveToBuffer();try{return Array.from(bytes.asUint8Array());}finally{bytes.destroy();}}
 finally{ref.destroy();pdf.destroy();image.destroy();pix.destroy();page.destroy();source.destroy();}
}
function bounds(bytes){const pdf=new m.PDFDocument(new Uint8Array(bytes)),p=pdf.loadPage(0),st=p.toStructuredText('preserve-images');let box;try{st.walk({onImageBlock:b=>{box=[...b];}});return box;}finally{st.destroy();p.destroy();pdf.destroy();}}

test('full-size on-page image drag, reset, resize and saved-copy custody',{timeout:90000},async t=>{
 const server=await createServer({root,server:{host:'127.0.0.1',port:4994,strictPort:true}});await server.listen();
 const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 t.after(async()=>{const timer=setTimeout(()=>browser.process()?.kill('SIGKILL'),3000);try{await browser.close();}finally{clearTimeout(timer);server.httpServer.closeAllConnections();await server.close();}});
 const page=await browser.newPage();await page.setViewport({width:390,height:844});
 const artifacts='/tmp/jetty-direct-image-review';await fs.mkdir(artifacts,{recursive:true});
 await page.goto('http://127.0.0.1:4994/studio/index.html#files');await page.waitForSelector('#real-file-input');
 const original=await representative();await fs.writeFile(path.join(artifacts,'Orchard-image-review.pdf'),new Uint8Array(original));
 await page.evaluate(bytes=>{const transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(bytes)],'Orchard image study.pdf',{type:'application/pdf'}));const input=document.querySelector('#real-file-input');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));},original);
 await page.waitForFunction(()=>document.querySelector('#real-status')?.textContent.startsWith('Opened'));
 const sourceId=await page.evaluate(()=>location.hash.split('/')[1]);
 const open=async()=>{await page.click('[data-doc-action="write-panel"]');await page.click('[data-doc-action="images"]');await page.waitForFunction(()=>document.querySelector('[data-image-status]')?.dataset.state==='ready');};
 await open();
 const geometry=await page.evaluate(()=>{const frame=document.querySelector('.image-onpage-selection').getBoundingClientRect(),controls=document.querySelector('.real-context').getBoundingClientRect(),paper=document.querySelector('.real-paper').getBoundingClientRect();return {frame:{x:frame.x,y:frame.y,width:frame.width,height:frame.height,bottom:frame.bottom},controlsTop:controls.top,paperBottom:paper.bottom,viewport:innerHeight};});
 assert.ok(geometry.frame.bottom+22<geometry.controlsTop,JSON.stringify(geometry));
 assert.equal(await page.$eval('.image-precision',e=>e.open),false);
 await page.screenshot({path:path.join(artifacts,'01-selected-phone.png')});
 await page.click('[data-doc-action=zoom-in]');assert.ok(await page.$eval('.real-paper',e=>e.getBoundingClientRect().width)>geometry.frame.width);await page.click('[data-doc-action=fit]');
 assert.equal(await page.$eval('[data-doc-action=write-panel]',e=>e.getAttribute('aria-pressed')),'true');
 const frame=await page.$eval('.image-onpage-selection',e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
 await page.mouse.move(frame.x,frame.y);await page.mouse.down();await page.mouse.move(frame.x+12,frame.y+9,{steps:8});await page.mouse.up();
 assert.equal(await page.$eval('[data-image-action=apply]',e=>e.hidden),false);
 await page.screenshot({path:path.join(artifacts,'02-move-preview.png')});
 await page.click('[data-image-action=reset]');assert.equal(await page.$eval('[name=image-x]',e=>Number(e.value)),72);
 const handle=await page.$eval('[data-corner=se]',e=>{const r=e.getBoundingClientRect();return{x:r.x+22,y:r.y+22};});
 await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(handle.x-14,handle.y-18,{steps:8});await page.mouse.up();
 const expected=await page.evaluate(()=>({w:Number(document.querySelector('[name=image-width]').value),h:Number(document.querySelector('[name=image-height]').value)}));
 await page.screenshot({path:path.join(artifacts,'03-resize-preview.png')});
 await page.click('[data-image-action=apply]');
 await page.waitForFunction(id=>location.hash.split('/')[1]!==id&&document.querySelector('#real-status')?.textContent.startsWith('Opened'),{},sourceId);
 const saved=await page.evaluate(async id=>{const db=await import('/src/db.js'),copy=await db.getDoc(location.hash.split('/')[1]),source=await db.getDoc(id);return{bytes:Array.from(copy.sourceBytes),original:Array.from(source.sourceBytes),parent:copy.provenance.derivedFrom};},sourceId);
 assert.deepEqual(saved.original,original);const box=bounds(saved.bytes);assert.ok(Math.abs(box[2]-box[0]-expected.w)<.1);assert.ok(Math.abs(box[3]-box[1]-expected.h)<.1);assert.equal(saved.parent.documentId,sourceId);assert.equal(saved.parent.operation,'image-resize');
 await open();await page.screenshot({path:path.join(artifacts,'04-saved-resize.png')});
 await page.click('[data-a=theme]');await page.screenshot({path:path.join(artifacts,'05-dark.png')});
 const cdp=await page.createCDPSession();await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-reduced-transparency',value:'reduce'},{name:'prefers-contrast',value:'more'}]});
 assert.deepEqual(await page.evaluate(()=>['(prefers-reduced-motion: reduce)','(prefers-reduced-transparency: reduce)','(prefers-contrast: more)'].map(q=>matchMedia(q).matches)),[true,true,true]);
 await page.screenshot({path:path.join(artifacts,'06-accessible-material.png')});
 await page.setViewport({width:800,height:126});await page.click('.image-precision summary');
 const keyboard=await page.$eval('.real-context',e=>{const r=e.getBoundingClientRect();return{y:r.y,height:r.height,bottom:r.bottom};});assert.equal(keyboard.y,0);assert.equal(keyboard.height,126);assert.equal(keyboard.bottom,126);
 await page.locator('[name=image-x]').fill('80');await page.screenshot({path:path.join(artifacts,'07-keyboard-precision.png')});
 await fs.writeFile(path.join(artifacts,'geometry.json'),JSON.stringify({geometry,expected,bounds:box,originalRetained:true},null,2));
});
