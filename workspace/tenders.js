import {zipSync,strToU8} from 'fflate';
import {attachmentStore} from './attachments.js';
import {tender,requirements,initialBid,blockers,fileProblem,journey} from './tender-model.js';
import {tenderRunner} from './tender-runner.js';
import {tenderAI,tenderAIFilePattern} from './tender-ai-client.js';
import './tenders.css';
const key=`tender:${tender.id}`;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(x);
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export async function renderTender(surface){
 surface.innerHTML='<p role="status">Opening Kothali tender…</p>';
 let bid;
 try{bid=await attachmentStore(key)||initialBid();}catch{surface.innerHTML='<p role="alert">Could not open saved tender data. Reload to retry; nothing has been overwritten.</p>';return;}
 if(!surface.isConnected)return;
 let busy=false,aiState={kind:'checking'};
 function status(text){const n=surface.querySelector('#tender-status');if(n)n.textContent=text;}
 async function update(change,label){
  if(busy)return false;
  const form=surface.querySelector('#tender-bidder'),fields=new FormData(form),edits={};
  for(const name of ['company','registration','notes'])if(fields.get(name)!==bid[name])edits[name]=fields.get(name);
  busy=true;surface.querySelectorAll('button,input,textarea').forEach(n=>n.disabled=true);
  let failure;
  try{
   if(!navigator.locks)throw Error('Safe saving requires a browser with Web Locks support');
   await navigator.locks.request(key,async()=>{
    const next=await attachmentStore(key)||initialBid();Object.assign(next,edits);
    if(Object.hasOwn(edits,'registration'))next.eligibility=false;
    await change(next);next.history.push({at:new Date().toISOString(),action:label});await attachmentStore(key,next);bid=next;
   });
   draw();status(label+' · saved on this browser');return true;
  }
  catch(e){failure=e;}
  finally{busy=false;surface.querySelectorAll('button,input,textarea').forEach(n=>n.disabled=false);}
  status('Could not save: '+failure.message+'. Your previously saved data is unchanged.');return false;
 }
 function draw(){
  if(!surface.isConnected)return;
  const missing=blockers(bid),count=requirements.filter(r=>bid.documents[r.id]?.reviewed).length,route=journey(bid),current=route.stages[route.current];
  const documents=Object.values(bid.documents),reviewableDocuments=documents.filter(document=>tenderAIFilePattern.test(document.name)),analysis=bid.aiAnalysis;
  const receiptHashes=(analysis?.documents||[]).map(d=>d.sha256).sort(),documentHashes=reviewableDocuments.map(d=>d.hash).sort();
  const currentAnalysis=analysis&&receiptHashes.length===documentHashes.length&&receiptHashes.every((hash,index)=>hash===documentHashes[index]);
  const sourceNames=Object.fromEntries((analysis?.documents||[]).map(document=>[document.sha256,document.name]));
  const analysisMarkup=currentAnalysis?`<div class="tender-ai-result"><header><div><small>Advisory review · ${esc(analysis.analyzedAt)}</small><h4>${esc(analysis.summary||'Review the source-linked findings below.')}</h4></div><span>${analysis.findings.length} finding${analysis.findings.length===1?'':'s'}</span></header>${analysis.findings.length?`<div class="tender-ai-findings">${analysis.findings.map(finding=>`<article><div><span>${esc(finding.kind||'check')}</span><h5>${esc(finding.title||finding.label||'Document check')}</h5><p>${esc(finding.detail||finding.value||'')}</p></div><blockquote>${esc(finding.evidence.quote)}<footer>${esc(sourceNames[finding.evidence.document_sha256]||'Source document')} · Page ${finding.evidence.page}</footer></blockquote></article>`).join('')}</div>`:'<p class="tender-ai-empty">Text extraction completed. No source-linked findings were proposed.</p>'}</div>`:`<p class="tender-ai-empty">${documents.length?'Run a new review after adding or replacing documents.':'Add an official tender document, then request a review.'}</p>`;
  const rows=ids=>requirements.filter(r=>ids.includes(r.id)).map(r=>{const d=bid.documents[r.id];return `<article class="tender-document" id="document-${r.id}" data-document="${r.id}"><div><h4>${r.label}</h4><p>${r.expected||r.note}</p>${d?`<small><span class="document-state ${d.reviewed?'done':''}">${d.reviewed?'Checked':'Check needed'}</span> ${esc(d.name)} · ${(d.size/1024).toFixed(1)} KB · stored offline</small><details><summary>File receipt</summary><code>SHA-256 ${d.hash}</code><p>Added ${esc(d.added)}</p></details>`:'<small class="document-empty">Not added yet</small>'}</div><div class="tender-actions"><label class="tender-upload">${d?'Replace file':'Add file'}<input aria-label="Add ${r.label.toLowerCase()}" data-upload="${r.id}" type="file" accept=".pdf,.xls,.xlsx,.zip,.rar"></label>${d?`<button data-download="${r.id}">Open original</button><label><input type="checkbox" data-reviewed="${r.id}" ${d.reviewed?'checked':''}> I checked this file</label>`:''}</div></article>`;}).join('');
  surface.innerHTML=`<div class="tender-work"><div class="tender-heading"><div><div class="tender-badges"><span>Kothali bid</span><span id="offline-state">${navigator.onLine?'Saved on this device':'Offline · changes stay here'}</span></div><h2>${tender.title}</h2><p class="tender-place">Old Kothali, Muktainagar</p><p class="tender-reference">PWD North Division, Jalgaon · ${tender.id}</p></div><div class="tender-deadline"><span>Submit by</span><strong>18 September</strong><span>2026 at 5:00 PM</span><a href="${tender.source}" target="_blank" rel="noopener">View official listing</a></div></div>
  <section class="tender-journey" aria-label="Tender preparation progress"><header><div><span>Application progress</span><strong>${route.percent}% prepared</strong></div><progress value="${route.percent}" max="100" aria-label="Tender preparation percentage"></progress></header><ol>${route.stages.map((stage,index)=>`<li class="${stage.complete?'complete':index===route.current?'current':''}"><span>${stage.complete?'✓':index+1}</span><small>${stage.label}</small></li>`).join('')}</ol><div class="tender-next"><div><small>Next step</small><strong>${current.label}</strong><p>${current.id==='submit'?'Preparation is complete. Review the packet before opening MahaTenders.':'Your work saves automatically on this device.'}</p></div><button id="tender-continue" class="primary">${current.id==='submit'?'Review packet':'Continue'}</button></div></section>
  <div class="tender-metrics"><div>Estimated value<strong>${money(tender.value)}</strong></div><div>Earnest money<strong>${money(tender.emd)}</strong></div><div>Fee + processing<strong>${money(tender.fee)}</strong></div><div>Work period<strong>${tender.days} days</strong></div></div>
  <section class="tender-ai" aria-labelledby="tender-ai-title" data-service-error="${esc(aiState.error||'')}"><div class="tender-ai-heading"><div><div class="tender-ai-kicker"><span class="runner-dot" aria-hidden="true"></span><strong id="tender-ai-service-state">${aiState.kind==='ready'?'Local service ready':aiState.kind==='running'?'Reviewing documents':aiState.kind==='error'?'Service unavailable':'Checking local service'}</strong><span>Open-source document intelligence</span></div><h3 id="tender-ai-title">AI document review</h3><p>JJTY sends supported added documents to your configured service only when you request a review. Every finding must quote an exact source page and remains advisory until you check it.</p><small>${reviewableDocuments.length} document${reviewableDocuments.length===1?'':'s'} available for review${documents.length>reviewableDocuments.length?' · legacy BOQ and archives stay in the workspace':''}</small></div><button id="tender-ai-review" class="primary" ${aiState.kind!=='ready'||!reviewableDocuments.length?'disabled':''}>${aiState.kind==='running'?'Reviewing…':currentAnalysis?'Review again':'Review added documents'}</button></div>${analysisMarkup}<p class="tender-ai-boundary">AI cannot mark documents checked, confirm eligibility, price the BOQ, use the DSC, pay, or submit.</p></section>
  <section class="signing-desk" aria-labelledby="signing-desk-title"><div class="signing-desk-copy"><div class="signing-desk-kicker"><span class="runner-dot" aria-hidden="true"></span><strong>${tenderRunner.status==='ready'?'Ready now':'Unavailable'}</strong><span>${tenderRunner.location}</span></div><h3 id="signing-desk-title">Virtual signing desk</h3><p>Your Windows MahaTenders workspace is running. Plug in the firm DSC, open the desk, then choose the firm certificate inside MahaTenders.</p><ol><li><span>1</span>Plug in the firm DSC</li><li><span>2</span>Open the Windows desk</li><li><span>3</span>Confirm the certificate and submit</li></ol></div><div class="signing-desk-action"><a id="open-signing-desk" class="primary signing-desk-button" href="${tenderRunner.dcvUrl}">Open Windows signing desk</a><small>Last checked ${tenderRunner.verifiedOn}</small><small>Internet required · files here stay offline</small></div></section>
  <p class="tender-source">Public listing checked 13 September 2026. Official documents must be checked before relying on eligibility or pricing.</p>
  <div class="tender-grid"><section class="tender-docs"><header><div><h3>Documents</h3><p>${count} of ${requirements.length} checked</p></div><progress value="${count}" max="${requirements.length}" aria-label="Documents reviewed"></progress></header>
  <p>Add each file once. JJTY keeps it here for offline work. Keep the original BOQ unchanged and add the priced copy separately.</p>
  <div class="document-group"><h4>Official tender files</h4>${rows(['nit','terms','boq'])}</div>
  <div class="document-group"><h4>Your eligibility files</h4>${rows(['registration','capacity','technical'])}</div>
  <div class="document-group"><h4>Final bid files</h4>${rows(['signed','priced','payment'])}</div>
  </section><aside class="tender-side"><section><h3>Bidding organisation</h3><form id="tender-bidder"><label>Organisation name<input name="company" value="${esc(bid.company)}" autocomplete="organization"></label><label>MSS Class-A registration reference<input name="registration" value="${esc(bid.registration)}"></label><label>Working notes<textarea name="notes" rows="4" placeholder="Eligibility questions, site visit notes, missing documents…">${esc(bid.notes)}</textarea></label><button type="submit">Save bidder details</button></form><label class="tender-check"><input id="eligibility" type="checkbox" ${bid.eligibility?'checked':''}> I checked MSS Class-A registration and all eligibility conditions against the NIT.</label><label class="tender-check"><input id="corrigenda" type="checkbox" ${bid.corrigenda?'checked':''}> I checked current corrigenda and the submission deadline.</label></section>
  <section class="readiness"><h3>${missing.length?'What is left':'Ready for final review'}</h3><p>This room prepares the bid and works offline. Nothing is submitted or paid from here.</p>${missing.length?`<p class="remaining-count">${missing.length} checks remaining</p><details><summary>See every remaining check</summary><ul class="tender-blockers">${missing.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`:'<p>All tracked checks are complete. Confirm the packet on MahaTenders before submission.</p>'}<button id="tender-export" class="primary">Download preparation packet</button><button id="keep-offline">Keep available offline</button><p class="tender-local">This tender and its files are stored on this device. Download a packet before clearing browser data or changing devices.</p></section>
  <details><summary>Activity · ${bid.history.length}</summary>${bid.history.slice(-15).reverse().map(x=>`<p>${esc(x.action)}<br><small>${esc(x.at)}</small></p>`).join('')||'<p>No changes yet.</p>'}</details></aside></div><p id="tender-status" role="status" aria-live="polite">Local preparation · not submitted</p></div>`;
  surface.querySelector('#tender-bidder').onsubmit=e=>{e.preventDefault();update(()=>{},'Bidder details updated');};
  surface.querySelector('#tender-continue').onclick=()=>document.getElementById(current.target)?.scrollIntoView({behavior:'smooth',block:'center'});
  surface.querySelector('#keep-offline').onclick=async()=>{try{const kept=await navigator.storage?.persist?.();status(kept?'This tender is protected for offline use on this device.':'This tender is stored offline. Download a packet for an additional copy.');}catch{status('This tender remains stored on this device. Download a packet for an additional copy.');}};
  surface.querySelector('#tender-ai-review').onclick=async()=>{
   const selected=Object.values(bid.documents).filter(document=>tenderAIFilePattern.test(document.name)).map(document=>({name:document.name,file:document.file,hash:document.hash}));
   aiState={kind:'running'};draw();status('Reviewing added documents with your configured intelligence service…');
   try{
    const result=await tenderAI.analyze(selected);aiState={kind:'ready'};
    await update(n=>{for(const document of selected)if(!Object.values(n.documents).some(current=>current.hash===document.hash))throw Error('A document changed while the review was running; run it again');n.aiAnalysis={...result,analyzedAt:new Date().toISOString()};},'AI document review saved');
   }catch(error){aiState={kind:'error'};draw();status('AI review could not finish: '+error.message+'. Your documents and checks are unchanged.');}
  };
  for(const id of ['eligibility','corrigenda'])surface.querySelector('#'+id).onchange=e=>{const checked=e.target.checked;update(n=>n[id]=checked,id==='eligibility'?'Eligibility review updated':'Corrigendum review updated');};
  surface.querySelectorAll('[data-upload]').forEach(input=>input.onchange=async()=>{const file=input.files[0];input.value='';if(!file)return;const id=input.dataset.upload,problem=fileProblem(id,file);if(problem){status(problem);return;}
   await update(async n=>{const bytes=await file.arrayBuffer();if(/\.pdf$/i.test(file.name)&&new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('This file is not a valid PDF');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');const previous=n.documents[id];if(previous){n.originals??=[];n.originals.push({...previous,category:id});}n.documents[id]={name:file.name,size:file.size,file,hash,added:new Date().toISOString(),reviewed:false};if(tenderAIFilePattern.test(file.name)||tenderAIFilePattern.test(previous?.name||''))delete n.aiAnalysis;if(['nit','terms','registration'].includes(id))n.eligibility=false;if(id==='nit')n.corrigenda=false;},requirements.find(r=>r.id===id).label+' added');
  });
  surface.querySelectorAll('[data-reviewed]').forEach(input=>input.onchange=e=>{const checked=e.target.checked,id=input.dataset.reviewed;const hash=bid.documents[id].hash;update(n=>{if(n.documents[id]?.hash!==hash)throw Error('This document changed in another tab; reload and review its latest version');n.documents[id].reviewed=checked;},'Document review updated');});
  surface.querySelectorAll('[data-download]').forEach(b=>b.onclick=()=>{const d=bid.documents[b.dataset.download];download(d.file,d.name);});
  surface.querySelector('#tender-export').onclick=async()=>{
   if(busy)return;if(!await update(()=>{},'Preparation packet requested'))return;busy=true;const button=surface.querySelector('#tender-export');button.disabled=true;status('Preparing export…');
   try{const packet={},manifest={schema:'jjty-tender-packet-v1',tender,exportedAt:new Date().toISOString(),state:'preparation-only-not-submitted',bidder:{company:bid.company,registration:bid.registration,notes:bid.notes},eligibility:bid.eligibility,corrigenda:bid.corrigenda,blockers:blockers(bid),documents:[],history:bid.history};
    for(const [id,d] of Object.entries(bid.documents)){const filename=`documents/${id}/${d.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;packet[filename]=new Uint8Array(await d.file.arrayBuffer());const {file,...meta}=d;manifest.documents.push({category:id,path:filename,...meta});}
    manifest.previousOriginals=[];for(const [i,d] of (bid.originals||[]).entries()){const filename=`previous-originals/${i}/${d.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;packet[filename]=new Uint8Array(await d.file.arrayBuffer());const {file,...meta}=d;manifest.previousOriginals.push({path:filename,...meta});}
    packet['manifest.json']=strToU8(JSON.stringify(manifest,null,2));packet['READ-ME.txt']=strToU8(`${tender.id}\n${tender.title}, ${tender.place}\nPREPARATION PACKET — NOT SUBMITTED\n\nOutstanding checks:\n${manifest.blockers.join('\n')||'All tracked checks marked reviewed; final human review still required.'}\n\nVerify original NIT, eligibility, pricing and current corrigenda before submission.\n`);
    download(new Blob([zipSync(packet,{level:0})],{type:'application/zip'}),`${tender.id}-preparation.zip`);status('Preparation packet exported. Nothing submitted.');
   }catch(e){status('Export failed: '+e.message+'. Saved documents remain available.');}finally{busy=false;button.disabled=false;}
  };
 }
 draw();
 tenderAI.health().then(health=>{aiState={kind:'ready',health};draw();}).catch(error=>{aiState={kind:'error',error:error.message};draw();});
 const connection=()=>{const n=surface.querySelector('#offline-state');if(n)n.textContent=navigator.onLine?'Saved on this device':'Offline · changes stay here';};
 navigator.serviceWorker?.ready.then(()=>{const n=surface.querySelector('#offline-state');if(n&&navigator.onLine)n.textContent='Available offline';});
 addEventListener('online',connection,{once:true});addEventListener('offline',connection,{once:true});
}
