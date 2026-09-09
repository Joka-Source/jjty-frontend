import {TEXT_MARKUP_ACTS,MARKUP_COLORS,normalizeMarkupColor} from './text-markup.js';
import {pdfSelectionTarget,selectionStillCurrent} from './pdf-selection.js';

export function initAnnotationToolbar({currentDoc,root,run,canUndo,getColor=()=>'yellow',setColor=()=>{}}) {
  const toolbar=document.createElement('section');toolbar.id='annotation-toolbar';toolbar.setAttribute('aria-label','Annotation tools');
  toolbar.innerHTML='<div class="annotation-actions"><button type="button" data-annotation="highlight">Highlight</button><button type="button" data-annotation="underline">Underline</button><button type="button" data-annotation="strikethrough">Strikethrough</button><label class="annotation-color-label">Color <select id="annotation-color" aria-label="Markup color"></select></label><button type="button" data-annotation="note">Note</button><button type="button" data-annotation="undo">Undo</button></div><p class="annotation-selection" role="status">Select words in the PDF, then choose a markup tool or add a note.</p><form class="annotation-note" hidden><label for="annotation-note-text">Note on selected words</label><textarea id="annotation-note-text" rows="2" maxlength="10000"></textarea><button type="submit">Save note</button><button type="button" data-annotation="cancel">Cancel</button></form>';
  document.getElementById('reader-chrome').append(toolbar);
  const status=toolbar.querySelector('[role=status]'),form=toolbar.querySelector('form'),input=toolbar.querySelector('textarea');
  const preview=document.getElementById('pdf-annotation-preview');
  preview.dataset.annotation='export';preview.textContent='Export PDF';
  preview.title='Export saved marks and notes. Include form answers from Fill or Organize.';
  toolbar.querySelector('.annotation-actions').append(preview);
  toolbar.append(document.getElementById('pdf-annotation-status'));
  const color=toolbar.querySelector('#annotation-color');for(const choice of MARKUP_COLORS){const option=document.createElement('option');option.value=choice.id;option.textContent=choice.label;color.append(option);}color.value=normalizeMarkupColor(getColor());
  color.addEventListener('change',()=>{try{setColor(normalizeMarkupColor(color.value));}catch(error){color.value=normalizeMarkupColor(getColor());status.textContent=error.message||'Color preference could not be saved.';}});
  let held=null,busy=false,feedback='';
  const button=kind=>toolbar.querySelector(`[data-annotation="${kind}"]`);
  function controls(){
    const valid=selectionStillCurrent(held,currentDoc(),root),unavailable=busy||preview.dataset.exportBusy==='true';
    for(const act of TEXT_MARKUP_ACTS)button(act).disabled=unavailable||!valid;
    color.disabled=unavailable;
    button('note').disabled=unavailable||!valid||held.start.blockIndex!==held.end.blockIndex;
    button('undo').disabled=unavailable||!currentDoc()||!canUndo();button('export').disabled=unavailable||!currentDoc()||(!form.hidden&&!!input.value.trim());
    form.querySelector('button[type=submit]').disabled=unavailable||!valid;
    input.disabled=unavailable;button('cancel').disabled=unavailable;
  }
  function capture(){
    if(busy)return;
    const selection=getSelection();
    const inTools=document.getElementById('reader-chrome').contains(document.activeElement);
    if(selection?.isCollapsed && (inTools||!form.hidden))return;
    const candidate=pdfSelectionTarget(selection,currentDoc(),root);
    if(inTools&&!candidate)return;
    held=candidate;if(candidate)feedback='';
    status.textContent=held?`Whole-word selection: “${held.quote.slice(0,240)}${held.quote.length>240?'…':''}”`:(feedback||'Select words in the PDF, then choose a markup tool or add a note.');
    controls();
  }
  document.addEventListener('selectionchange',capture);
  // Preserve the selected text while pointer/keyboard focus enters the toolbar.
  toolbar.addEventListener('pointerdown',event=>{if(event.target.closest('.annotation-actions button'))event.preventDefault();});
  async function perform(kind){
    if(busy)return;
    if(preview.dataset.exportBusy==='true'){status.textContent='Wait for the current PDF export to finish.';return;}
    const target=held,noteText=input.value.trim();
    if(kind!=='undo'&&!selectionStillCurrent(target,currentDoc(),root)){status.textContent='Select the words again in this document.';return;}
    if(kind==='annotate'&&!noteText){input.focus();return;}
    document.getElementById('pdf-annotation-status').textContent='';
    busy=true;document.getElementById('pdf-annotation-preview').disabled=true;controls();status.textContent='Saving on this device…';
    try {
      const saved=await run(kind,target,noteText,normalizeMarkupColor(color.value));
      if(!saved?.id || !saved.receipt || !saved.cursor)throw new Error('The change could not be saved. Your selection and note are kept here; try again.');
      if(kind==='annotate'){form.hidden=true;input.value='';}
      feedback=kind==='undo'?'Last change undone.':'Saved on this device. Original unchanged.';status.textContent=feedback;
    }catch(error){feedback=error.message;status.textContent=feedback;}
    finally{busy=false;document.getElementById('pdf-annotation-preview').disabled=false;controls();}
  }
  for(const act of TEXT_MARKUP_ACTS)button(act).addEventListener('click',()=>void perform(act));
  button('note').addEventListener('click',()=>{form.hidden=false;input.focus();controls();});
  button('undo').addEventListener('click',()=>void perform('undo'));
  new MutationObserver(controls).observe(preview,{attributes:true,attributeFilter:['data-export-busy']});
  button('cancel').addEventListener('click',()=>{form.hidden=true;input.value='';capture();});
  input.addEventListener('input',controls);
  addEventListener('beforeunload',event=>{if(!form.hidden&&input.value.trim()){event.preventDefault();event.returnValue='';}});
  document.getElementById('pdf-annotation-preview').addEventListener('click',event=>{if(!form.hidden&&input.value.trim()){event.stopImmediatePropagation();status.textContent='Save or cancel your note before exporting.';}},true);
  form.addEventListener('submit',event=>{event.preventDefault();void perform('annotate');});
  new MutationObserver(()=>{
    if(held&&!selectionStillCurrent(held,currentDoc(),root)){
      held=null;if(!input.value.trim())form.hidden=true;status.textContent=input.value.trim()?'Your note draft is kept. Select its words again before saving.':'Select words in the PDF, then choose a markup tool or add a note.';
    }
    controls();
  }).observe(root,{childList:true,subtree:true});
  controls();return {toolbar,refresh:controls,clearSelection(){held=null;form.hidden=true;feedback='';status.textContent='Select words in the PDF, then choose a markup tool or add a note.';controls();},beforeLeave(){if(!form.hidden&&input.value.trim())throw new Error("Save or cancel your note in Annotate before changing the document view.");}};
}
