import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState,saveState } from '../workspace/model.js';
test('independent tabs merge only the draft field being edited',()=>{
 let value=null;const storage={getItem:()=>value,setItem:(_,v)=>value=v};
 const a=loadState(storage),b=loadState(storage);
 a.drafts.Inbox={body:'Email survives'};saveState(storage,a,{section:'Inbox',field:'body'});
 b.drafts.Messages={body:'Message survives'};saveState(storage,b,{section:'Messages',field:'body'});
 b.drafts.Inbox={subject:'New subject'};saveState(storage,b,{section:'Inbox',field:'subject'});
 assert.deepEqual(loadState(storage).drafts,{Inbox:{body:'Email survives',subject:'New subject'},Messages:{body:'Message survives'}});
 b.appearance='dark';saveState(storage,b);assert.equal(loadState(storage).drafts.Inbox.body,'Email survives');
});
