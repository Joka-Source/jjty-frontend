import {renameDocument} from './db.js';

export function initDocumentRename({save=renameDocument,onRenamed}) {
  const button=document.getElementById('rename-document');
  const dialog=document.getElementById('rename-document-dialog');
  const form=document.getElementById('rename-document-form');
  const input=document.getElementById('rename-document-name');
  const submit=document.getElementById('rename-document-save');
  const cancel=document.getElementById('rename-document-cancel');
  const status=document.getElementById('rename-document-status');
  let current=null, editing=null, generation=0, saving=false;
  function close(){generation++;editing=null;saving=false;if(dialog.open)dialog.close();}
  cancel.addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(!saving)close();});
  input.addEventListener('input',()=>input.setCustomValidity(''));
  button.addEventListener('click',()=>{
    if(!current)return;
    generation++;editing={id:current.id};saving=false;
    input.disabled=false;submit.disabled=false;cancel.disabled=false;input.value=current.title;
    input.setCustomValidity('');status.textContent='';
    if(!dialog.open)dialog.showModal();input.focus();input.select();
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!editing || saving || !dialog.open)return;
    const title=input.value.trim();
    input.setCustomValidity(title?'':'Enter a document name.');
    if(!form.reportValidity())return;
    const version=generation,id=editing.id;saving=true;input.disabled=true;submit.disabled=true;cancel.disabled=true;
    status.textContent='Saving name…';let committed=false;
    try{
      const updated=await save(id,title);committed=true;
      await onRenamed(updated);
      if(version===generation)close();
    }catch(error){
      if(version!==generation)return;
      status.textContent=committed?'The name was saved. Reload the library to refresh its display.'
        :error.code==='DOCUMENT_NOT_FOUND'?'This document is no longer in the library.'
        :error.code==='DOCUMENT_TITLE_INVALID'?'Enter a name between 1 and 200 characters.'
        :'The name could not be saved. Try again.';
    }finally{if(version===generation){saving=false;input.disabled=false;submit.disabled=false;cancel.disabled=false;}}
  });
  return {setDocument(doc){if(current?.id!==doc?.id)close();current=doc;button.hidden=!doc;}};
}
