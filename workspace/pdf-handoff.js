import { attachmentStore } from './attachments.js';
const valid = id => /^[a-f0-9-]{36}$/.test(id || '');
export async function startPdfHandoff(destination, file) {
 if(!['Inbox','Messages'].includes(destination))throw new Error('Unknown draft destination.');
 if(!file || file.size>100*1048576)throw new Error('Choose a PDF smaller than 100 MB.');
 const signature=new TextDecoder().decode(await file.slice(0,5).arrayBuffer());
 if(signature!=='%PDF-')throw new Error('This attachment is not a PDF.');
 const id=crypto.randomUUID();
 await attachmentStore(`handoff:${id}`,{id,destination,file,createdAt:Date.now(),status:'pending'});
 return id;
}
export async function readPdfHandoff(id) {
 if(!valid(id))throw new Error('Invalid document session.');
 const session=await attachmentStore(`handoff:${id}`);
 if(!session || !['Inbox','Messages'].includes(session.destination))throw new Error('Document session is unavailable. Return to your draft and reopen the attachment.');
 return session;
}
export async function updatePdfHandoff(session) {await attachmentStore(`handoff:${session.id}`,session);}
export async function finishPdfHandoff(session, bytes) {
 const file=new File([bytes],session.file.name.replace(/\.pdf$/i,'')+'-reviewed.pdf',{type:'application/pdf'});
 // Keep each result independently; never overwrite an original or another review.
 const resultId=crypto.randomUUID();
 await attachmentStore(`result:${resultId}`,file);
 await updatePdfHandoff({...session,status:'returned',resultId});
 await attachmentStore(`review-list:${resultId}`,{id:resultId,destination:session.destination,name:file.name});
 return file;
}
