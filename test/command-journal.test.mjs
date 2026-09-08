import test from'node:test';import assert from'node:assert/strict';import{createCommandJournal}from'../src/command-journal.js';
test('new events have immutable IDs and feedback never rewrites earlier telemetry',()=>{
 const store=new Map(),storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
 const journal=createCommandJournal({storage});const emitted=[];journal.subscribe(events=>emitted.push(...events));
 const id=journal.begin();const first=journal.export()[0];
 journal.feedback(id,{rating:'missed',expectedIntent:'highlight'});
 assert.deepEqual(journal.export()[0],first);assert.equal(journal.export()[1].event,'jett_command_feedback');
 assert.notEqual(journal.export()[1].uuid,first.uuid);
 assert.deepEqual(createCommandJournal({storage}).export(),journal.export());
 for(let i=0;i<30;i++)journal.record(id,{stage:'target',status:'pending'});
 assert.equal(new Set(emitted.map(e=>e.uuid)).size,emitted.length);
 assert.deepEqual(journal.export().at(-1),emitted.at(-1));
 const count=emitted.length;journal.clear();assert.equal(emitted.length,count,'clear does not replay history');
});
function memory(){const values=new Map();return{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};}
test('correlated evidence persists only actual reported stages and exports allowlisted PostHog-shaped metadata',()=>{const storage=memory();let tick=1000;const journal=createCommandJournal({storage,now:()=>tick++});const id=journal.begin({source:'voice',rawText:'private passage'});journal.record(id,{stage:'intent',status:'parsed',intent:'highlight',expected:'highlight',document:'private file'});assert.equal(journal.list()[0].events.some(v=>v.stage==='result'),false);journal.record(id,{stage:'result',status:'failed',actual:'error',durationMs:15,error:'private error'});const loaded=createCommandJournal({storage});assert.equal(loaded.list()[0].id,id);const events=journal.export();assert.equal(events[2].properties.status,'failed');assert.equal(events[2].properties.actual,'error');assert.equal(events[2].properties.durationMs,15);assert.equal(events[2].properties.command_id,id);assert.equal(events[2].event,'jett_command_result');assert.ok(!JSON.stringify(events).includes('private'));assert.ok(!JSON.stringify(journal.list()).includes('private'));});
test('raw text requires explicit local opt-in, is never exported, and opting out purges held copies',()=>{const storage=memory(),j=createCommandJournal({storage,rawOptIn:true});const id=j.begin({rawText:'secret reading'});j.feedback(id,{rating:'missed',expectedIntent:'annotate',correction:'secret correction'});assert.ok(JSON.stringify(j.list()).includes('secret'));assert.ok(!JSON.stringify(j.export()).includes('secret'));assert.equal(j.export().at(-1).properties.feedback_rating,'missed');j.setRawOptIn(false);assert.ok(!JSON.stringify(j.list()).includes('secret'));assert.ok(!storage.getItem('jett.command-journal.v1').includes('secret'));});
test('ring/events are bounded, snapshots owned, observers removable and clearing removes evidence',()=>{const j=createCommandJournal({storage:memory(),limit:2});let changed=0;const off=j.subscribe(()=>changed++);const old=j.begin();j.begin();const id=j.begin();assert.equal(j.record(old,{stage:'result',status:'saved'}),false);for(let i=0;i<30;i++)j.record(id,{stage:'target',status:'pending'});assert.equal(j.list().length,2);assert.equal(j.list()[1].events.length,16);const copy=j.list();copy[0].events.length=0;assert.notEqual(j.list()[0].events.length,0);off();const prior=changed;j.clear();assert.equal(changed,prior);assert.deepEqual(j.list(),[]);});
test('malformed/quota storage stays usable and unknown metadata cannot leak free text',()=>{const j=createCommandJournal({storage:{getItem:()=>'{broken',setItem:()=>{throw Error('quota');}}});const id=j.begin();j.record(id,{stage:'intent',status:'my private words',intent:'my private words',expected:'my private words',actual:'my private words',durationMs:-1});assert.equal(j.getState().storageError,'storage-unavailable');assert.equal(j.list().length,1);assert.ok(!JSON.stringify(j.export()).includes('my private'));assert.equal(j.list()[0].events[1].status,'unrecognized');assert.equal(j.list()[0].events[1].durationMs,undefined);assert.doesNotThrow(()=>j.clear());});
test('untrusted persisted shape is revalidated including dates, feedback and default raw opt-out',()=>{const storage=memory();storage.setItem('jett.command-journal.v1',JSON.stringify({version:1,items:[{id:'cmd-a',source:'private title',startedAt:1,events:[{stage:'result',status:'saved',at:1e100,rawText:'secret'}],feedback:{rating:'worked',correction:'secret'}},{id:'cmd-b',startedAt:1e100,events:[]}]}));const j=createCommandJournal({storage,now:()=>5});assert.equal(j.list().length,1);assert.equal(j.list()[0].source,'pointer');assert.equal(j.export()[0].timestamp,'1970-01-01T00:00:00.005Z');assert.ok(!JSON.stringify(j.list()).includes('secret'));});

test('default reload purges previously opted-in raw storage immediately and simulation stays labeled',()=>{const storage=memory();const first=createCommandJournal({storage,rawOptIn:true});first.begin({source:'sim',rawText:'previous local secret'});assert.ok(storage.getItem('jett.command-journal.v1').includes('previous local secret'));const reopened=createCommandJournal({storage});assert.ok(!storage.getItem('jett.command-journal.v1').includes('previous local secret'));assert.equal(reopened.list()[0].source,'sim');assert.equal(reopened.export()[0].properties.source,'sim');});


test('target metadata is numeric only; export does not create person profiles',()=>{
 const journal=createCommandJournal({storage:null});
 const id=journal.begin();
 journal.record(id,{stage:'target',status:'matched',blockIndex:2,tokenStart:5,tokenEnd:7,text:'private document',title:'private title'});
 const event=journal.export().at(-1);
 assert.equal(event.properties.blockIndex,2);assert.equal(event.properties.tokenEnd,7);
 assert.equal(event.properties.$process_person_profile,false);
 assert.equal(JSON.stringify(event).includes('private'),false);
 journal.record(id,{stage:'target',status:'matched',blockIndex:-1,tokenStart:Infinity,tokenEnd:'private'});
 assert.equal(journal.export().at(-1).properties.tokenEnd,undefined);
});
