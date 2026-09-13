import { readPdfHandoff, updatePdfHandoff, finishPdfHandoff } from '../workspace/pdf-handoff.js';
export async function mountWorkspaceReturn({importFile,getDocument,openDocument,currentDocument,exportDocument}) {
 const id=new URL(location.href).searchParams.get('workspaceSession');if(!id)return;
 const bar=document.createElement('aside');bar.setAttribute('aria-label','Attachment review');
 bar.style.cssText='position:sticky;top:0;z-index:100;background:#e6f1fa;color:#20374b;padding:12px 20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #b7ccdf';
 const receipt=document.createElement('span');receipt.setAttribute('role','status');receipt.textContent='Opening a copy of your attachment…';
 const button=document.createElement('button');button.textContent='Attach reviewed copy to draft';button.disabled=true;
 const back=document.createElement('a');back.textContent='Back to draft';
 bar.append(receipt,button,back);document.body.prepend(bar);
 try{
  let session=await readPdfHandoff(id);
  const studio=session.destination==='Studio';
  back.href=studio?`/studio/index.html?review=${id}#files`:`/workspace/index.html?review=${id}#${session.destination}`;
  if(studio){button.textContent='Save reviewed copy to Jetty';back.textContent='Return to Jetty';}
  // The back link remains available after saving a separate edited library copy.
  // Never retarget this session to the new document: custody belongs to its source.
  if(session.status==='returned'){receipt.textContent=studio?'This review is already saved to Jetty. Open a new review to make another copy.':'This review has already been returned. Open a new review from the draft to make another copy.';return;}
  let doc=session.documentId?await getDocument(session.documentId):null;
  if(!doc){doc=await importFile(session.file);if(!doc)throw new Error('The PDF could not be opened. Your original attachment is unchanged.');session={...session,documentId:doc.id};await updatePdfHandoff(session);}
  else await openDocument(doc);
  receipt.textContent=studio?'Reviewing an independent copy. Your original stays in Jetty.':'Reviewing an independent copy. The original stays in your draft.';button.disabled=false;
  button.onclick=async()=>{
   button.disabled=true;receipt.textContent='Preparing reviewed copy…';
   try{
    if(currentDocument()?.id!==session.documentId)throw new Error('Reopen this attachment before returning it. Other documents cannot replace this review.');
    const bytes=await exportDocument(session.documentId);
    await finishPdfHandoff(session,bytes);
    receipt.textContent=studio?'Reviewed copy saved to Jetty. Your original is unchanged.':'Reviewed copy saved to this draft. Nothing has been sent.';
    location.href=back.href;
   }catch(error){receipt.textContent=error.message;button.disabled=false;}
  };
 }catch(error){receipt.textContent=error.message;back.href='/workspace/index.html';}
}
