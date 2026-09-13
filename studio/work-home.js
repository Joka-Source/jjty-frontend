import {esc,icon} from './screens.js';
import {savedWork,workRows} from './saved-work.js';
import {getDoc} from '../src/db.js';
import {selectAvailablePdfEngine} from '../src/pdf-engine.js';
import './work-home.css';

export function workHomeView(){return `<div class="a-page work-home">
 <div class="work-heading"><div><h1>Your work</h1><p>Documents and notes, ready when you are.</p></div><label class="a-btn a-primary real-file-label">${icon('plus')} Import PDF<input type="file" id="real-file-input" accept="application/pdf,.pdf"></label></div>
 <label class="work-search">${icon('search')}<input id="work-search" type="search" placeholder="Find a document or notebook" aria-label="Find a document or notebook"><button type="button" id="work-search-clear" aria-label="Clear search" hidden>${icon('close')}</button></label>
 <p id="real-status" role="status" aria-live="polite"></p>
 <section id="work-home-content" aria-label="Saved documents and notebooks" aria-busy="true"><p class="work-loading" role="status">Opening your work…</p></section>
 <div class="work-shortcuts"><a href="#scan">${icon('camera')}<span><strong>Scan pages</strong><small>Paper to PDF</small></span>${icon('chevron')}</a><a href="/notebooks/index.html">${icon('pen')}<span><strong>Notebooks</strong><small>Write and keep your notes</small></span>${icon('chevron')}</a></div>
 </div>`;}

export async function mountWorkHome(host){
 const section=host.querySelector('#work-home-content'),search=host.querySelector('#work-search');if(!section||!search)return;
 let items=[];
 const draw=()=>{
  if(!section.isConnected)return;
  const query=search.value.trim().toLocaleLowerCase();host.querySelector('#work-search-clear').hidden=!search.value;const matches=items.filter(x=>`${x.title} ${x.detail}`.toLocaleLowerCase().includes(query));
  section.setAttribute('aria-busy','false');
  if(!items.length){section.innerHTML=`<div class="work-empty"><div class="work-empty-paper" aria-hidden="true">${icon('file')}</div><h2>A place for your next document</h2><p>Import a PDF to read, mark up and keep. Or scan the pages in front of you.</p><button class="a-btn" id="work-empty-import">Choose a PDF ${icon('plus')}</button></div>`;section.querySelector('#work-empty-import').onclick=()=>host.querySelector('#real-file-input').click();return;}
  if(query){section.innerHTML=`<div class="work-section-heading"><h2>Search results</h2><span role="status">${matches.length} ${matches.length===1?'match':'matches'}</span></div>${matches.length?workRows(matches):'<div class="work-no-results"><h3>No matching documents</h3><p>Try another title.</p></div>'}`;return;}
  let current=items[0];try{const last=localStorage.getItem('jetty-last-real-work');current=items.find(x=>last?.startsWith(x.url))||current;}catch{}
  section.innerHTML=`<a class="work-continue" href="${current.url}"><div class="work-preview" aria-hidden="true">${icon(current.symbol)}${current.documentId?'<canvas hidden></canvas>':''}</div><div class="work-continue-copy"><span>Continue working</span><h2>${esc(current.title)}</h2><p>${esc(current.detail)}</p><strong>Open ${icon('arrow')}</strong></div></a><div class="work-section-heading"><h2>Recent</h2><a href="#files">See all ${icon('chevron')}</a></div><div class="work-recent">${workRows(items.slice(0,6))}</div>`;
  if(current.documentId)paintPreview(current,section.querySelector('.work-preview'));
 };
 search.oninput=draw;host.querySelector('#work-search-clear').onclick=()=>{search.value='';draw();search.focus();};
 try{items=await savedWork();draw();}catch{if(section.isConnected){section.setAttribute('aria-busy','false');section.innerHTML='<div class="work-no-results"><h2>Your work could not be opened</h2><p>Your files have not been changed.</p><button class="a-btn" id="work-retry">Try again</button></div>';section.querySelector('#work-retry').onclick=()=>mountWorkHome(host);}}
}

async function paintPreview(item,target){
 let opened;
 try{
  const doc=await getDoc(item.documentId);if(!target?.isConnected||!doc?.sourceBytes)return;
  const engine=await selectAvailablePdfEngine({requirePrimary:true});if(!target.isConnected)return;
  opened=await engine.open(doc.sourceBytes);if(!target.isConnected)return;
  const page=await opened.document.getPage(1);const viewport=page.getViewport({scale:1});const canvas=target.querySelector('canvas');const scaled=page.getViewport({scale:Math.min(1,420/viewport.width)});
  canvas.width=Math.ceil(scaled.width);canvas.height=Math.ceil(scaled.height);
  await page.render({canvasContext:canvas.getContext('2d'),viewport:scaled}).promise;
  if(target.isConnected){canvas.hidden=false;target.querySelector('.icon')?.remove();}
 }catch{/* The document link remains usable when its optional preview is unavailable. */}
 finally{if(opened)await opened.loadingTask.destroy();}
}

export async function mountWorkSearch(host){
 const input=host.querySelector('#a-global-search'),results=host.querySelector('#a-search-results');if(!input||!results)return;
 try{const items=await savedWork();if(!input.isConnected)return;const draw=()=>{const q=input.value.trim().toLocaleLowerCase();const found=items.filter(x=>`${x.title} ${x.detail}`.toLocaleLowerCase().includes(q));results.innerHTML=found.length?workRows(found):'<p role="status">No matching documents or notebooks.</p>';};input.oninput=draw;draw();}catch{if(results.isConnected)results.innerHTML='<p role="status">Search could not load. Open your library to retry.</p>';}
}
