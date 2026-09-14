import test from 'node:test';
import assert from 'node:assert/strict';

import {TenderAIClient} from '../workspace/tender-ai-client.js';

const source=new Uint8Array([37,80,68,70,45,49,46,52]);
const hash='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('tender AI client sends files only during explicit analysis and verifies receipts',async()=>{
 let calls=0;
 const fetchImpl=async(url,options)=>{
  calls+=1;
  assert.equal(url,'http://127.0.0.1:8788/v1/tenders/analyze');
  assert.equal(options.method,'POST');
  const files=options.body.getAll('files');
  assert.equal(files.length,1);
  assert.equal(files[0].name,'Tendernotice_1.pdf');
  assert.deepEqual(new Uint8Array(await files[0].arrayBuffer()),source);
  return new Response(JSON.stringify({
   schema:'jjty-tender-analysis-v1',state:'ready_for_review',summary:'Review one deadline.',
   documents:[{name:'Tendernotice_1.pdf',sha256:hash,size:source.length}],findings:[],
   authority:'advisory_only',submission_allowed:false,
  }),{status:200,headers:{'content-type':'application/json'}});
 };
 const client=new TenderAIClient({fetchImpl});
 assert.equal(calls,0);

 const result=await client.analyze([{name:'Tendernotice_1.pdf',file:new File([source],'Tendernotice_1.pdf'),hash}]);

 assert.equal(calls,1);
 assert.equal(result.summary,'Review one deadline.');
});

test('tender AI client rejects a mismatched or authoritative service response',async()=>{
 const document={name:'Tendernotice_1.pdf',file:new File([source],'Tendernotice_1.pdf'),hash};
 const response={schema:'jjty-tender-analysis-v1',documents:[{sha256:'wrong'}],findings:[],authority:'advisory_only',submission_allowed:false};
 const client=new TenderAIClient({fetchImpl:async()=>new Response(JSON.stringify(response),{status:200})});

 await assert.rejects(client.analyze([document]),/receipt does not match/i);
 response.documents=[{sha256:hash}];response.submission_allowed=true;
 await assert.rejects(client.analyze([document]),/advisory/i);
});

test('tender AI client refuses extracted page text in a service response',async()=>{
 const document={name:'Tendernotice_1.pdf',file:new File([source],'Tendernotice_1.pdf'),hash};
 const response={
  schema:'jjty-tender-analysis-v1',documents:[{sha256:hash,pages:[{page:1,text:'private extracted text'}]}],
  findings:[],authority:'advisory_only',submission_allowed:false,
 };
 const client=new TenderAIClient({fetchImpl:async()=>new Response(JSON.stringify(response),{status:200})});

 await assert.rejects(client.analyze([document]),/extracted page text/i);
});
