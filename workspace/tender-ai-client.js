export const defaultTenderAIURL='http://127.0.0.1:8788';
export const tenderAIFilePattern=/\.(pdf|docx|xlsx|pptx|html|md|txt|csv|png|jpe?g|tiff?)$/i;

export class TenderAIClient {
 constructor({baseUrl,fetchImpl=(...args)=>globalThis.fetch(...args)}={}){
  this.baseUrl=baseUrl?.replace(/\/$/,'');
  this.fetch=fetchImpl;
 }
 endpoint(path){
  const configured=this.baseUrl||globalThis.__JJTY_TENDER_AI_URL__||globalThis.window?.localStorage?.getItem('jjty:tender-ai-url')||defaultTenderAIURL;
  return configured.replace(/\/$/,'')+path;
 }
 async health(){
  const response=await this.fetch(this.endpoint('/health'));
  if(!response.ok)throw Error('Tender intelligence service is unavailable');
  const health=await response.json();
  if(health.status!=='ready'||health.authority!=='advisory_only')throw Error('Tender intelligence service reported an unsafe state');
  return health;
 }
 async analyze(documents){
  if(!documents?.length)throw Error('Add at least one tender document before requesting a review');
  const form=new FormData();
  for(const document of documents)form.append('files',document.file,document.name);
  const response=await this.fetch(this.endpoint('/v1/tenders/analyze'),{method:'POST',body:form});
  let result;
  try{result=await response.json();}catch{throw Error('Tender intelligence service returned an unreadable response');}
  if(!response.ok)throw Error(result?.detail||'Tender intelligence review failed');
  if(result.schema!=='jjty-tender-analysis-v1'||result.authority!=='advisory_only'||result.submission_allowed!==false)throw Error('Tender intelligence response is not advisory');
  if((result.documents||[]).some(document=>Object.hasOwn(document,'pages')))throw Error('Tender intelligence response contains extracted page text');
  const expected=[...documents].map(x=>x.hash).sort();
  const received=(result.documents||[]).map(x=>x.sha256).sort();
  if(expected.length!==received.length||expected.some((hash,index)=>hash!==received[index]))throw Error('Analysis receipt does not match the selected source documents');
  return result;
 }
}

export const tenderAI=new TenderAIClient();
