import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {encodeLibraryBackup,decodeLibraryBackup,validateLibrarySnapshot} from '../src/library-backup.js';
import {createAnchor} from '../src/anchors.js';
const at='2026-09-08T12:00:00.000Z';
function fixture(){
 const sourceBytes=new TextEncoder().encode('The orchard is ready.');const contentDigest='sha256:'+createHash('sha256').update(sourceBytes).digest('hex');
 const doc={id:'doc-test',title:'Orchard <script>',text:'The orchard is ready.',createdAt:at,revision:1,sourceBytes,blocks:[{text:'The orchard is ready.',index:0,kind:'paragraph'}],provenance:{contentDigest,byteSize:sourceBytes.length,sourceKind:'text',capturedAt:at}};
 const anchor=createAnchor({blockTexts:[doc.text],blockIndex:0,tokenStart:0,tokenEnd:2,docDigest:contentDigest});
 return {docs:[doc],records:[{id:'mark',docId:doc.id,kind:'act',act:'highlight',blockIndex:0,createdAt:at,anchor,noteText:'Unicode नमस्ते\n<script>literal</script>',undone:false}],positions:[{docId:doc.id,revision:1,blockIndex:0,blockCount:1,updatedAt:at}]};
}
test('round trip preserves source bytes, anchors, literal note text and safe local data',async()=>{
 const source=fixture();source.docs[0].formDraft={sourceDigest:source.docs[0].provenance.contentDigest,values:{checkbox:true,name:'Reader',token:'A real PDF answer',constructor:'Another answer',settings:'Plain field text'}};
 source.records[0].receipt={sourceId:source.docs[0].id,sourceRevision:'r1',arrival:'approximate'};
 const original=structuredClone(source);const text=await encodeLibraryBackup(source), restored=await decodeLibraryBackup(text);
 assert.equal(JSON.parse(text).format,'jt-library-backup');assert.ok(restored.docs[0].sourceBytes instanceof Uint8Array);
 assert.deepEqual(restored.docs,source.docs);assert.deepEqual(restored.records[0].anchor,source.records[0].anchor);assert.equal(restored.records[0].noteText,source.records[0].noteText);
 assert.deepEqual(restored.records[0].receipt,source.records[0].receipt);assert.deepEqual(restored.positions,source.positions);assert.deepEqual(source,original);
});
test('binary PDF original round trips exactly',async()=>{
 const source=fixture(),data=new Uint8Array(await readFile(new URL('./fixtures/jett-fillable.pdf',import.meta.url)));
 source.docs[0].sourceBytes=data;Object.assign(source.docs[0].provenance,{sourceKind:'pdf',byteSize:data.length,contentDigest:'sha256:'+createHash('sha256').update(data).digest('hex')});source.records=[];
 const restored=await decodeLibraryBackup(await encodeLibraryBackup(source));assert.deepEqual(restored.docs[0].sourceBytes,data);
});
test('legacy plain text documents without source bytes or provenance are preserved',async()=>{
 const source=fixture();delete source.docs[0].provenance;delete source.docs[0].sourceBytes;delete source.docs[0].blocks;source.records=[];
 assert.deepEqual(await decodeLibraryBackup(await encodeLibraryBackup(source)),source);
});
test('restore strips document connection authority and recomputes cached anchor trust',async()=>{
 const source=fixture();Object.assign(source.docs[0],{serverLink:{objectId:'evil',token:'secret'},settings:{mic:true},runtime:{token:'secret'},unknown:'discard'});
 source.docs[0].provenance.accessToken='secret';source.records[0].resolvedAnchor={blockIndex:999};source.records[0].arrival='lost';
 const result=await validateLibrarySnapshot(source);assert.equal(result.docs[0].serverLink,undefined);assert.equal(result.docs[0].settings,undefined);assert.equal(result.docs[0].unknown,undefined);assert.equal(result.docs[0].provenance.accessToken,undefined);
 assert.equal(result.records[0].arrival,'exact');assert.equal(result.records[0].resolvedAnchor.blockIndex,0);
});
test('invalid bytes, digests, duplicates, dangling references and unsafe ranges reject whole package',async()=>{
 const cases=[s=>{s.docs[0].sourceBytes=[256];},s=>{s.docs[0].sourceBytes=[0.5];},s=>{s.docs[0].sourceBytes={'1':12};},s=>{s.docs[0].sourceBytes=new Array(3);},s=>{s.docs[0].provenance.contentDigest='sha256:'+'0'.repeat(64);},s=>{s.docs.push(structuredClone(s.docs[0]));},s=>{s.records.push(structuredClone(s.records[0]));},s=>{s.records[0].docId='missing';},s=>{s.records[0].blockEnd=999999999;},s=>{s.records[0].createdAt={};},s=>{s.records[0].undoes='missing';s.records[0].kind='undo';},s=>{s.positions[0].docId='missing';},s=>{s.positions[0].blockIndex=4;},s=>{s.docs[0].formDraft={sourceDigest:'bad',values:{}};},s=>{s.records[0].mathUnparsed='bad';},s=>{s.docs[0].warnings='bad';},s=>{s.docs[0].imageSource={width:'oops',height:100};}];
 for(const change of cases){const source=fixture();change(source);await assert.rejects(validateLibrarySnapshot(source),/BACKUP_/);}
});
test('undo references stay in their own document and exact ranges cannot carry forged endpoints',async()=>{
 const source=fixture();source.records.push({...source.records[0],id:'undo',kind:'undo',act:'undo',undoes:'mark'});
 assert.equal((await validateLibrarySnapshot(source)).records.length,2);
 source.records[0].rangeAnchor={version:1,start:source.records[0].anchor,end:{...source.records[0].anchor,quotedText:'wrong'}};
 await assert.rejects(validateLibrarySnapshot(source),/BACKUP_INVALID_RANGE/);
});
test('legacy export and authority-bearing envelopes are not accepted',async()=>{
 await assert.rejects(decodeLibraryBackup('{"format":"jt-export","docs":[]}'),/BACKUP_UNSUPPORTED_FORMAT/);
 const envelope=JSON.parse(await encodeLibraryBackup(fixture()));envelope.settings={mic:true};await assert.rejects(decodeLibraryBackup(JSON.stringify(envelope)),/BACKUP_UNSUPPORTED_FORMAT/);
 await assert.rejects(decodeLibraryBackup('not json'),/BACKUP_INVALID_JSON/);
});

test('legacy migration stays approximate and cannot become exact proof through backup',async()=>{
 const source=fixture();source.records[0].migration='legacy';source.records[0].arrival='approximate';
 const restored=await decodeLibraryBackup(await encodeLibraryBackup(source));assert.equal(restored.records[0].arrival,'approximate');
});
test('exact ranges on old text documents use their text digest fallback',async()=>{
 const source=fixture();delete source.docs[0].sourceBytes;delete source.docs[0].provenance;
 source.records[0].rangeAnchor={version:1,start:source.records[0].anchor,end:source.records[0].anchor};
 const restored=await decodeLibraryBackup(await encodeLibraryBackup(source));assert.equal(restored.records[0].arrival,'exact');assert.equal(restored.records[0].resolvedSegments.length,1);
});

test('rename revision metadata preserves protection and rejects invalid markers',async()=>{
 const source=fixture();source.docs[0].titleRevision=7;
 const restored=await decodeLibraryBackup(await encodeLibraryBackup(source));assert.equal(restored.docs[0].titleRevision,7);
 for(const value of [-1,1.5,Number.MAX_SAFE_INTEGER+1,'7']){source.docs[0].titleRevision=value;await assert.rejects(validateLibrarySnapshot(source),/BACKUP_INVALID_DOCUMENT/);}
});
