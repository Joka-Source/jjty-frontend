import {initPdfPageOverview} from './pdf-page-overview.js';
import {createMuPdfProvider} from './pdf-engine.js';
import {parsePageOrder,parsePageSelection} from '../vendor/bentopdf/page-order.js';

// Review and download one immutable PDF snapshot. Never mutates the reader.
export function initPdfReview({saveCopy}={}) {
  const dialog=document.getElementById('pdf-review-dialog'), pages=document.getElementById('pdf-review-pages'), status=document.getElementById('pdf-review-status'), download=document.getElementById('pdf-review-download'), print=document.getElementById('pdf-review-print');
  const save=document.createElement('button');save.id='pdf-review-save';save.type='button';save.textContent='Save copy to Library';save.hidden=typeof saveCopy!=='function';save.disabled=true;download.before(save);
  let origin=null,saving=false;
  save.addEventListener('click',async()=>{
    if(save.disabled||!snapshot||!dialog.open||saving)return;
    const version=generation,bytes=snapshot.slice(),parent=structuredClone(origin),name=filename,kind=reviewKind;
    saving=true;ready(false);status.textContent='Saving this reviewed copy to your library…';
    try{await saveCopy(bytes,name,parent,kind,{isCurrent:()=>version===generation&&dialog.open});if(version===generation)close();}
    catch(error){if(version===generation&&dialog.open){status.textContent=`Could not save this copy. ${error.message || 'Try again.'} The reviewed copy is still available.`;}}
    finally{saving=false;if(version===generation&&dialog.open)ready(true);else save.disabled=download.disabled||!origin;}
  });
  const organizer=document.createElement('form');organizer.className='pdf-review-order';
  organizer.innerHTML='<label for="pdf-review-order">Page order</label><input id="pdf-review-order" aria-describedby="pdf-review-order-help" maxlength="100000" autocomplete="off"><button type="submit" disabled>Reorder this copy</button><button type="button" data-review-undo disabled>Undo page change</button><small id="pdf-review-order-help">Include every page once, for example 3,1-2. Numbers refer to the current preview.</small>';
  const extractor=document.createElement('form');extractor.className='pdf-review-extract';
  extractor.innerHTML='<label for="pdf-review-extract">Pages to extract</label><input id="pdf-review-extract" aria-describedby="pdf-review-extract-help" maxlength="100000" autocomplete="off"><button type="submit" disabled>Extract selected pages</button><small id="pdf-review-extract-help">Choose the pages to keep in a new copy, for example 3,1-2. Numbers refer to the current preview.</small>';
  const merger=document.createElement('form');merger.className='pdf-review-merge';
  merger.innerHTML='<label for="pdf-review-merge">Add PDF files</label><input id="pdf-review-merge" type="file" accept="application/pdf,.pdf" multiple aria-describedby="pdf-review-merge-help" disabled><button type="submit" disabled>Add PDFs to this copy</button><small id="pdf-review-merge-help">This copy comes first, followed by selected files in selection order. The first copy supplies document metadata. Original files stay unchanged.</small>';
  const mergeOptions=document.createElement('details');mergeOptions.className='pdf-review-merge-options';
  const mergeSummary=document.createElement('summary');mergeSummary.textContent='Add PDFs to this copy';
  mergeOptions.append(mergeSummary,merger);
  const reviewTools=document.createElement('div');reviewTools.className='pdf-review-tools';
  reviewTools.append(organizer,extractor,mergeOptions);pages.before(reviewTools);
  const mergeInput=merger.querySelector('input'),mergeButton=merger.querySelector('button');
  mergeInput.addEventListener('change',()=>{mergeButton.disabled=download.disabled || !snapshot || !mergeInput.files.length;});
  const extractInput=extractor.querySelector('input'),extractButton=extractor.querySelector('button'),extractHelp=extractor.querySelector('small'),extractInstructions=extractHelp.textContent;
  let extractAvailability={allowed:false,reason:null};
  function setExtractAvailability(value){extractAvailability=value;const reasons={EXTRACT_DOCUMENT_RESTRICTED:'This PDF is protected or uses an unsupported form type.',EXTRACT_PERMISSION_DENIED:'This PDF does not allow page changes.',EXTRACT_STRUCTURE_UNSUPPORTED:'This PDF has forms, navigation or structures that cannot yet be safely extracted here.'};extractHelp.textContent=value.allowed?extractInstructions:`Page extraction is unavailable. ${reasons[value.reason] || 'This PDF could not be verified for extraction.'}`;}
  function captureAvailability(){return {reorder:reorderAvailability,extract:extractAvailability,extractValue:extractInput.value};}
  function restoreAvailability(value){setReorderAvailability(value.reorder);setExtractAvailability(value.extract);extractInput.value=value.extractValue;}
  const orderInput=organizer.querySelector('input'),orderButton=organizer.querySelector('button'),undoButton=organizer.querySelector('[data-review-undo]');
  const orderHelp=organizer.querySelector('small'),orderInstructions=orderHelp.textContent;
  const reorderReasons={REORDER_ADVANCED_STRUCTURE_UNSUPPORTED:'This PDF has navigation, attachments or tagged structures that cannot yet be safely reordered here.',REORDER_DOCUMENT_RESTRICTED:'This PDF is protected or uses an unsupported form type.',REORDER_PERMISSION_DENIED:'This PDF does not allow page changes.',REORDER_OUTLINE_UNSUPPORTED:'This PDF uses a bookmark structure that cannot yet be safely reordered here.'};
  let reorderAvailability={allowed:false,reason:null};
  function setReorderAvailability(value){reorderAvailability=value;orderHelp.textContent=value.allowed?orderInstructions:`Page reordering is unavailable. ${reorderReasons[value.reason] || 'This PDF could not be verified for page changes.'}`;}
  let previousEdit=null;
  let generation=0, snapshot=null, filename='filled.pdf', reviewKind='filled', pendingCloseEvents=0;
  function ready(value){save.disabled=!value||saving||!origin;mergeInput.disabled=!value;mergeButton.disabled=!value || !mergeInput.files.length;extractInput.disabled=!value || !extractAvailability.allowed;extractButton.disabled=!value || !extractAvailability.allowed;undoButton.disabled=!value || !previousEdit;orderInput.disabled=!value || !reorderAvailability.allowed;orderButton.disabled=!value || !reorderAvailability.allowed;download.disabled=!value;if(print)print.disabled=!value;for(const button of pages.querySelectorAll('[data-pdf-rotate]'))button.disabled=!value;}
  function clear(){generation++;save.disabled=true;mergeInput.value="";mergeInput.disabled=true;mergeButton.disabled=true;extractAvailability={allowed:false,reason:null};extractHelp.textContent='Checking page extraction availability…';extractInput.disabled=true;extractButton.disabled=true;reorderAvailability={allowed:false,reason:null};orderHelp.textContent='Checking page reordering availability…';undoButton.disabled=true;snapshot=null;orderInput.disabled=true;orderButton.disabled=true;download.disabled=true;if(print)print.disabled=true;pages.replaceChildren();}
  function close(){previousEdit=null;clear();if(dialog.open){pendingCloseEvents++;dialog.close();}}
  dialog.addEventListener('close',()=>{
    // close() already cleared synchronously. Its queued event must not cancel
    // a newer preparation that has reserved this still-closed dialog.
    if(pendingCloseEvents){pendingCloseEvents--;return;}
    if(!dialog.open)clear();
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  document.getElementById('pdf-review-close').addEventListener('click',close);
  download.addEventListener('click',()=>{
    if(!snapshot || download.disabled)return;
    const url=URL.createObjectURL(new Blob([snapshot],{type:'application/pdf'})), link=document.createElement('a');
    link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  });
  print?.addEventListener('click',()=>{
    if(!snapshot || print.disabled || !dialog.open)return;
    // Capture exactly the reviewed PDF while the user gesture is active.
    // The browser's PDF viewer owns print settings and the final print action.
    const version=generation, url=URL.createObjectURL(new Blob([snapshot],{type:'application/pdf'}));
    let viewer;
    try { viewer=window.open(url,'_blank'); }
    catch { URL.revokeObjectURL(url);if(version===generation)status.textContent='The PDF could not open for printing. Allow pop-ups for this site, or download this copy and print it from your PDF reader.';return; }
    if(!viewer){URL.revokeObjectURL(url);if(version===generation)status.textContent='The browser blocked the print tab. Allow pop-ups for this site, or download this copy and print it from your PDF reader.';return;}
    try { viewer.opener=null; } catch { /* Some native viewers isolate their window proxy. */ }
    // Closing or replacing the review must not invalidate an open PDF viewer.
    // Revoke only after its tab is closed; browser document teardown owns the
    // remaining URL lifetime if this application page itself is navigated away.
    const cleanup=setInterval(()=>{
      if(viewer.closed){clearInterval(cleanup);URL.revokeObjectURL(url);}
    },1000);
    if(version===generation)status.textContent=`Opened ${filename} in a new tab. Use the PDF viewer’s Print control. If your browser downloaded it instead, open that file in your PDF reader.`;
  });
  undoButton.addEventListener('click',async()=>{
    if(undoButton.disabled || !previousEdit || !snapshot || !dialog.open)return;
    const target=previousEdit,source=snapshot.slice(),name=filename,kind=reviewKind,oldPages=[...pages.childNodes],oldOrder=orderInput.value,oldAvailability=captureAvailability(),nextVersion=generation+1;
    ready(false);
    let rendered=false;
    try{rendered=await api.open(target.bytes,target.name,{kind:target.kind,retainUndo:true});}catch{/* Keep the last usable review below. */}
    if(generation!==nextVersion || !dialog.open)return;
    if(rendered){previousEdit=null;ready(true);status.textContent='Page change undone. This is the previous reviewed copy.';}
    else{clear();snapshot=source;filename=name;reviewKind=kind;previousEdit=target;pages.replaceChildren(...oldPages);orderInput.value=oldOrder;restoreAvailability(oldAvailability);ready(true);document.getElementById('pdf-review-title').textContent=`Review ${kind} copy`;status.textContent='The previous copy could not be displayed. Your current reviewed copy is unchanged.';}
    (orderInput.disabled?download:orderInput).focus({preventScroll:true});
  });
  organizer.addEventListener('submit',async event=>{
    event.preventDefault();
    if(orderButton.disabled || !snapshot || !dialog.open)return;
    const count=pages.querySelectorAll('.pdf-review-page').length;
    let order;
    try{order=parsePageOrder(orderInput.value,count);}
    catch(error){orderInput.setAttribute('aria-invalid','true');status.textContent=error.message;orderInput.focus();return;}
    orderInput.removeAttribute('aria-invalid');
    if(order.every((page,index)=>page===index)){status.textContent='These pages are already in that order.';return;}
    const version=generation,source=snapshot.slice(),previousPages=[...pages.childNodes],previousName=filename,previousKind=reviewKind,previousOrder=orderInput.value,previousAvailability=captureAvailability();
    ready(false);status.textContent='Preparing and verifying the reordered copy…';
    try{
      const {reorderPdfPages}=await import('./pdf-reorder.js');
      if(version!==generation || !dialog.open)return;
      const bytes=await reorderPdfPages(source,order);
      if(version!==generation || !dialog.open)return;
      const nextVersion=generation+1,priorUndo=previousEdit;
      let rendered=false;
      try{rendered=await api.open(bytes,filename.replace(/(?:-reordered)?\.pdf$/i,'')+'-reordered.pdf',{kind:reviewKind.startsWith('reordered ')?reviewKind:`reordered ${reviewKind}`,retainUndo:true});}catch{/* Restore usable snapshot below. */}
      if(generation!==nextVersion || !dialog.open)return;
      if(rendered){previousEdit={bytes:source,name:previousName,kind:previousKind};ready(true);}
      if(!rendered){
        previousEdit=priorUndo;clear();snapshot=source;filename=previousName;reviewKind=previousKind;
        pages.replaceChildren(...previousPages);orderInput.value=previousOrder;restoreAvailability(previousAvailability);ready(true);
        document.getElementById('pdf-review-title').textContent=`Review ${previousKind} copy`;
        status.textContent='The reordered copy could not be displayed. The previous reviewed copy is unchanged.';
      }
      (orderInput.disabled?download:orderInput).focus({preventScroll:true});
    }catch(error){
      if(version!==generation || !dialog.open)return;
      ready(true);status.textContent=`Could not reorder this copy. ${reorderReasons[error.code] || 'The change could not be verified.'} The reviewed copy is unchanged.`;
    }
  });
  extractor.addEventListener('submit',async event=>{
    event.preventDefault();
    if(extractButton.disabled || !snapshot || !dialog.open)return;
    const count=pages.querySelectorAll('.pdf-review-page').length;
    let selected;
    try{selected=parsePageSelection(extractInput.value,count);}
    catch(error){extractInput.setAttribute('aria-invalid','true');status.textContent=error.message;extractInput.focus();return;}
    extractInput.removeAttribute('aria-invalid');
    if(selected.length===count&&selected.every((page,index)=>page===index)){status.textContent='All pages are already included in this copy.';return;}
    const version=generation,source=snapshot.slice(),previousPages=[...pages.childNodes],previousName=filename,previousKind=reviewKind,previousOrder=orderInput.value,previousAvailability=captureAvailability();
    ready(false);status.textContent='Preparing and verifying the extracted copy…';
    try{
      const {extractPdfPages}=await import('./pdf-extract.js');
      if(version!==generation || !dialog.open)return;
      const bytes=await extractPdfPages(source,selected);
      if(version!==generation || !dialog.open)return;
      const nextVersion=generation+1,priorUndo=previousEdit;
      let rendered=false;
      try{rendered=await api.open(bytes,filename.replace(/(?:-extracted)?\.pdf$/i,'')+'-extracted.pdf',{kind:reviewKind.startsWith('extracted ')?reviewKind:`extracted ${reviewKind}`,retainUndo:true});}catch{/* Restore the last usable review below. */}
      if(generation!==nextVersion || !dialog.open)return;
      if(rendered){previousEdit={bytes:source,name:previousName,kind:previousKind};ready(true);}
      else{
        previousEdit=priorUndo;clear();snapshot=source;filename=previousName;reviewKind=previousKind;
        pages.replaceChildren(...previousPages);orderInput.value=previousOrder;restoreAvailability(previousAvailability);ready(true);
        document.getElementById('pdf-review-title').textContent=`Review ${previousKind} copy`;
        status.textContent='The extracted copy could not be displayed. The previous reviewed copy is unchanged.';
      }
      (extractInput.disabled?download:extractInput).focus({preventScroll:true});
    }catch(error){
      if(version!==generation || !dialog.open)return;
      ready(true);status.textContent='Could not extract these pages. The change could not be verified. The reviewed copy is unchanged.';
    }
  });
  merger.addEventListener('submit',async event=>{
    event.preventDefault();
    if(mergeButton.disabled || !snapshot || !dialog.open || !mergeInput.files.length)return;
    const selected=[...mergeInput.files],version=generation,source=snapshot.slice(),previousPages=[...pages.childNodes],previousName=filename,previousKind=reviewKind,previousOrder=orderInput.value,previousAvailability=captureAvailability();
    ready(false);status.textContent='Preparing and verifying the merged copy…';
    try{
      const {mergePdfDocuments}=await import('./pdf-merge.js');
      if(version!==generation || !dialog.open)return;
      const additions=await Promise.all(selected.map(async file=>new Uint8Array(await file.arrayBuffer())));
      if(version!==generation || !dialog.open)return;
      const bytes=await mergePdfDocuments([source,...additions]);
      if(version!==generation || !dialog.open)return;
      const nextVersion=generation+1,priorUndo=previousEdit;
      let rendered=false;
      try{rendered=await api.open(bytes,previousName.replace(/(?:-merged)?\.pdf$/i,'')+'-merged.pdf',{kind:previousKind.startsWith('merged ')?previousKind:`merged ${previousKind}`,retainUndo:true});}catch{/* Restore the last usable review below. */}
      if(generation!==nextVersion || !dialog.open)return;
      if(rendered){previousEdit={bytes:source,name:previousName,kind:previousKind};ready(true);}
      else{
        previousEdit=priorUndo;clear();snapshot=source;filename=previousName;reviewKind=previousKind;
        pages.replaceChildren(...previousPages);orderInput.value=previousOrder;restoreAvailability(previousAvailability);ready(true);
        document.getElementById('pdf-review-title').textContent=`Review ${previousKind} copy`;
        status.textContent='The merged copy could not be displayed. The previous reviewed copy is unchanged. Select the files again to retry.';
      }
      mergeInput.focus({preventScroll:true});
    }catch(error){
      if(version!==generation || !dialog.open)return;
      const reasons={MERGE_DOCUMENT_RESTRICTED:'A PDF is protected or signed.',MERGE_PERMISSION_DENIED:'A PDF does not allow page assembly.',MERGE_CATALOG_UNSUPPORTED:'A PDF has forms, attachments, tags or other document structures that cannot yet be merged here.',MERGE_ACTION_UNSUPPORTED:'A PDF has an unsupported action.',MERGE_NAMED_DESTINATION_UNSUPPORTED:'A PDF uses named destinations that cannot yet be remapped.',MERGE_PAGE_LIMIT:'The selection exceeds the supported page count.',MERGE_INVALID_INPUTS:'Select between 1 and 99 additional PDF files.'};
      ready(true);status.textContent=`Could not merge these PDFs. ${reasons[error.code] || 'The merged document could not be verified.'} The reviewed copy is unchanged.`;
    }
  });
  pages.addEventListener('click',async event=>{
    const button=event.target.closest?.('[data-pdf-rotate]');
    if(!button || button.disabled || !snapshot || !dialog.open)return;
    const version=generation, source=snapshot.slice(), pageIndex=Number(button.dataset.pageIndex), direction=button.dataset.pdfRotate;
    const previousPages=[...pages.childNodes], previousName=filename, previousKind=reviewKind,previousAvailability=captureAvailability();
    const scroll=pages.scrollTop, name=filename.replace(/(?:-rotated)?\.pdf$/i,'')+'-rotated.pdf';
    const kind=reviewKind.startsWith('rotated ')?reviewKind:`rotated ${reviewKind}`;
    ready(false);status.textContent=`Rotating page ${pageIndex+1}…`;
    try{
      const {rotatePdfPages}=await import('./pdf-rotation.js');
      if(version!==generation || !dialog.open)return;
      const bytes=await rotatePdfPages(source,[{pageIndex,quarterTurns:direction==='left'?-1:1}]);
      if(version!==generation || !dialog.open)return;
      const nextVersion=generation+1,priorUndo=previousEdit;
      let rendered=false;
      try{rendered=await api.open(bytes,name,{kind,retainUndo:true});}catch{/* Restore the last usable review below. */}
      if(generation!==nextVersion || !dialog.open)return;
      if(rendered){previousEdit={bytes:source,name:previousName,kind:previousKind};ready(true);}
      if(!rendered){
        previousEdit=priorUndo;clear();snapshot=source;filename=previousName;reviewKind=previousKind;
        pages.replaceChildren(...previousPages);restoreAvailability(previousAvailability);ready(true);
        document.getElementById('pdf-review-title').textContent=`Review ${previousKind} copy`;
        status.textContent='The rotated copy could not be displayed. The previous reviewed copy is unchanged.';
      }
      pages.scrollTop=scroll;
      pages.querySelector(`[data-pdf-rotate="${direction}"][data-page-index="${pageIndex}"]`)?.focus({preventScroll:true});
    }catch(error){
      if(version!==generation || !dialog.open)return;
      const reasons={
        ROTATION_DOCUMENT_RESTRICTED:'This PDF is protected or uses a form type that cannot be changed here.',
        ROTATION_PERMISSION_DENIED:'This PDF does not allow page changes.',
        ROTATION_INVALID_EXISTING_ANGLE:'This PDF has an invalid page orientation.',
        ROTATION_DOCUMENT_TOO_COMPLEX:'This PDF is too complex to verify safely here.',
        ROTATION_CONTENT_CHANGED:'The saved copy did not preserve the PDF data.',
        ROTATION_READBACK_FAILED:'The saved orientation could not be verified.',
      };
      ready(true);status.textContent=`Could not rotate this copy. ${reasons[error.code] || 'The change could not be verified.'} The reviewed copy is unchanged.`;
    }
  });
  initPdfPageOverview({pages,download,orderInput,orderButton,extractInput,extractButton,undoButton});
  const api={close,prepare(){close();const version=generation;return ()=>version===generation;},async open(bytes,name,{kind='filled',retainUndo=false,origin:sourceOrigin=null}={}){
    if(!retainUndo)origin=sourceOrigin?structuredClone(sourceOrigin):null;
    if(!retainUndo)previousEdit=null;
    clear();extractInput.removeAttribute('aria-invalid');orderInput.removeAttribute('aria-invalid');const version=generation, owned=new Uint8Array(bytes);filename=name;reviewKind=kind;
    document.getElementById('pdf-review-title').textContent=`Review ${kind} copy`;
    status.textContent=`Rendering the exact ${kind} copy…`;if(!dialog.open)dialog.showModal();
    let opened;
    try{
      const mupdf=await import('mupdf');if(version!==generation)return;
      opened=await createMuPdfProvider(mupdf).open(owned);
      for(let i=1;i<=opened.document.numPages;i++){
        if(version!==generation)return;
        const page=await opened.document.getPage(i);
        try{
          const natural=page.getViewport({scale:1});
          const width=Math.max(240,pages.clientWidth || dialog.clientWidth-48);
          const scale=Math.min(width/natural.width,1.5), viewport=page.getViewport({scale});
          const figure=document.createElement('figure');figure.className='pdf-review-page';
          const caption=document.createElement('figcaption');caption.textContent=`Page ${i} of ${opened.document.numPages}`;
          const actions=document.createElement('div');actions.className='pdf-review-page-actions';
          for(const direction of ['left','right']){
            const button=document.createElement('button');button.type='button';button.disabled=true;
            button.dataset.pdfRotate=direction;button.dataset.pageIndex=String(i-1);
            button.textContent=direction==='left'?'Rotate left':'Rotate right';
            button.setAttribute('aria-label',`Rotate page ${i} ${direction}`);actions.append(button);
          }
          const canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${kind} PDF, page ${i}`);
          const density=Math.min(devicePixelRatio || 1,2);canvas.width=Math.ceil(viewport.width*density);canvas.height=Math.ceil(viewport.height*density);
          canvas.style.setProperty('--review-aspect',String(viewport.width/viewport.height));canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;
          await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:density===1?null:[density,0,0,density,0,0]}).promise;
          const notes=(await page.getAnnotations()).filter(annotation=>
            ['Text','FreeText'].includes(annotation.type) && annotation.contents.trim());
          if(version!==generation)return;
          figure.append(caption,actions,canvas);
          if(notes.length){
            const details=document.createElement('details');details.className='pdf-review-notes';
            const summary=document.createElement('summary');summary.textContent=`Notes on page ${i} (${notes.length})`;
            const list=document.createElement('ol');
            for(const note of notes){
              const item=document.createElement('li'),text=document.createElement('p');
              item.dataset.annotationId=note.id;text.textContent=note.contents;
              item.append(text);list.append(item);
            }
            details.append(summary,list);figure.append(details);
          }
          pages.append(figure);
        }finally{page.cleanup();}
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(version!==generation)return;
      let availability;
      try{const {inspectPdfReorder}=await import('./pdf-reorder.js');availability=await inspectPdfReorder(owned);}catch{availability={allowed:false,reason:'REORDER_PREFLIGHT_FAILED'};}
      if(version!==generation)return;
      let extraction;
      try{const {inspectPdfExtraction}=await import('./pdf-extract.js');extraction=await inspectPdfExtraction(owned);}catch{extraction={allowed:false,reason:'EXTRACT_PREFLIGHT_FAILED'};}
      if(version!==generation)return;
      setExtractAvailability(extraction);extractInput.value=opened.document.numPages===1?'1':`1-${opened.document.numPages}`;
      setReorderAvailability(availability);snapshot=owned;orderInput.value=opened.document.numPages===1?'1':`1-${opened.document.numPages}`;ready(true);status.textContent=`This is the ${kind} PDF that will download. Your original is unchanged.`;
      return true;
    }catch(error){if(version===generation){snapshot=null;orderInput.disabled=true;orderButton.disabled=true;download.disabled=true;if(print)print.disabled=true;status.textContent=`Preview could not be rendered: ${error.message}`;}}
    finally{await opened?.loadingTask.destroy();}
  }};
  return api;
}
