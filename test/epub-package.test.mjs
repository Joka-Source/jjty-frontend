import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {openEpubPackage,resolveEpubHref,EPUB_LIMITS} from '../src/epub-package.js';import {makeEpubFixture} from './epub-fixture.mjs';
const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
for(const version of [2,3])test(`EPUB${version} preserves canonical spine, nested contents and binary resource identity`,async()=>{
 const bytes=await makeEpubFixture({version}),before=bytes.slice(),book=await openEpubPackage(bytes);assert.deepEqual(bytes,before);assert.equal(book.title,'Orchard पुस्तक');assert.equal(book.language,'en');assert.equal(book.layout,'reflowable');assert.deepEqual(book.spine.map(p=>p.href),['Book/chapters/one.xhtml','Book/chapters/two.xhtml']);assert.equal(book.toc[0].children[0].href,'Book/chapters/two.xhtml#note');assert.equal(book.manifest.find(p=>p.id==='image').mediaType,'image/png');assert.equal(book.resources.get('Book/images/dot.png')[0],137);
});
test('fixed layout, RTL and script metadata remain explicit rather than fabricated support',async()=>{const book=await openEpubPackage(await makeEpubFixture({layout:'pre-paginated',direction:'rtl',entries:{'Book/script.js':'throw new Error("never execute")'}}));assert.equal(book.layout,'pre-paginated');assert.equal(book.direction,'rtl');assert.ok(book.resources.has('Book/script.js'));});
test('publication URI resolution permits internal parents and fragments but refuses escape/remote URLs',()=>{
 assert.equal(resolveEpubHref('../images/dot.png','Book/chapters/one.xhtml'),'Book/images/dot.png');assert.equal(resolveEpubHref('#opening','Book/chapters/one.xhtml'),'Book/chapters/one.xhtml#opening');for(const href of ['../../../escape','https://example.org/x','//example.org/x','%2fescape','..\\x','../../%2e%2e/x'])assert.throws(()=>resolveEpubHref(href,'Book/chapters/one.xhtml'),/EPUB_PATH_INVALID/);
});
test('missing spine resources, corrupt XML, encryption and traversal refuse before publication',async()=>{
 await assert.rejects(openEpubPackage(await makeEpubFixture({remove:['Book/chapters/two.xhtml']})),/EPUB_RESOURCE_MISSING/);
 await assert.rejects(openEpubPackage(await makeEpubFixture({entries:{'META-INF/container.xml':'<container>'}})),/EPUB_XML_INVALID/);
 await assert.rejects(openEpubPackage(await makeEpubFixture({entries:{'META-INF/encryption.xml':'<encryption/>'}})),/EPUB_ENCRYPTED_UNSUPPORTED/);
 await assert.rejects(openEpubPackage(await makeEpubFixture({entries:{'../escape':'unsafe'}})),/EPUB_PATH_INVALID/);
});
test('expanded entry budgets and lying ZIP sizes cannot allocate the complete oversized resource',async()=>{
 const large=await makeEpubFixture({entries:{'large.txt':'x'.repeat(EPUB_LIMITS.entryBytes+1)}});await assert.rejects(openEpubPackage(large),/EPUB_ENTRY_LIMIT/);
 // Lie in central directory so the streaming actual-byte guard, not advertised
 // metadata, must stop retaining inflated output.
 const lied=large.slice(),v=new DataView(lied.buffer);for(let i=0;i<lied.length-46;i++)if(v.getUint32(i,true)===0x02014b50){const length=v.getUint16(i+28,true);if(new TextDecoder().decode(lied.subarray(i+46,i+46+length))==='large.txt')v.setUint32(i+24,1,true);}
 await assert.rejects(openEpubPackage(lied),/EPUB_ENTRY_LIMIT/);
});
test('duplicate central names and corrupt compressed resources refuse',async()=>{
 const bytes=await makeEpubFixture(),duplicate=bytes.slice(),view=new DataView(duplicate.buffer);let changed=false;for(let i=0;i<duplicate.length-46;i++)if(view.getUint32(i,true)===0x02014b50){const length=view.getUint16(i+28,true),name=new TextDecoder().decode(duplicate.subarray(i+46,i+46+length));if(name==='Book/chapters/two.xhtml'){duplicate.set(new TextEncoder().encode('Book/chapters/one.xhtml'),i+46);changed=true;break;}}assert.ok(changed);await assert.rejects(openEpubPackage(duplicate),/EPUB_DUPLICATE_ENTRY/);
 const corrupt=bytes.slice(),v=new DataView(corrupt.buffer);for(let i=0;i<corrupt.length-46;i++)if(v.getUint32(i,true)===0x02014b50){v.setUint32(i+16,v.getUint32(i+16,true)^1,true);break;}await assert.rejects(openEpubPackage(corrupt),/EPUB_ARCHIVE_CORRUPT/);
});
