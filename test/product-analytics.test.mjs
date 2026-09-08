import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommandJournal} from '../src/command-journal.js';
import {createProductAnalytics} from '../src/product-analytics.js';
const memory=()=>{const m=new Map();return{getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)}};
test('HTTP origins without randomUUID can open and record valid event identities',async()=>{
 const previous=globalThis.crypto.randomUUID;globalThis.crypto.randomUUID=undefined;
 try{
  const storage=memory(),journal=createCommandJournal({storage}),analytics=createProductAnalytics(journal,{storage});
  journal.begin();await analytics.settled();assert.equal(analytics.getState().pending,1);
  assert.match(journal.export()[0].uuid,/^[0-9a-f-]{36}$/);analytics.dispose();
 }finally{globalThis.crypto.randomUUID=previous;}
});
test('product analytics defaults on, queues without guessed destination and never reenrolls old/off-window history',async()=>{
 const storage=memory(),journal=createCommandJournal({storage});journal.begin({rawText:'old history'});
 const analytics=createProductAnalytics(journal,{storage});
 assert.equal(analytics.getState().enabled,true);assert.equal(analytics.getState().configured,false);
 assert.equal(analytics.getState().pending,0);
 const id=journal.begin();await analytics.settled();assert.equal(analytics.getState().pending,1);
 journal.feedback(id,{rating:'missed'});await analytics.settled();assert.equal(analytics.getState().pending,2);
 await analytics.setEnabled(false);journal.begin();await analytics.settled();assert.equal(analytics.getState().pending,0);
 await analytics.setEnabled(true);await analytics.settled();assert.equal(analytics.getState().pending,0);
 journal.begin();await analytics.settled();assert.equal(analytics.getState().pending,1);analytics.dispose();
 const restored=createProductAnalytics(journal,{storage});assert.equal(restored.getState().pending,1);restored.dispose();
});
test('journal events are automatically delivered with separate feedback and session identity',async()=>{
 const storage=memory(),journal=createCommandJournal({storage,rawOptIn:true}),bodies=[];
 const analytics=createProductAnalytics(journal,{storage,host:'https://analytics.example.test',token:'phc_fixture',fetch:async(url,request)=>{bodies.push(JSON.parse(request.body));return{ok:true}},schedule:()=>1,cancel:()=>{}});
 const id=journal.begin({rawText:'private source text'});journal.record(id,{stage:'result',status:'saved',actual:'durable-entry'});await analytics.flush();
 journal.feedback(id,{rating:'missed',expectedIntent:'highlight'});await analytics.flush();
 const events=bodies.flatMap(b=>b.batch);assert.equal(events.length,3);assert.equal(events[2].event,'jett_command_feedback');
 assert.equal(events[0].properties.feedback_rating,undefined);assert.equal(events[2].properties.feedback_rating,'missed');
 assert.notEqual(events[0].properties.distinct_id,'local-command-journal');assert.equal(JSON.stringify(bodies).includes('private source text'),false);analytics.dispose();
});
