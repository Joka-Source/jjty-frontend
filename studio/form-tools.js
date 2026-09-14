import {initPdfFormPanel} from '../src/pdf-form-panel.js';
import {putDoc} from '../src/db.js';

export function formToolsView(){return `<p>Fill the document’s own fields. Your answers are kept separately until you review a filled copy.</p><p id="real-form-empty" role="status">Reading form fields…</p><section id="pdf-form-panel" hidden><p id="pdf-form-status" role="status"></p><div id="pdf-form-fields"></div><button id="pdf-form-preview" class="a-btn a-primary">Review filled copy</button><button id="pdf-form-download" hidden>Download filled copy</button><button id="pdf-form-retry" class="a-btn" hidden>Retry saving answers</button></section>`;}
export function mountFormTools({host,source,createCopy}){
 let disposed=false,writes=0,failed=false,revision=0;
 const current=()=>!disposed&&host.querySelector('#pdf-form-panel')?.isConnected&&location.hash.split('/')[1]===encodeURIComponent(source.id);
 const beforeUnload=event=>{if(writes||failed){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);
 const review={close(){revision++;},prepare(){const held=++revision;return()=>current()&&revision===held;},async open(bytes,name){if(!current())return false;await createCopy(bytes,name,'filled');return true;}};
 const panel=initPdfFormPanel({root:host.querySelector('[data-real-panel=forms]'),review,saveDocument:async doc=>{writes++;try{await putDoc(doc);failed=false;}catch(error){failed=true;throw error;}finally{writes--;}}});
 const ready=panel.setDocument(structuredClone(source)).then(()=>{if(!current())return;host.querySelector('#real-form-empty').textContent=host.querySelector('#pdf-form-panel').hidden?'This PDF has no fillable form fields. Use Write to add text on the page.':'';});
 return {ready,pending:()=>writes>0||panel.pending(),beforeLeave(){panel.beforeLeave();if(writes)throw new Error('Wait for your form answers to finish saving.');if(failed)throw new Error('Retry saving your answers before leaving this form.');},dispose(){window.removeEventListener('beforeunload',beforeUnload);disposed=true;revision++;panel.dispose();}};
}
