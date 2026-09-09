import {validateTextEditDraft} from './pdf-edit-draft.js';
import './pdf-edit-workspace.css';

const editMessages={
 EDIT_DIFF_LIMIT:'This replacement is too large to compare safely. Make a smaller edit or split it into steps.',
 EDIT_DOCUMENT_RESTRICTED:'This PDF has protected or unsupported features. Edit an unrestricted copy instead.',
 EDIT_PAGE_INVALID:'That page is unavailable. Choose a page in this PDF.',
 EDIT_PARAGRAPH_STALE:'The paragraph changed since this draft began. Discard the draft and select it again.',
 EDIT_PARAGRAPH_LOCKED:'This paragraph cannot be edited safely. Choose another paragraph.',
 EDIT_GLYPH_UNSUPPORTED:'The paragraph font cannot display one of the replacement characters.',
 EDIT_GLYPH_UNVERIFIED:'The paragraph font could not be verified for these replacement characters.',
 EDIT_REGION_OVERLAPS_ANNOTATION:'This edit touches a saved mark or note. Choose an unmarked paragraph.',
 EDIT_REGION_OVERLAPS_LINK:'This edit touches a link. Choose a paragraph away from links.',
 EDIT_REGION_OVERLAPS_WIDGET:'This edit touches a form field. Choose a paragraph away from form fields.',
 EDIT_REGION_OUTSIDE_PAGE:'The replacement would extend beyond the page. Shorten the text.',
 EDIT_SOURCE_TEXT_MISMATCH:'The paragraph could not be matched exactly to the original PDF.',
 EDIT_REPLACEMENT_TEXT_MISMATCH:'The exported PDF did not retain all of your replacement text.',
 EDIT_SURROUNDING_TEXT_CHANGED:'The edit changed other text. The new copy was rejected.',
 EDIT_OUTSIDE_PIXELS_CHANGED:'The edit changed the page outside the selected paragraph. The new copy was rejected.',
 EDIT_PAGE_SEMANTICS_CHANGED:'The edit changed page geometry or annotations. The new copy was rejected.',
 EDIT_FORMS_CHANGED:'The edit changed existing form fields. The new copy was rejected.',
 EDIT_TEXT_INVALID:'Enter nonempty replacement text within the length limit.',
 EDIT_TEXT_UNCHANGED:'Change the paragraph text before reviewing an edited copy.',
 EDIT_DRAFT_INVALID:'This saved draft no longer matches its source. Discard it to begin again.',
};
function explain(error){
 const code=error?.code||error?.message;
 if(editMessages[code])return editMessages[code];
 if(/^EDIT_.*LIMIT$/.test(code))return 'This document is too large for this editing workflow. Try a smaller copy.';
 if(/^EDIT_[A-Z_]+$/.test(code))return 'This edit could not be verified safely. Try another paragraph or keep the original.';
 if(error?.name==='QuotaExceededError')return 'Device storage is full. Free space and retry saving.';
 return error?.message||'Please try again.';
}

/** A durable, single-paragraph draft. Source bytes and reviewed copies belong to the caller. */
export function initPdfEditWorkspace({panel,getContext,snapshot,saveDraft,review}){
 panel.classList.add('pdf-edit-workspace');
 panel.innerHTML='<h2>Edit text</h2><p>Edit a paragraph, then review a new copy.</p><div class="pdf-edit-selectors"><form class="pdf-edit-page-form"><label>Page <input id="pdf-edit-page" inputmode="numeric" pattern="[0-9]+" aria-label="Page to edit" required></label><button id="pdf-edit-load" type="submit">Load paragraphs</button></form><label class="pdf-edit-paragraph-label">Paragraph <select id="pdf-edit-paragraph" disabled><option value="">Load a page first</option></select></label></div><section id="pdf-edit-draft" hidden><p id="pdf-edit-target"></p><details><summary>Original text</summary><p id="pdf-edit-original"></p></details><label for="pdf-edit-text">Replacement text</label><textarea id="pdf-edit-text" aria-describedby="pdf-edit-target" rows="3" maxlength="100000"></textarea><div class="pdf-edit-actions"><button id="pdf-edit-review" type="button">Review edited copy</button><button id="pdf-edit-retry" type="button" hidden>Retry save</button><button id="pdf-edit-discard" type="button">Discard draft</button></div></section><p id="pdf-edit-status" role="status" aria-live="polite"></p>';
 const $=id=>panel.querySelector(`#pdf-edit-${id}`),pageInput=$('page'),select=$('paragraph'),text=$('text'),status=$('status');
 let owner=null,generation=0,disposed=false,draft=null,paragraphs=[],loadedPage=null,busy=false,pending=0,writeRevision=0,failed=false,saveQueue=Promise.resolve(),invalidDraft=false,wasActive=false;
 const identity=doc=>doc?.id&&doc.provenance?.contentDigest?`${doc.id}:${doc.provenance.contentDigest}`:null;
 const owns=(version,sourceOwner)=>!disposed&&version===generation&&identity(getContext()?.doc)===sourceOwner&&getContext()?.active;
 const changed=()=>!!draft&&draft.text!==draft.originalText;
 function message(value){status.textContent=value;}
 function controls(){
  const active=!!getContext()?.active,blocked=busy||pending>0;
  $('load').disabled=!active||blocked||changed()||invalidDraft||failed;
  pageInput.disabled=blocked||changed()||invalidDraft;
  select.disabled=blocked||!paragraphs.length||changed()||invalidDraft||failed;
  text.disabled=busy||invalidDraft;
  $('review').disabled=blocked||failed||invalidDraft||!changed()||!draft.text.trim();
  $('retry').hidden=!failed;$('retry').disabled=pending>0||busy;
  $('discard').disabled=pending>0||busy;
  $('draft').hidden=!draft&&!invalidDraft&&!failed;
  $('target').textContent=draft&&!invalidDraft?`Editing page ${draft.pageIndex+1}: “${draft.originalText.slice(0,100)}${draft.originalText.length>100?'…':''}”`:'';
 }
 function persist(value){
  const context=getContext(),doc=context?.doc,sourceOwner=identity(doc),version=generation,revision=++writeRevision;
  const held=value?structuredClone(value):null;pending++;failed=false;message('Saving draft on this device…');controls();
  const operation=saveQueue.then(()=>saveDraft(doc,held));
  saveQueue=operation.catch(()=>{});
  void operation.then(()=>{
   if(owns(version,sourceOwner)&&revision===writeRevision){failed=false;message(held?'Draft saved on this device. Review it to create an edited PDF.':'Draft discarded.');}
  },error=>{
   if(owns(version,sourceOwner)&&revision===writeRevision){failed=true;message(`Draft could not be saved: ${explain(error)}`);}
  }).finally(()=>{pending--;if(!disposed)controls();});
 }
 function choose(paragraph){
  const doc=getContext().doc;draft={sourceDigest:doc.provenance.contentDigest,pageIndex:loadedPage,paragraphId:paragraph.id,originalBox:structuredClone(paragraph.box),originalRotation:paragraph.rotation??0,originalText:paragraph.runs.map(run=>run.text).join(''),text:paragraph.runs.map(run=>run.text).join('')};
  $('original').textContent=draft.originalText;text.value=draft.text;invalidDraft=false;failed=false;message('Change the text, then review the edited copy.');controls();
 }
 async function load(){
  if(busy||pending||changed()||invalidDraft||failed)return;
  if(!/^[1-9]\d*$/.test(pageInput.value.trim())){message('Enter a physical page number starting at 1.');return;}
  const pageIndex=Number(pageInput.value)-1;if(!Number.isSafeInteger(pageIndex)){message('That page number is unavailable.');return;}
  const doc=getContext()?.doc,sourceOwner=identity(doc),version=++generation;busy=true;message('Reading editable paragraphs…');controls();
  try{
   const bytes=await snapshot(doc);if(!owns(version,sourceOwner))return;
   const {inspectEditablePage}=await import('./pdf-text-editor.js');if(!owns(version,sourceOwner))return;
   const model=await inspectEditablePage(bytes,pageIndex);if(!owns(version,sourceOwner))return;
   paragraphs=model.paragraphs.filter(p=>p.editable&&!p.lockReason&&p.runs?.some(run=>run.text?.trim()));loadedPage=pageIndex;select.replaceChildren();
   const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=paragraphs.length?'Choose a paragraph':'No supported editable paragraphs';select.append(placeholder);
   paragraphs.forEach((p,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=`${index+1}. ${p.runs.map(run=>run.text).join('').slice(0,110)}`;select.append(option);});
   draft=null;text.value='';message(paragraphs.length?'Choose the paragraph you want to edit.':'This page has no supported editable paragraphs. Scanned text needs OCR first.');
  }catch(error){if(owns(version,sourceOwner))message(`This page could not be prepared: ${explain(error)}`);}
  finally{if(version===generation){busy=false;controls();}}
 }
 panel.querySelector('form').addEventListener('submit',event=>{event.preventDefault();void load();});
 select.addEventListener('change',()=>{if(!changed()&&!busy&&!pending&&paragraphs[Number(select.value)]&&select.value!=='')choose(paragraphs[Number(select.value)]);});
 text.addEventListener('input',()=>{if(!draft||busy||invalidDraft)return;draft={...draft,text:text.value};persist(changed()?draft:null);});
 $('retry').addEventListener('click',()=>{if(!pending&&!busy)persist(changed()?draft:null);});
 $('discard').addEventListener('click',()=>{if(pending||busy)return;draft=null;invalidDraft=false;text.value='';select.value='';persist(null);});
 $('review').addEventListener('click',async()=>{
  if(busy||pending||failed||!changed()||invalidDraft)return;
  const context=getContext(),doc=context.doc,sourceOwner=identity(doc),version=++generation,held=structuredClone(draft);busy=true;message('Checking the edited copy…');controls();
  try{
   const bytes=await snapshot(doc);if(!owns(version,sourceOwner))return;
   const {editPdfParagraph}=await import('./pdf-text-editor.js');if(!owns(version,sourceOwner))return;
   const result=await editPdfParagraph(bytes,held);if(!owns(version,sourceOwner))return;
   const opened=await review(result.bytes,doc);if(owns(version,sourceOwner))message(opened===false?'The review was cancelled. Your draft remains saved.':'The edited copy is ready for review. Your draft remains saved.');
  }catch(error){if(owns(version,sourceOwner))message(`The edited copy could not be created: ${explain(error)}. Your draft is kept.`);}
  finally{if(version===generation){busy=false;controls();}}
 });
 function refresh(){
  if(disposed)return;const context=getContext(),nextOwner=identity(context?.doc),active=!!context?.active;
  panel.hidden=!active;
  if(nextOwner!==owner||!active||!wasActive){
   generation++;busy=false;paragraphs=[];loadedPage=null;select.replaceChildren();owner=nextOwner;
   draft=context?.doc?.textEditDraft?structuredClone(context.doc.textEditDraft):null;failed=false;
   invalidDraft=false;if(draft){try{draft=validateTextEditDraft(draft,context.doc.provenance?.contentDigest);}catch{invalidDraft=true;}}
   pageInput.value=String((draft?.pageIndex??context?.pageIndex??0)+1);text.value=draft?.text??'';$('original').textContent=draft?.originalText??'';
   if(draft&&!invalidDraft){const option=document.createElement('option');option.value='saved';option.textContent=`Saved paragraph: ${draft.originalText.slice(0,100)}`;select.append(option);select.value='saved';}
   message(invalidDraft?'This saved draft no longer matches its source. Discard it to begin again.':draft?'Saved draft restored. Review it or discard it to choose another paragraph.':'Choose a page to edit.');
  }
  wasActive=active;controls();
 }
 const unload=event=>{if(pending>0||failed){event.preventDefault();event.returnValue='';}};
 globalThis.addEventListener('beforeunload',unload);
 refresh();return {refresh,beforeLeave(){if(pending>0)throw new Error('Wait for your text edit draft to finish saving before changing the document view.');if(failed)throw new Error('Retry saving or discard your text edit draft before changing the document view.');},dispose(){disposed=true;generation++;globalThis.removeEventListener('beforeunload',unload);panel.replaceChildren();}};
}
