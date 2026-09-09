import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {prepareEpubChapter} from '../src/epub-content.js';
import {openEpubPackage} from '../src/epub-package.js';
import {makeEpubFixture} from './epub-fixture.mjs';
const xmlWindow=new JSDOM('').window;globalThis.DOMParser=xmlWindow.DOMParser;
const encode=value=>new TextEncoder().encode(value);
function environment(){const window=new JSDOM('<!doctype html><body><div class="outside">Outside</div></body>',{url:'https://reader.invalid/'}).window,blobs=[],revoked=[];window.URL.createObjectURL=blob=>{blobs.push(blob);return `blob:https://reader.invalid/${blobs.length}`;};window.URL.revokeObjectURL=url=>revoked.push(url);return {window,document:window.document,blobs,revoked};}
function bookOf(html,extra=[]){return {spine:[{href:'Book/chapter.xhtml',mediaType:'application/xhtml+xml'}],resources:new Map([['Book/chapter.xhtml',encode(html)],...extra.map(([path,mime,data])=>[path,typeof data==='string'?encode(data):data])]),manifest:[{href:'Book/chapter.xhtml',mediaType:'application/xhtml+xml'},...extra.map(([href,mediaType])=>({href,mediaType}))]};}
function render(book,env=environment(),scopeId='epub-test'){const result=prepareEpubChapter(book,0,{document:env.document,scopeId});env.document.body.append(result.element);return {...env,...result};}

test('EPUB2/3 semantic chapters preserve publisher styles, emphasis, Unicode, local images and canonical footnote links',async()=>{
 for(const version of [2,3]){const book=await openEpubPackage(await makeEpubFixture({version})),r=render(book);
 assert.equal(r.element.querySelector('h1').textContent,'The orchard');assert.equal(r.element.querySelector('em').textContent,'carefully');assert.match(r.blocks.map(b=>b.text).join(' '),/नमस्ते दुनिया/);
 assert.match(r.element.querySelector('style').textContent,/#epub-test\{color:#202020\}/);assert.equal(r.window.getComputedStyle(r.element.querySelector('em')).fontStyle,'italic');
 assert.equal(r.element.querySelector('img').getAttribute('src'),'blob:https://reader.invalid/1');assert.equal(r.blobs[0].type,'image/png');
 assert.equal(r.element.querySelector('a').dataset.epubHref,'Book/chapters/two.xhtml#note');assert.equal(r.element.querySelector('h1').dataset.epubId,'opening');
 assert.ok(r.blocks.every(b=>b.text===b.element.textContent&&b.text===b.text.trim()));assert.deepEqual(r.warnings,[],'ordinary title and namespace metadata are not active-markup warnings');
 r.dispose();r.dispose();assert.equal(r.revoked.length,1);assert.equal(r.element.isConnected,false);r.window.close();}
});
test('active HTML and external resource channels are removed before mounting',()=>{
 const html=`<html><head><base href="https://evil.invalid/"><meta http-equiv="refresh" content="0;url=https://evil.invalid/"><link rel="preload" href="https://evil.invalid/x"></head><body onload="window.pwned=1"><script>window.pwned=1</script><iframe src="https://evil.invalid/"></iframe><object data="https://evil.invalid/"></object><form action="https://evil.invalid/"><input name="location"></form><p onclick="window.pwned=1">Safe <em>words</em></p><img src="https://evil.invalid/pixel" srcset="https://evil.invalid/2 2x" onerror="window.pwned=1"><a href="javascript:alert(1)" ping="https://evil.invalid/">No action</a><a href="https://evil.invalid/">External</a><svg><script>alert(1)</script></svg></body></html>`;
 const r=render(bookOf(html));assert.equal(r.element.querySelector('script,iframe,object,form,input,base,meta,svg,link'),null);assert.equal(r.element.querySelector('[onclick],[onerror],[onload],[srcset],[ping]'),null);assert.equal(r.element.querySelector('[src]'),null);assert.ok([...r.element.querySelectorAll('a')].every(a=>!a.hasAttribute('href')));assert.ok(r.warnings.length);assert.equal(r.window.pwned,undefined);r.window.close();
});
test('publisher CSS cannot escape chapter scope or load remote URLs through functions, imports or inline declarations',()=>{
 const r=render(bookOf(`<html><head><style>@import "https://evil.invalid/import"; +div{color:red} ~.outside{color:red} body + div {color:red} body ~ .outside{background-color:red} body.foo + .outside{color:red} html body .kept{color:blue} :root{position:fixed;inset:0;z-index:999999} .x{background-image:url(https://evil.invalid/image);list-style-image:image-set("https://evil.invalid/image" 1x);--s: url(https://evil.invalid/custom);color:green} @media screen {p {margin:1em}} .x:has(+div){color:red} .x::before{content:url(https://evil.invalid/content)}</style></head><body><p class="kept x" style="position:fixed; background-image:url(https://evil.invalid/inline);color:purple">Keep me</p></body></html>`));
 const css=r.element.querySelector('style').textContent;assert.doesNotMatch(css,/evil|@import|image-set|position|z-index|\+|~|:has|::before|--s/);assert.match(css,/#epub-test \.kept/);assert.match(css,/@media screen/);assert.equal(r.element.querySelector('p').style.position,'');assert.equal(r.element.querySelector('p').style.color,'purple');assert.notEqual(r.window.getComputedStyle(r.document.querySelector('.outside')).color,'rgb(255, 0, 0)');assert.equal(r.blobs.length,0);r.window.close();
});
test('local fonts and CSS images become owned blobs, font names are chapter-specific and SVG cannot retain nested loads',()=>{
 const r=render(bookOf(`<html><head><link rel="stylesheet" href="style.css"></head><body><p style="font-family: Publisher,serif">Font sample</p><img src="figure.svg" alt="Diagram"></body></html>`,[
 ['Book/style.css','text/css','@font-face{font-family:Publisher;src:url(font.woff2) format("woff2")} p{font-family:Publisher,serif;background-image:url(dot.png)}'],
 ['Book/font.woff2','font/woff2',new Uint8Array([119,79,70,50])],['Book/dot.png','image/png',new Uint8Array([137,80,78,71])],['Book/figure.svg','image/svg+xml','<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://evil.invalid/nested"/><rect width="20" height="20" fill="red" style="filter:url(https://evil.invalid/filter)"/></svg>']
 ]));
 const css=r.element.querySelector('style').textContent;assert.match(css,/@font-face\{font-family:"epub-test-font-0"/);assert.match(css,/blob:https:\/\/reader.invalid/);assert.match(css,/,serif/);assert.match(r.element.querySelector('p').style.fontFamily,/epub-test-font-0/);assert.deepEqual(r.blobs.map(b=>b.type),['font/woff2','image/png','image/svg+xml']);r.dispose();assert.equal(r.revoked.length,3);r.window.close();
});
test('block locators survive typography changes and preserve nested lists without duplicate text or flattened inline markup',()=>{
 const book=bookOf('<body><h2>  A <em>heading</em> </h2><ul><li> First <strong>item</strong><ul><li>Nested</li></ul> Tail </li></ul><pre>  code\n indented  </pre><p> Last </p></body>'),r=render(book);
 const texts=r.blocks.map(b=>b.text);assert.deepEqual(texts,['A heading','First item','Nested','Tail','code\n indented','Last']);assert.equal(r.blocks[4].kind,'code');assert.ok(r.element.querySelector('li strong'));assert.ok(r.element.querySelector('h2 em'));assert.ok(r.blocks.every(b=>b.element.textContent===b.text));
 r.element.style.fontSize='30px';const other=render(book,environment(),'epub-other');assert.deepEqual(r.blocks.map(b=>b.locator),other.blocks.map(b=>b.locator));r.window.close();other.window.close();
});
test('plain inline chapters do not turn publisher CSS into an annotation block',()=>{
 const r=render(bookOf('<html><head><style>span{color:red}</style></head><body> Hello <em>world</em> </body></html>'));assert.equal(r.blocks.length,1);assert.equal(r.blocks[0].text,'Hello world');assert.equal(r.blocks[0].element.textContent,'Hello world');assert.ok(r.element.classList.contains('epub-chapter'));r.window.close();
});

test('real browser mounting retains local image while hostile HTML/CSS/SVG makes zero external requests',{timeout:30000},async t=>{
 const {createServer}=await import('vite'),{default:puppeteer}=await import('puppeteer-core');
 const server=await createServer({configFile:false,root:new URL('..',import.meta.url).pathname,server:{host:'127.0.0.1',port:0},plugins:[{name:'epub-test-page',configureServer(server){server.middlewares.use('/__epub_probe',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><body><div class="outside">Outside</div></body>');});}}]});await server.listen();t.after(()=>server.close());
 const origin=`http://127.0.0.1:${server.httpServer.address().port}`,browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});t.after(()=>browser.close());const page=await browser.newPage(),external=[];
 await page.setRequestInterception(true);page.on('request',request=>{if(!request.url().startsWith(origin+'/')&&!request.url().startsWith('blob:')&&!request.url().startsWith('data:')){external.push(request.url());void request.abort();}else void request.continue();});
 await page.goto(origin+'/__epub_probe');
 const result=await page.evaluate(async()=>{
  const {prepareEpubChapter}=await import('/src/epub-content.js'),enc=new TextEncoder();
  const html='<html><head><style>@import "https://evil.invalid/import"; body + .outside{color:red} p{background-image:image-set("https://evil.invalid/image" 1x)} </style></head><body onload="window.pwned=true"><script>window.pwned=true</script><img src="https://evil.invalid/pixel" onerror="window.pwned=true"><iframe src="https://evil.invalid/frame"></iframe><h1>Publisher chapter</h1><p>Keep <em>this text</em></p><img src="local.svg" alt="Safe diagram"></body></html>';
  const book={spine:[{href:'a.xhtml'}],resources:new Map([['a.xhtml',enc.encode(html)],['local.svg',enc.encode('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><style>@import "https://evil.invalid/svgstyle";</style><image href="https://evil.invalid/nested"/><rect width="20" height="20" fill="red"/></svg>')]]),manifest:[{href:'a.xhtml',mediaType:'application/xhtml+xml'},{href:'local.svg',mediaType:'image/svg+xml'}]};
  const chapter=prepareEpubChapter(book,0,{document,scopeId:'epub-live'});document.body.append(chapter.element);const image=chapter.element.querySelector('img[src]');await image.decode();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const svg=await(await fetch(image.src)).text();
  const result={text:chapter.blocks.map(b=>b.text),svg,imageWidth:image.naturalWidth,pwned:window.pwned??false,outside:getComputedStyle(document.querySelector('.outside')).color};chapter.dispose();return result;
 });
 assert.deepEqual(external,[]);assert.equal(result.imageWidth,20);assert.equal(result.pwned,false);assert.doesNotMatch(result.svg,/evil|<style|<image|<script/);assert.deepEqual(result.text,['Publisher chapter','Keep this text']);assert.notEqual(result.outside,'rgb(255, 0, 0)');
});
