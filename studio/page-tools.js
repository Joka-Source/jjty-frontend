import {rotatePdfPages} from '../src/pdf-rotation.js';
import {reorderPdfPages} from '../src/pdf-reorder.js';
import {extractPdfPages} from '../src/pdf-extract.js';
import {mergePdfDocuments} from '../src/pdf-merge.js';
import {parsePageOrder,parsePageSelection,MAX_ORDER_INPUT_LENGTH} from '../vendor/bentopdf/page-order.js';

function explain(error){const code=error.code||error.message||'';if(/DOCUMENT_RESTRICTED/.test(code))return 'This PDF is protected, signed, or uses an unsupported form type.';if(/PERMISSION_DENIED/.test(code))return 'This PDF does not permit page changes.';if(/STRUCTURE_UNSUPPORTED|CATALOG_UNSUPPORTED|OUTLINE_UNSUPPORTED|ANNOTATION_UNSUPPORTED|ACTION_UNSUPPORTED|DESTINATION_UNSUPPORTED/.test(code))return 'This PDF has forms, navigation, or other structures that cannot safely be changed with this tool.';if(/CONTENT_CHANGED/.test(code))return 'The new copy could not be verified. Try another document or keep the current copy.';if(/PAGE_LIMIT/.test(code))return 'The result would exceed the supported page count.';return error.message||'The PDF could not be processed.';}

export function pageToolsView(){return `<section class="studio-page-tools" aria-label="Page tools">
 <p class="page-tools-intro">Arrange your PDF. Each action saves a separate copy; your original stays intact.</p>
 <div class="page-tools-row"><div><strong>Turn the page</strong><p>Rotate the current page clockwise.</p></div><button type="button" data-page-action="rotate">Rotate 90°</button></div>
 <form data-page-form="reorder"><label>Page order<input name="page-order" type="text" placeholder="3, 1, 2" maxlength="${MAX_ORDER_INPUT_LENGTH}" autocomplete="off" spellcheck="false"></label><p>Include every page once. Ranges such as 3–5 use a hyphen: 3-5.</p><button type="submit" data-page-action="reorder">Save reordered copy</button></form>
 <form data-page-form="extract"><label>Pages to extract<input name="page-selection" type="text" placeholder="1, 3-5" maxlength="${MAX_ORDER_INPUT_LENGTH}" autocomplete="off" spellcheck="false"></label><p>Choose pages in the order you want, without repeating a page.</p><button type="submit" data-page-action="extract">Save selected pages</button></form>
 <form data-page-form="merge"><label>Add PDFs<input name="merge-files" type="file" accept="application/pdf,.pdf" multiple></label><p>This PDF comes first, followed by files in the order listed below. Up to 100 PDFs, 100 MB and 10,000 pages total.</p><ol data-page-files aria-label="Files to append"></ol><button type="submit" data-page-action="merge">Save combined copy</button></form>
 <p data-page-status role="status" aria-live="polite" aria-atomic="true">Page numbers refer to physical PDF pages.</p>
 </section>`;}

/** getPage returns a zero-based physical page. createCopy owns persistence, not this panel.
 * onStatus receives {status:'working'|'saved'|'error',message}. Dispose before unmount.
 * The caller must check its own route generation before navigation after persistence.
 */
export function mountPageTools({host,source,getPage,createCopy,onStatus=()=>{}}){
 const panel=host?.matches?.('.studio-page-tools')?host:host?.querySelector('.studio-page-tools');
 if(!panel||typeof getPage!=='function'||typeof createCopy!=='function')throw new TypeError('Page tools need a host, current page, and copy handler.');
 const raw=source?.sourceBytes;
 if(!(raw instanceof Uint8Array)&&!(raw instanceof ArrayBuffer)&&!(Array.isArray(raw)&&raw.every(n=>Number.isInteger(n)&&n>=0&&n<=255)))throw new TypeError('The original PDF bytes are missing.');
 const snapshot=raw instanceof ArrayBuffer?new Uint8Array(raw.slice(0)):Uint8Array.from(raw);
 const id=String(source.id??''),title=String(source.title??'Document.pdf'),count=source.provenance?.pageCount??source.pageCount;
 if(!id||!snapshot.length||!Number.isSafeInteger(count)||count<1||count>10000)throw new TypeError('The source PDF needs an identity and valid page count.');
 const win=panel.ownerDocument.defaultView,status=panel.querySelector('[data-page-status]');let disposed=false,busy=false,generation=0;
 const initialHash=win.location.hash;
 function sameRoute(){const match=win.location.hash.match(/^#editor\/([^/]+)/);try{return match?decodeURIComponent(match[1])===id:win.location.hash===initialHash;}catch{return false;}}
 function active(token){return !disposed&&panel.isConnected&&sameRoute()&&token===generation;}
 function report(state,message){status.dataset.state=state;status.textContent=message;try{onStatus({status:state,message});}catch{/* Feedback must not turn a successful save into a failure. */}}
 function disable(value){panel.setAttribute('aria-busy',String(value));for(const e of panel.querySelectorAll('button,input'))e.disabled=value;}
 function invalidate(){if(!sameRoute()){disposed=true;generation++;}}
 win.addEventListener('hashchange',invalidate);win.addEventListener('editor-route',invalidate);
 const list=panel.querySelector('[data-page-files]');
 function filesChanged(){list.replaceChildren();for(const f of panel.querySelector('[name="merge-files"]').files){const li=panel.ownerDocument.createElement('li');li.textContent=f.name;list.append(li);}}
 panel.querySelector('[name="merge-files"]').addEventListener('change',filesChanged);
 async function run(operation){
  if(busy||!active(generation))return;const token=++generation;
  busy=true;disable(true);report('working','Preparing a separate PDF copy…');
  try{
   let result,label;
   if(operation==='rotate'){const pageIndex=getPage();if(!Number.isSafeInteger(pageIndex)||pageIndex<0||pageIndex>=count)throw new Error('Choose a valid physical page before rotating.');label='rotated';result=await rotatePdfPages(snapshot,[{pageIndex,quarterTurns:1}]);}
   else if(operation==='reorder'){const order=parsePageOrder(panel.querySelector('[name="page-order"]').value,count);label='reordered';result=await reorderPdfPages(snapshot,order);}
   else if(operation==='extract'){const pages=parsePageSelection(panel.querySelector('[name="page-selection"]').value,count);label='selected pages';result=await extractPdfPages(snapshot,pages);}
   else if(operation==='merge'){const files=Array.from(panel.querySelector('[name="merge-files"]').files);if(!files.length||files.length>99)throw new Error('Choose between 1 and 99 PDFs to append.');if(files.reduce((total,file)=>total+file.size,snapshot.byteLength)>100*1024*1024)throw new Error('Choose PDFs with a combined size below 100 MB.');if(files.some(f=>!f.size))throw new Error('An empty file cannot be combined.');const additions=[];for(const file of files){additions.push(new Uint8Array(await file.arrayBuffer()));if(!active(token))return;}label='combined';result=await mergePdfDocuments([snapshot,...additions]);}
   else throw new Error('Unknown page action.');
   if(!active(token))return;
   await createCopy(result,`${title.replace(/\.pdf$/i,'')} — ${label}.pdf`,operation);
   if(active(token))report('saved','PDF copy saved. Your original is unchanged.');
  }catch(error){if(active(token))report('error',`Copy not saved. ${explain(error)} Your original is unchanged.`);}
  finally{busy=false;if(active(token))disable(false);}
 }
 function submit(event){const form=event.target.closest('[data-page-form]');if(form){event.preventDefault();void run(form.dataset.pageForm);}}
 function click(event){if(event.target.closest('[data-page-action="rotate"]'))void run('rotate');}
 panel.addEventListener('submit',submit);panel.addEventListener('click',click);
 return {pending:()=>busy,dispose(){disposed=true;generation++;win.removeEventListener('hashchange',invalidate);win.removeEventListener('editor-route',invalidate);panel.removeEventListener('submit',submit);panel.removeEventListener('click',click);panel.querySelector('[name="merge-files"]').removeEventListener('change',filesChanged);}};
}
