import './style.css';
import '../src/pwa.js';
import { navigationIcon } from './icons.js';
import { attachmentStore } from './attachments.js';
import { sections, loadState, saveState, providers } from './model.js';
const root = document.querySelector('#workspace'), sheet = document.querySelector('#sheet');
let state = loadState(localStorage), folder = 'Inbox', objectUrl = null;
const escape = value => String(value).replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));

let section = decodeURIComponent(location.hash.slice(1)) || 'Inbox';
if (!sections.includes(section)) section = 'Inbox';
const drafts = () => state.drafts[section] || {to:'',subject:'',body:''};
function store(change) { try {saveState(localStorage,state,change); return true;} catch {status('Could not save this draft. Copy your text before closing.');return false;} }
function status(text) { const node=document.querySelector('#receipt'); if(node)node.textContent=text; }
function modal(title, body) {
  const trigger = document.activeElement;
  sheet.innerHTML=`<header><h2 id="sheet-title">${title}</h2><button id="dismiss" aria-label="Close">×</button></header>${body}`;
  sheet.showModal(); sheet.querySelector('#dismiss').onclick=()=>sheet.close();
  sheet.addEventListener('close',()=>trigger?.isConnected && trigger.focus(),{once:true});
}
function navigate(name) { location.hash=encodeURIComponent(name); }
addEventListener('hashchange',()=>{const next=decodeURIComponent(location.hash.slice(1));if(sections.includes(next)){state=loadState(localStorage);section=next;render();}});
function render() {
 document.documentElement.dataset.motion=state.reducedMotion?'reduce':'system';
 document.documentElement.dataset.appearance=state.appearance;
 root.innerHTML=`<aside class="rail"><a class="brand" href="#Inbox"><span class="orb"></span>JJTY</a><p class="workspace-name">Your workspace</p><nav aria-label="Workspace">${sections.map((s,i)=>`<a href="#${encodeURIComponent(s)}" ${s===section?'aria-current="page"':''}><span aria-hidden="true">${navigationIcon(i)}</span>${s}</a>`).join('')}</nav><div class="rail-bottom"><span class="local-dot"></span> Local workspace<small>Connect an account to receive and send.</small></div></aside><main><header class="top"><div><span class="eyebrow">Workspace</span><h1>${section}</h1></div><button id="help">How this works</button></header><div id="surface"></div></main>`;
 document.querySelector('#help').onclick=()=>modal('One place for the whole conversation','<p>Read email, open a document, then return to your draft. Library and PDF tools open the existing editors. Communication drafts are saved on this browser.</p><p>Accounts are not connected yet. No email or message is sent from this preview.</p>');
 const surface=document.querySelector('#surface');
 if(section==='Inbox'||section==='Messages') communication(surface);
 if(section==='Library'||section==='PDF tools') {
  surface.innerHTML=`<div class="document-switch"><p>${section==='Library'?'Notebooks, handwriting and voice cursor':'Existing PDF text editing, forms, annotations and page tools'}</p><a href="${section==='Library'?'/notebooks/index.html':'/#/home'}" target="_blank" rel="noopener">Open full workspace ↗</a></div><iframe title="${section==='Library'?'Notebook workspace':'PDF document workspace'}" src="${section==='Library'?'/notebooks/index.html':'/#/home'}"></iframe>`;
 }
 if(section==='Connections') connections(surface);
 if(section==='Settings') settings(surface);
}
function communication(surface) {
 const email=section==='Inbox', draft=drafts();
 surface.innerHTML=`<div class="communication"><aside class="folders"><button class="primary" id="compose">${email?'Compose email':'Write a message'}</button>${(email?['Inbox','Drafts','Sent','Archive']:['All conversations','Mentions','Drafts']).map(f=>`<button data-folder="${f}" class="${f===folder?'active':''}">${f}</button>`).join('')}<hr><button id="connect">${email?'Add email account':'Connect messaging'}</button></aside><section class="thread-list"><label class="search">Search ${email?'mail':'conversations'}<input type="search" id="search" placeholder="Search this view"></label><div class="empty"><div class="empty-icon">${email?'✉':'☷'}</div><h2>${folder==='Drafts'&&draft.body?'Your draft is ready':'Your conversations belong here'}</h2><p>${folder==='Drafts'&&draft.body?'Continue writing. It has not been sent.':'Connect an account to see your real conversations. Your existing account stays yours.'}</p><button id="empty-action">${folder==='Drafts'&&draft.body?'Continue draft':'View connections'}</button></div></section><section class="detail"><div class="detail-heading"><span>${email?'Email draft':'Message draft'}</span><span class="pill">Local draft</span></div><form id="composer"><label>${email?'To':'Destination'}<input name="to" value="${escape(draft.to)}" placeholder="${email?'name@example.com':'Channel or person'}"></label>${email?`<label>Subject<input name="subject" value="${escape(draft.subject)}" placeholder="Subject"></label>`:''}<label class="body-label">${email?'Message':'Write a message'}<textarea name="body" placeholder="Write here. Your draft stays when you switch views.">${escape(draft.body)}</textarea></label><div id="attachment"></div><div class="composer-tools"><button type="button" id="attach">Attach file or video</button><input id="file" type="file" hidden><button type="button" id="pdf">Open PDF tools</button></div><footer><span id="receipt" role="status">Saved locally · not sent</span><button class="primary" type="submit">Review delivery</button></footer></form></section></div>`;
 surface.querySelectorAll('[data-folder]').forEach(b=>b.onclick=()=>{folder=b.dataset.folder;render();});
 document.querySelector('#connect').onclick=()=>navigate('Connections');
 document.querySelector('#empty-action').onclick=()=>folder==='Drafts'&&draft.body?document.querySelector('textarea').focus():navigate('Connections');
 document.querySelector('#compose').onclick=()=>document.querySelector('[name=to]').focus();
 document.querySelector('#pdf').onclick=()=>navigate('PDF tools');
 document.querySelector('#search').oninput=e=>{surface.querySelector('.empty h2').textContent=e.target.value?'No matching conversations':'Your conversations belong here';};
 document.querySelector('#composer').oninput=event=>{const form=document.querySelector('#composer');state.drafts[section]={to:form.elements.to.value,subject:form.elements.subject?.value||'',body:form.elements.body.value};if(['to','subject','body'].includes(event.target.name)&&store({section,field:event.target.name}))status('Draft saved on this browser · not sent');};
 document.querySelector('#composer').onsubmit=e=>{e.preventDefault();modal('Connect before sending','<p>Your draft is saved here. A delivery provider is required to send it. Nothing has been sent.</p><button id="open-connections" class="primary">View connections</button>');document.querySelector('#open-connections').onclick=()=>{sheet.close();navigate('Connections');};};
 document.querySelector('#attach').onclick=()=>document.querySelector('#file').click();
 const attachmentKey=section;
 async function showAttachment(file) {
  if(section!==attachmentKey)return;
  const node=document.querySelector('#attachment');if(!node)return;
  if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;node.replaceChildren();
  if(!file)return;
  objectUrl=URL.createObjectURL(file);
  const caption=document.createElement('p');caption.textContent=`${file.name} · ${(file.size/1048576).toFixed(1)} MB · saved locally, not uploaded`;node.append(caption);
  if(file.type.startsWith('video/')){const video=document.createElement('video');video.controls=true;video.src=objectUrl;node.append(video);}
  const download=document.createElement('a');download.href=objectUrl;download.download=file.name;download.textContent='Download attachment';node.append(download);
  const remove=document.createElement('button');remove.type='button';remove.textContent='Remove attachment';remove.onclick=async()=>{try{await attachmentStore(attachmentKey,null);showAttachment(null);status('Attachment removed.');}catch{status('Attachment could not be removed. Try again.');}};node.append(remove);
 }
 attachmentStore(attachmentKey).then(showAttachment).catch(()=>status('Saved attachment could not be opened. Retry by reopening this view.'));
 document.querySelector('#file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  if(file.size>100*1048576){status('Choose a file smaller than 100 MB for this local draft.');return;}
  status('Saving attachment on this browser…');
  try{await attachmentStore(attachmentKey,file);await showAttachment(file);if(section===attachmentKey)status('Attachment saved locally · not uploaded');}
  catch{if(section===attachmentKey)status('Attachment could not be saved. Your text draft remains available. Try a smaller file.');}
 };

}
function connections(surface) {
 surface.innerHTML=`<div class="intro"><h2>Bring your accounts together</h2><p>Choose where conversations come from. Account permissions and delivery remain explicit.</p></div><div class="connection-grid">${providers.map(p=>`<article><div class="provider-icon">${p.name==='Gmail'?'M':'☷'}</div><h2>${p.name}</h2><p>${p.capabilities.join(' · ')}</p><span class="pill">${p.state}</span><button data-provider="${p.name}">Connection details</button></article>`).join('')}</div>`;
 surface.querySelectorAll('[data-provider]').forEach(b=>b.onclick=()=>modal(`${b.dataset.provider} connection`,'<p>This build has no configured sign-in and delivery adapter. It cannot import your account or send messages yet.</p><h3>Connection flow</h3><ol><li>Choose an account and review permissions.</li><li>Select folders and import scope.</li><li>Track import progress and retry interrupted work.</li></ol><p>Your local drafts remain available while disconnected.</p>'));
}
function settings(surface) {
 surface.innerHTML=`<div class="settings-layout"><nav aria-label="Settings sections">${['Appearance','Accessibility','Accounts','Notifications','Storage','Shortcuts'].map(s=>`<button data-setting="${s}">${s}</button>`).join('')}</nav><section id="setting-panel"></section></div>`;
 const show=name=>{const panel=document.querySelector('#setting-panel');panel.innerHTML=`<h2>${name}</h2>`;
 if(name==='Appearance')panel.innerHTML+=`<label>Color theme<select id="appearance"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><p>Applies to the workspace shell. Document editors retain their own appearance.</p>`;
 if(name==='Accessibility')panel.innerHTML+=`<label><input id="motion" type="checkbox" ${state.reducedMotion?'checked':''}> Reduce motion</label><p>Use Tab to move between controls and Escape to dismiss dialogs.</p>`;
 if(name==='Accounts')panel.innerHTML+='<p>No accounts connected.</p><button id="manage">Manage connections</button>';
 if(name==='Notifications')panel.innerHTML+='<p>Notifications become available when an account is connected. This workspace does not request notification access.</p>';
 if(name==='Storage')panel.innerHTML+='<p>Communication drafts are saved in this browser. Document storage and backup controls remain in the document workspace.</p><button id="backup">Download draft backup</button>';
 if(name==='Shortcuts')panel.innerHTML+='<dl><dt>Tab / Shift + Tab</dt><dd>Next / previous control</dd><dt>Escape</dt><dd>Close dialog</dd><dt>Browser Back</dt><dd>Previous workspace section</dd></dl>';
 if(document.querySelector('#appearance')){document.querySelector('#appearance').value=state.appearance;document.querySelector('#appearance').onchange=e=>{state.appearance=e.target.value;store();document.documentElement.dataset.appearance=state.appearance;};}
 document.querySelector('#motion')?.addEventListener('change',e=>{state.reducedMotion=e.target.checked;store();document.documentElement.dataset.motion=state.reducedMotion?'reduce':'system';});
 document.querySelector('#manage')?.addEventListener('click',()=>navigate('Connections'));
 document.querySelector('#backup')?.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(state.drafts,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='JJTY-drafts.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 };surface.querySelectorAll('[data-setting]').forEach(b=>b.onclick=()=>show(b.dataset.setting));show('Appearance');
}
render();
