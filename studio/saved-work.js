import {getDocs} from '../src/db.js';
import {readWorkspace} from '../notebooks/storage.js';
import {esc,icon} from './screens.js';
export async function savedWork() {
  const [docs,workspace]=await Promise.all([getDocs(),readWorkspace()]);
  return [...docs.filter(d=>d.sourceBytes&&d.provenance?.sourceKind==='pdf').map(d=>({documentId:d.id,title:d.title,detail:d.provenance?.derivedFrom?'Reviewed PDF':'Saved document',date:Date.parse(d.createdAt)||0,url:d.provenance?.sourceKind==='pdf'?`#editor/${encodeURIComponent(d.id)}`:'../index.html',symbol:'file'})),...(workspace?.notebooks||[]).filter(n=>!n.trashed).map(n=>({title:n.title,detail:n.sourceRef?'Notes linked to a PDF':'Editable notebook',date:n.updated||0,url:`/notebooks/index.html?notebook=${encodeURIComponent(n.id)}`,symbol:'pen'}))].sort((a,b)=>b.date-a.date);
}
export function workRows(items){return items.map(item=>`<a href="${item.url}" class="a-file-row"><span class="a-file-icon a-blue">${icon(item.symbol)}</span><span><strong>${esc(item.title)}</strong><small>${item.detail}</small></span>${icon('chevron')}</a>`).join('');}
export async function mountSavedWork(host) {
  const section=host.querySelector('#a-saved-work');if(!section)return;
  try{const items=await savedWork();if(!section.isConnected)return;section.innerHTML=items.length?`<div class="a-section-heading"><h2>Your saved work</h2><a class="a-btn a-text" href="#files">Open library</a></div>${workRows(items.slice(0,5))}`:'';}
  catch{if(section.isConnected)section.innerHTML='<p role="status">Saved work could not be loaded. Open the library to retry.</p>';}
}
