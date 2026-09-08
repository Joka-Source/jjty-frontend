import {createMuPdfProvider} from './pdf-engine.js';

// Review and download one immutable PDF snapshot. Never mutates the reader.
export function initPdfReview() {
  const dialog=document.getElementById('pdf-review-dialog'), pages=document.getElementById('pdf-review-pages'), status=document.getElementById('pdf-review-status'), download=document.getElementById('pdf-review-download'), print=document.getElementById('pdf-review-print');
  let generation=0, snapshot=null, filename='filled.pdf', pendingCloseEvents=0;
  function clear(){generation++;snapshot=null;download.disabled=true;if(print)print.disabled=true;pages.replaceChildren();}
  function close(){clear();if(dialog.open){pendingCloseEvents++;dialog.close();}}
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
  return {close,prepare(){close();const version=generation;return ()=>version===generation;},async open(bytes,name,{kind='filled'}={}){
    clear();const version=generation, owned=new Uint8Array(bytes);filename=name;
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
          const canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${kind} PDF, page ${i}`);
          const density=Math.min(devicePixelRatio || 1,2);canvas.width=Math.ceil(viewport.width*density);canvas.height=Math.ceil(viewport.height*density);
          canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;
          await page.render({canvasContext:canvas.getContext('2d'),viewport,transform:density===1?null:[density,0,0,density,0,0]}).promise;
          const notes=(await page.getAnnotations()).filter(annotation=>
            ['Text','FreeText'].includes(annotation.type) && annotation.contents.trim());
          if(version!==generation)return;
          figure.append(caption,canvas);
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
      snapshot=owned;download.disabled=false;if(print)print.disabled=false;status.textContent=`This is the ${kind} PDF that will download. Your original is unchanged.`;
      return true;
    }catch(error){if(version===generation){snapshot=null;download.disabled=true;if(print)print.disabled=true;status.textContent=`Preview could not be rendered: ${error.message}`;}}
    finally{await opened?.loadingTask.destroy();}
  }};
}
