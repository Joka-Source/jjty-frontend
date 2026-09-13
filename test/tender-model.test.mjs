import test from 'node:test';
import assert from 'node:assert/strict';
import {tender,requirements,initialBid,blockers,fileProblem} from '../workspace/tender-model.js';
const before=Date.parse('2026-09-13T12:00:00+05:30');
test('Kothali requires reviewed documents and eligibility, not just uploads',()=>{
 const bid=initialBid();assert.ok(blockers(bid,before).length>9);
 bid.company='Synthetic society';bid.registration='Synthetic registration';bid.eligibility=true;bid.corrigenda=true;
 for(const r of requirements)bid.documents[r.id]={name:r.expected||'test.pdf',reviewed:false};
 assert.equal(blockers(bid,before).length,requirements.length);
 for(const d of Object.values(bid.documents))d.reviewed=true;
 assert.deepEqual(blockers(bid,before),[]);
 assert.match(blockers(bid,Date.parse(tender.deadline))[0],/deadline has passed/);
});
test('official originals must match expected names and size constraints',()=>{
 assert.match(fileProblem('boq',{name:'other.xls',size:2}),/BOQ_2288013/);
 assert.match(fileProblem('nit',{name:'Tendernotice_1.pdf',size:0}),/non-empty/);
 assert.equal(fileProblem('boq',{name:'BOQ_2288013.xls',size:20}),'');
 assert.match(fileProblem('technical',{name:'run.html',size:20}),/PDF/);
});
