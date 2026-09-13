import {zipSync,strToU8} from 'fflate';
import {attachmentStore} from './attachments.js';
import {tender,requirements,initialBid,blockers,fileProblem} from './tender-model.js';
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
 let busy=false;
 function status(text){const n=surface.querySelector('#tender-status');if(n)n.textContent=text;}
 async function update(change,label){
  if(busy)return false;
  const form=surface.querySelector('#tender-bidder'),fields=new FormData(form),edits={};
  for(const name of ['company','registration','notes'])if(fields.get(name)!==bid[name])edits[name]=fields.get(name);
  busy=true;surface.querySelectorAll('button,input,textarea').forEach(n=>n.disabled=true);
  try{
   if(!navigator.locks)throw Error('Safe saving requires a browser with Web Locks support');
   await navigator.locks.request(key,async()=>{
    const next=await attachmentStore(key)||initialBid();Object.assign(next,edits);
    if(Object.hasOwn(edits,'registration'))next.eligibility=false;
    await change(next);next.history.push({at:new Date().toISOString(),action:label});await attachmentStore(key,next);bid=next;
   });
   draw();status(label+' · saved on this browser');return true;
  }
  catch(e){status('Could not save: '+e.message+'. Your previously saved data is unchanged.');}
  finally{busy=false;surface.querySelectorAll('button,input,textarea').forEach(n=>n.disabled=false);}
 }
 function draw(){
  if(!surface.isConnected)return;
  const missing=blockers(bid),count=requirements.filter(r=>bid.documents[r.id]?.reviewed).length;
  surface.innerHTML=`<div class="tender-work"><div class="tender-heading"><div><p class="tender-kicker">PWD NORTH DIVISION · JALGAON</p><h2>${tender.title}</h2><p class="tender-place">${tender.place}</p><code>${tender.id}</code></div><div class="tender-deadline"><span>Submission closes</span><strong>18 September</strong><span>2026 · 5:00 PM IST</span><a href="${tender.source}" target="_blank" rel="noopener">Open MahaTenders ↗</a></div></div>
  <div class="tender-metrics"><div>Estimated value<strong>${money(tender.value)}</strong></div><div>Earnest money<strong>${money(tender.emd)}</strong></div><div>Fee + processing<strong>${money(tender.fee)}</strong></div><div>Work period<strong>${tender.days} days</strong></div></div>
  <p class="tender-source">Public listing checked 13 Sep 2026 · Official documents must be reviewed before relying on eligibility or pricing.</p>
  <div class="tender-grid"><section class="tender-docs"><header><div><h3>Build the bid packet</h3><p>${count} of ${requirements.length} document groups reviewed</p></div><progress value="${count}" max="${requirements.length}" aria-label="Documents reviewed"></progress></header>
  <p>Keep the original BOQ unchanged. Add your priced copy separately.</p>
  ${requirements.map(r=>{const d=bid.documents[r.id];return `<article class="tender-document" data-document="${r.id}"><div><h4>${r.label}</h4><p>${r.expected||r.note}</p>${d?`<small>${esc(d.name)} · ${(d.size/1024).toFixed(1)} KB · ${d.reviewed?'Reviewed by you':'Needs review'}</small><details><summary>File receipt</summary><code>SHA-256 ${d.hash}</code><p>Added ${esc(d.added)}</p></details>`:'<small>Not added</small>'}</div><div class="tender-actions"><label class="tender-upload">${d?'Add replacement':'Add file'}<input aria-label="Add ${r.label.toLowerCase()}" data-upload="${r.id}" type="file" accept=".pdf,.xls,.xlsx,.zip,.rar"></label>${d?`<button data-download="${r.id}">Download original</button><label><input type="checkbox" data-reviewed="${r.id}" ${d.reviewed?'checked':''}> I reviewed this document</label>`:''}</div></article>`;}).join('')}
  </section><aside class="tender-side"><section><h3>Bidding organisation</h3><form id="tender-bidder"><label>Organisation name<input name="company" value="${esc(bid.company)}" autocomplete="organization"></label><label>MSS Class-A registration reference<input name="registration" value="${esc(bid.registration)}"></label><label>Working notes<textarea name="notes" rows="4" placeholder="Eligibility questions, site visit notes, missing documents…">${esc(bid.notes)}</textarea></label><button type="submit">Save bidder details</button></form><label class="tender-check"><input id="eligibility" type="checkbox" ${bid.eligibility?'checked':''}> I checked MSS Class-A registration and all eligibility conditions against the NIT.</label><label class="tender-check"><input id="corrigenda" type="checkbox" ${bid.corrigenda?'checked':''}> I checked current corrigenda and the submission deadline.</label></section>
  <section><h3>${missing.length?'Preparation in progress':'Ready for final human review'}</h3><p>This workspace prepares a packet. It does not submit a bid or make payments.</p>${missing.length?`<ul class="tender-blockers">${missing.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<p>All tracked checks are marked reviewed. Confirm the complete packet on the portal before submission.</p>'}<button id="tender-export" class="primary">Export preparation packet</button><p class="tender-local">Files stay on this browser. Export a copy before clearing browser storage or changing devices.</p></section>
  <details><summary>Activity · ${bid.history.length}</summary>${bid.history.slice(-15).reverse().map(x=>`<p>${esc(x.action)}<br><small>${esc(x.at)}</small></p>`).join('')||'<p>No changes yet.</p>'}</details></aside></div><p id="tender-status" role="status" aria-live="polite">Local preparation · not submitted</p></div>`;
  surface.querySelector('#tender-bidder').onsubmit=e=>{e.preventDefault();update(()=>{},'Bidder details updated');};
  for(const id of ['eligibility','corrigenda'])surface.querySelector('#'+id).onchange=e=>{const checked=e.target.checked;update(n=>n[id]=checked,id==='eligibility'?'Eligibility review updated':'Corrigendum review updated');};
  surface.querySelectorAll('[data-upload]').forEach(input=>input.onchange=async()=>{const file=input.files[0];input.value='';if(!file)return;const id=input.dataset.upload,problem=fileProblem(id,file);if(problem){status(problem);return;}
   await update(async n=>{const bytes=await file.arrayBuffer();if(/\.pdf$/i.test(file.name)&&new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('This file is not a valid PDF');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');const previous=n.documents[id];if(previous){n.originals??=[];n.originals.push({...previous,category:id});}n.documents[id]={name:file.name,size:file.size,file,hash,added:new Date().toISOString(),reviewed:false};if(['nit','terms','registration'].includes(id))n.eligibility=false;if(id==='nit')n.corrigenda=false;},requirements.find(r=>r.id===id).label+' added');
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
}
