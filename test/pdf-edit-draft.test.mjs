import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateTextEditDraft} from '../src/pdf-edit-draft.js';
import {encodeLibraryBackup,decodeLibraryBackup} from '../src/library-backup.js';
const digest='sha256:'+'a'.repeat(64);
const draft={sourceDigest:digest,pageIndex:0,paragraphId:1,originalBox:{x:50,top:100,w:200,h:20},originalRotation:0,originalText:'Original paragraph',text:''};
test('edit draft detaches exact intention and rejects invalid source or target',()=>{
 assert.deepEqual(validateTextEditDraft({...draft,credentials:'discard'},digest),draft);
 for(const bad of [{...draft,sourceDigest:'sha256:'+'b'.repeat(64)},{...draft,pageIndex:-1},{...draft,pageIndex:0.5},{...draft,paragraphId:null},{...draft,originalBox:null},{...draft,originalBox:{...draft.originalBox,w:-1}},{...draft,originalRotation:NaN},{...draft,originalText:''},{...draft,text:null},{...draft,text:'a'.repeat(100001)}])assert.throws(()=>validateTextEditDraft(bad,digest),/EDIT_DRAFT_INVALID/);
});
test('backup retains an unfinished PDF edit including empty text and rejects mismatched draft custody',async()=>{
 const sourceBytes=new Uint8Array(await readFile(new URL('./fixtures/jett-range.pdf',import.meta.url))),hash='sha256:'+createHash('sha256').update(sourceBytes).digest('hex'),at='2026-09-09T00:00:00Z';
 const doc={id:'edit-draft',title:'Source',text:'Original paragraph',createdAt:at,revision:1,sourceBytes,provenance:{sourceKind:'pdf',contentDigest:hash,byteSize:sourceBytes.length,capturedAt:at},textEditDraft:{...draft,sourceDigest:hash}};
 const snapshot={docs:[doc],records:[],positions:[]};
 const restored=await decodeLibraryBackup(await encodeLibraryBackup(snapshot));assert.deepEqual(restored.docs[0],doc);
 doc.textEditDraft.sourceDigest=digest;await assert.rejects(encodeLibraryBackup(snapshot),/BACKUP_INVALID_TEXT_EDIT_DRAFT/);
 doc.textEditDraft.sourceDigest=hash;doc.provenance.sourceKind='text';await assert.rejects(encodeLibraryBackup(snapshot),/BACKUP_INVALID_TEXT_EDIT_DRAFT/);
});
