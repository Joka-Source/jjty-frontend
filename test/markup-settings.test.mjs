import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSettings,clearSettings} from '../src/settings.js';

test('markup preference survives reload and rejected writes retain the prior color',()=>{
  const values=new Map();let fail=false;
  const storage={getItem:key=>values.get(key)??null,setItem(key,value){if(fail)throw new Error('Storage full');values.set(key,value);},removeItem:key=>values.delete(key)};
  const settings=loadSettings(storage);assert.equal(settings.markupColor,'yellow');
  settings.set('markupColor','blue');assert.equal(loadSettings(storage).markupColor,'blue');
  assert.throws(()=>settings.set('markupColor','#123456'));assert.equal(settings.markupColor,'blue');
  fail=true;assert.throws(()=>settings.set('markupColor','pink'),/Storage full/);
  assert.equal(settings.markupColor,'blue');assert.equal(loadSettings(storage).markupColor,'blue');
  values.set('jt.markupColor','corrupt');assert.equal(loadSettings(storage).markupColor,'yellow');
  clearSettings(storage);assert.equal(values.size,0);
});
