import {esc, icon} from './screens.js';
import {listSourceNotes, saveSourceNote, openOrCreateSourceNotebook} from '../notebooks/source-notes.js';

const composers = new Map();
let session = 0;
export function notesView() {
  return `<section class="real-margin" aria-label="Notes beside this PDF"><div class="real-margin-heading"><div><span class="a-fine">Your thinking, beside the source</span><h2>Margin notes.</h2></div>${icon('pen')}</div><p class="real-notes-boundary">Saved in your editable notebook. These notes stay separate from the exported PDF.</p><form id="source-note-form"><label class="a-field"><span id="source-note-label">Note for this page</span><textarea id="source-note-input" rows="4" maxlength="10000" placeholder="What should you remember about this page?"></textarea></label><div class="real-note-actions"><button type="submit" class="a-btn a-primary">Save note</button><button type="button" class="a-btn" id="source-note-new" hidden>Keep as a new note</button></div></form><p id="source-note-status" role="status" aria-live="polite"></p><div id="source-note-list"></div><button type="button" class="a-btn" id="source-notebook-open">Open the full notebook ${icon('arrow')}</button></section>`;
}

export function mountSourceNotes(host, doc, {getPage, navigate, activity}) {
  const own = ++session;
  const ref = {documentId:doc.id, contentDigest:doc.provenance.contentDigest, title:doc.title, pageCount:doc.provenance.pageCount};
  const key = `${ref.documentId}:${ref.contentDigest}`;
  const composer = composers.get(key) || {text:'', pageIndex:getPage()-1, id:null, revision:null,version:0,pending:null};
  composers.set(key,composer);
  const input = host.querySelector('#source-note-input');
  const form = host.querySelector('#source-note-form');
  const status = host.querySelector('#source-note-status');
  const label = host.querySelector('#source-note-label');
  const fresh = host.querySelector('#source-note-new');
  
  const live = () => own===session && input.isConnected && host.contains(input);
  function feedback(text,error=false) { if(live()){status.textContent=text;status.dataset.error=String(error);} }
  function sync() {
    input.disabled=Boolean(composer.pending);form.querySelector('[type=submit]').disabled=Boolean(composer.pending);fresh.disabled=Boolean(composer.pending);
    if(!composer.text&&!composer.id)composer.pageIndex=getPage()-1;
    input.value=composer.text;
    label.textContent=`${composer.id?'Edit note':'Note'} for page ${composer.pageIndex+1}`;
    fresh.hidden=!composer.id;
  }
  input.oninput=()=>{composer.text=input.value;composer.version++;feedback(composer.text?'Not saved yet. Save this note before closing.':'');};
  fresh.onclick=()=>{if(composer.pending)return;composer.version++;composer.id=null;composer.revision=null;sync();feedback('Your words are kept. Save them as a separate note.');input.focus();};
  async function refresh() {
    try {
      const notes=await listSourceNotes(ref);
      if(!live())return;
      const list=host.querySelector('#source-note-list');
      list.innerHTML=notes.length?notes.map(note=>`<article class="real-source-note"><button class="real-note-source" data-note-page="${note.pageIndex}">${icon('file')} Page ${note.pageIndex+1}</button><p>${esc(note.text)}</p><button class="a-btn" data-note-edit="${esc(note.id)}">Edit note</button></article>`).join(''):'<p class="real-notes-empty">A question, a decision, a detail to return to. Your first note belongs here.</p>';
      list.querySelectorAll('[data-note-page]').forEach(button=>button.onclick=()=>Promise.resolve(navigate(+button.dataset.notePage+1)).catch(error=>feedback(error.message,true)));
      list.querySelectorAll('[data-note-edit]').forEach(button=>button.onclick=()=>{
        if(composer.pending){feedback('Your note is being saved.');return;}if(composer.text){feedback('Save your current words before opening another note.',true);input.focus();return;}
        const note=notes.find(n=>n.id===button.dataset.noteEdit);
        Object.assign(composer,{id:note.id,revision:note.revision,text:note.text,pageIndex:note.pageIndex,version:composer.version+1});sync();input.focus();
      });
    } catch(error){feedback('Notes could not be loaded. '+error.message,true);}
  }
  form.onsubmit=async event=>{
    event.preventDefault();if(composer.pending)return;
    const text=composer.text.trim();if(!text){feedback('Write a note before saving.');input.focus();return;}
    const submission={text,pageIndex:composer.pageIndex,version:composer.version,...(composer.id?{id:composer.id,expectedRevision:composer.revision}:{})};
    const token=Symbol('note-save');composer.pending=token;sync();let succeeded=false,errorMessage='';
    const ticket=activity?.begin('Saving your note','Keeping it with its source page.');
    try {
      await openOrCreateSourceNotebook(ref);
      await saveSourceNote(ref,submission);
      succeeded=true;
      if(composer.version===submission.version)Object.assign(composer,{text:'',id:null,revision:null,version:composer.version+1});
      activity?.finish(ticket,'Note saved','Available in the full notebook.');
      if(live()){sync();await refresh();feedback('Note saved in your notebook. Source PDF unchanged.');}
    } catch(error){errorMessage=error.message;activity?.fail(ticket,'Note needs attention',error.message);feedback(error.code==='NOTEBOOK_CONFLICT'||error.code==='SOURCE_NOTE_CONFLICT'?'This note changed in another window. Your words are still here. Keep them as a new note or review the latest notebook.':'Your words are still here. Save again to retry. '+error.message,true);}
    finally{if(composer.pending===token)composer.pending=null;void composer.onSettled?.({succeeded,errorMessage});}
  };
  host.querySelector('#source-notebook-open').onclick=async()=>{
    if(composer.text){feedback('Save your current note before opening the full notebook.',true);input.focus();return;}
    try{const notebook=await openOrCreateSourceNotebook(ref);if(live())location.href=`/notebooks/index.html?notebook=${encodeURIComponent(notebook.id)}`;}
    catch(error){feedback(error.message,true);}
  };
  composer.onSettled=async({succeeded,errorMessage})=>{if(!live())return;sync();await refresh();if(!live())return;feedback(succeeded?'Note saved in your notebook. Source PDF unchanged.':'Your words are still here. Save again to retry. '+errorMessage,!succeeded);if(succeeded)input.focus();};
  sync();if(composer.pending)feedback('Saving your note…');void refresh();
  return {pageChanged(){if(live())sync();},focus(){input.focus();input.scrollIntoView({block:'center'});}};
}
window.addEventListener('beforeunload',event=>{if([...composers.values()].some(c=>c.text)){event.preventDefault();event.returnValue='';}});
