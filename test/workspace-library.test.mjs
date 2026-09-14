import test from 'node:test';
import assert from 'node:assert/strict';
import { libraryItems, filterLibrary } from '../workspace/library.js';

test('shared library keeps document and notebook identities distinct and searches content', () => {
  const items = libraryItems([{id:'same',title:'Report',text:'Quarterly balance',createdAt:'2026-09-01',provenance:{sourceKind:'pdf'}}], [{id:'same',title:'Meeting',updated:Date.parse('2026-09-02'),pages:[{items:[{type:'text',text:'Budget decision'}]}]}]);
  assert.deepEqual(items.map(x=>x.key), ['notebook:same','document:same']);
  assert.equal(filterLibrary(items,'balance','all')[0].title,'Report');
  assert.equal(filterLibrary(items,'budget','notebook')[0].title,'Meeting');
  assert.equal(filterLibrary(items,'budget','pdf').length,0);
  assert.equal(filterLibrary(items,'nonexistent','all').length,0);
  assert.match(items[0].url,/notebook=same/);
  assert.match(items[1].url,/workspaceDocument=same/);
});
