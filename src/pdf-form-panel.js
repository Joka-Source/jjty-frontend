import {inspectPdfForm, fillPdfForm} from './pdf-forms.js';
import {initPdfReview} from './pdf-review.js';
import {exportCombinedPdf} from './pdf-combined.js';

function combinedError(error){
  const messages={
    COMBINED_SOURCE_INVALID:'The original PDF is unavailable. Reopen it before exporting.',
    COMBINED_SOURCE_DIGEST_MISMATCH:'The stored original no longer matches this document.',
    COMBINED_DRAFT_DIGEST_MISMATCH:'The saved answers belong to a different source PDF. Reopen the original before exporting.',
    COMBINED_FIELD_SCHEMA_CHANGED:'The form fields changed while preparing the copy. Your original and saved answers are unchanged.',
    COMBINED_ANNOTATIONS_CHANGED:'The filled copy did not retain every mark correctly. Your saved work is unchanged.',
    COMBINED_FIELDS_CHANGED:'The combined copy did not retain every answer correctly. Your saved work is unchanged.',
    COMBINED_MARK_OVERLAPS_CHANGED_WIDGET:'A mark overlaps a field being filled. Undo or move that mark before combining the copy.',
    COMBINED_DRAFT_NOT_SAVED:'Save the answers successfully before preparing this copy.',
    COMBINED_DRAFT_FIELD_UNKNOWN:'A saved answer no longer matches a field in this PDF.',
    COMBINED_DOCUMENT_RESTRICTED:'This PDF has encryption, signature protection or unsupported form behavior.',
    CONFLICTING_SHARED_FORM_VALUES:'Linked fields contain conflicting saved answers. Correct them before exporting.',
    ANNOTATION_ANCHOR_NOT_EXACT:'A saved mark has no verified word-level target. Undo that mark and select its words again.',
    ANNOTATION_RANGE_ANCHOR_INVALID:'A saved range no longer matches the source. Undo it and select its endpoints again.',
    ANNOTATION_RANGE_PAGE_GAP:'An intermediate page in a saved range could not be verified.',
    ANNOTATION_NOTE_MARGIN_UNAVAILABLE:'A page has no clear margin for a note without covering text or form fields.',
  };
  return messages[error.code] || error.message;
}

export function initPdfFormPanel({saveDocument, getRecords, review=initPdfReview()}) {
  const $=id=>document.getElementById(id), panel=$('pdf-form-panel'), status=$('pdf-form-status'), fields=$('pdf-form-fields'), download=$('pdf-form-download');
  const includeMarks=$('pdf-form-include-marks');
  let current=null, generation=0, schema=null, values={}, pending=0, exporting=false, failed=false, queue=Promise.resolve();
  const drafts=new Map();
  const explanations={'encrypted':'This encrypted PDF cannot be filled here yet.','form-permission-denied':'This PDF does not permit form filling.','xfa-unsupported':'This dynamic XFA form needs a compatible form application.','calculated-form-unsupported':'This form has automatic calculations that are not supported here yet.','signature-protection':'This PDF has signature protection; export is disabled.','signed-document':'This PDF already has a digital signature; export is disabled.','field-type-unsupported':'This field type is not supported yet.','rich-text-unsupported':'Rich-text formatting is not supported yet.','multi-select-unsupported':'Multiple-choice selections are not supported yet.','field-actions-unsupported':'This field requires document scripts that are not run here.'};
  const explain=code=>code==='shared-checkbox-states-unsupported'?'These linked checkboxes use different values and cannot be edited here yet.':explanations[code] || String(code).replaceAll('-', ' ');
  const bytes=doc=>new Uint8Array(Object.values(doc.sourceBytes));
  function controls(){download.disabled=!schema?.canFill || pending>0 || exporting || failed;$('pdf-form-preview').disabled=download.disabled;$('pdf-form-retry').hidden=!failed;$('pdf-form-retry').disabled=pending>0 || exporting;for(const input of fields.querySelectorAll('[data-editable]'))input.disabled=exporting || input.dataset.editable!=='true';if(includeMarks)includeMarks.disabled=download.disabled;download.textContent=includeMarks?.checked?'Download combined copy':'Download filled copy';$('pdf-form-preview').textContent=includeMarks?.checked?'Review combined copy':'Review filled copy';}
  includeMarks?.addEventListener('change',controls);
  function persist(){
    const doc=current, version=generation, snapshot=structuredClone(values);
    const draftState={sourceDigest:doc.provenance.contentDigest,values:snapshot,saved:false};drafts.set(doc.id,draftState);
    pending++;failed=false;status.textContent='Saving answers on this device…';controls();
    queue=queue.catch(()=>{}).then(async()=>{
      const draft={sourceDigest:doc.provenance.contentDigest,values:snapshot};
      await saveDocument({...doc,formDraft:draft});doc.formDraft=draft;draftState.saved=true;
    }).then(()=>{if(version===generation){failed=false;status.textContent='Answers saved on this device. Your original is unchanged.';}},()=>{if(version===generation){failed=true;status.textContent='Answers could not be saved. Retry saving; keep this page open.';}}).finally(()=>{if(version===generation){pending--;controls();}});
  }
  function render(){
    fields.replaceChildren();
    const groups=new Map();for(const field of schema.fields){const key=field.name || field.key;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(field);}
    let index=0;
    for(const group of groups.values()){
      const field=group[0], wrap=document.createElement('div'), label=document.createElement('label'), id=`pdf-answer-${index++}`;
      wrap.className='pdf-form-field';label.htmlFor=id;label.textContent=`${field.label || field.name || 'Unnamed field'}${field.required?' (required)':''}`;
      const hint=document.createElement('small');hint.textContent=`Page ${[...new Set(group.map(f=>f.pageIndex+1))].join(', ')}`;
      let input;
      if(field.type==='checkbox'){input=document.createElement('input');input.type='checkbox';input.checked=!!values[field.key];}
      else if(field.type==='radio' || field.type==='choice'){
        input=document.createElement('select');const options=field.type==='radio'?group.map(f=>({value:f.exportValue,label:f.exportValue})):field.options;
        if(!field.value){const option=document.createElement('option');option.value='';option.textContent='Choose…';option.disabled=true;input.append(option);}
        for(const item of new Map((options || []).map(o=>[o.value,o])).values()){const option=document.createElement('option');option.value=item.value;option.textContent=item.label;input.append(option);}
        input.value=values[field.key] ?? '';
      }else{input=document.createElement(field.multiline?'textarea':'input');if(!field.multiline)input.type='text';input.value=values[field.key] ?? '';if(field.maxLength>0)input.maxLength=field.maxLength;}
      input.id=id;input.dataset.fieldName=field.name;input.dataset.fieldType=field.type;
      input.disabled=!schema.canFill || group.some(f=>f.readOnly || f.unsupported?.length);input.required=!!field.required && !input.disabled;input.dataset.editable=String(!input.disabled);
      input.addEventListener('input',()=>{for(const f of group)values[f.key]=field.type==='checkbox'?input.checked:input.value;persist();});
      wrap.append(label,hint,input);
      const notes=group.flatMap(f=>f.unsupported || []);if(field.readOnly)notes.push('Read only.');if(notes.length){const note=document.createElement('small');note.textContent=notes.map(explain).join(' ');wrap.append(note);}
      fields.append(wrap);
    }
    controls();
  }
  $('pdf-form-retry').addEventListener('click',()=>{if(failed && !pending)persist();});
  async function prepareCopy(preview=false){
    if(download.disabled || [...fields.querySelectorAll('input,select,textarea')].some(input=>!input.reportValidity()))return;
    const ownsReview=preview?review.prepare():null;
    const include=!!includeMarks?.checked;
    const doc=current, version=generation, snapshot=Object.fromEntries(schema.fields.filter(f=>!f.readOnly && !f.unsupported.length && values[f.key]!==f.value).map(f=>[f.key,values[f.key]]));exporting=true;controls();status.textContent='Preparing and checking your filled copy…';
    try{
      let result,manifest;
      if(include){
        const held=drafts.get(doc.id);
        const durableDraft=held?.saved && held.sourceDigest===doc.provenance.contentDigest?{sourceDigest:held.sourceDigest,values:held.values}:doc.formDraft;
        const source=structuredClone(doc),savedFormDraft=structuredClone(durableDraft ?? null);
        if(typeof getRecords!=='function')throw new Error('Saved marks could not be read.');
        const committedRecords=await getRecords(doc.id);
        if(version!==generation)return;
        ({bytes:result,manifest}=await exportCombinedPdf({source,savedFormDraft,committedRecords,allowFormOnly:true}));
      }else result=await fillPdfForm(bytes(doc),snapshot);
      if(version!==generation)return;
      const hasMarks=include && manifest.localAnnotationCount>0;
      const filename=`${(doc.provenance.name || doc.title || 'document').replace(/\.pdf$/i,'')}-${hasMarks?'combined':'filled'}.pdf`;
      if(preview){
        if(!ownsReview()){status.textContent='A newer review replaced this request.';return;}
        const rendered=await review.open(result,filename,{kind:hasMarks?'filled and annotated':'filled'});
        if(version===generation)status.textContent=rendered?(hasMarks?'Your saved answers and local marks are ready to review or download.':include?'Your saved answers are ready. There were no surviving local marks to include.':'Your saved answers are ready to review or download.'):'The review was closed or could not be rendered.';
        return;
      }
      const url=URL.createObjectURL(new Blob([result],{type:'application/pdf'})), link=document.createElement('a');
      link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
      status.textContent=hasMarks?'Combined copy prepared with saved answers and local marks. Your original is unchanged.':'Filled copy prepared. Your original and saved answers remain on this device.';
    }catch(error){if(version===generation)status.textContent=`The ${include?'combined':'filled'} copy could not be created: ${combinedError(error)}`;}
    finally{if(version===generation){exporting=false;controls();}}
  }
  download.addEventListener('click',()=>void prepareCopy());
  $('pdf-form-preview').addEventListener('click',()=>void prepareCopy(true));
  return {async setDocument(doc){
    review.close();
    if(includeMarks)includeMarks.checked=false;
    const version=++generation;current=doc;schema=null;values={};pending=0;exporting=false;failed=false;panel.hidden=true;fields.replaceChildren();controls();
    if(doc?.provenance?.sourceKind!=='pdf' || !doc.sourceBytes)return;
    try{
      await queue;if(version!==generation)return;
      const next=await inspectPdfForm(bytes(doc));if(version!==generation)return;
      if(!next.fields.length && !next.restrictions.length)return;
      schema=next;const held=drafts.get(doc.id);const draft=held?.sourceDigest===doc.provenance.contentDigest?held:doc.formDraft;
      const saved=draft?.sourceDigest===doc.provenance.contentDigest?draft.values:{};failed=held?.saved===false;
      for(const field of schema.fields)values[field.key]=saved?.[field.key] ?? field.value;
      panel.hidden=false;status.textContent=next.restrictions.length?next.restrictions.map(explain).join(' '):failed?'Answers could not be saved. Retry saving; keep this page open.':draft?'Your saved answers are ready.':'Fill the fields, then download your copy.';render();
    }catch(error){if(version===generation){panel.hidden=false;status.textContent=`Form fields could not be read: ${error.message}`;}}
  }};
}
