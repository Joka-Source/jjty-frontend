import {notebook,validateSourceRef} from './model.js';
import {updateWorkspace,readWorkspace} from './storage.js';
const matches=(n,ref)=>n.sourceRef?.documentId===ref.documentId&&n.sourceRef?.contentDigest===ref.contentDigest&&!n.trashed;
const fail=(code,message)=>{const e=new Error(message);e.code=code;throw e;};
function source(data,ref){const books=data.notebooks.filter(n=>matches(n,ref));if(books.length>1)fail('SOURCE_NOTEBOOK_AMBIGUOUS','More than one notebook refers to this source. Choose a notebook before editing.');return books[0];}
function describe(n,p,item){return {id:item.id,pageIndex:p.sourcePageIndex,text:item.text,notebookId:n.id,revision:item.revision};}
/** References are local links. A notebook JSON backup does not include the PDF. */
export async function openOrCreateSourceNotebook(ref) {
  validateSourceRef(ref);
  if(!Number.isInteger(ref.pageCount)||ref.pageCount<1||ref.pageCount>10000)fail('SOURCE_PAGE_COUNT_INVALID','A valid physical PDF page count is required.');
  return updateWorkspace(data=>{
    let n=source(data,ref);
    if(n){if(n.pages.length!==ref.pageCount)fail('SOURCE_PAGE_COUNT_CHANGED','The source page count does not match its saved notebook.');return n;}
    n=notebook(`${ref.title||'Document'} — notes`,'ruled','#365ccd');
    n.sourceRef={documentId:ref.documentId,contentDigest:ref.contentDigest};
    n.sourceLinkage='reference-only';n.revision=1;
    n.pages=Array.from({length:ref.pageCount},(_,pageIndex)=>({id:crypto.randomUUID(),sourcePageIndex:pageIndex,items:[]}));
    data.notebooks.push(n);return n;
  });
}
export async function listSourceNotes(ref) {
  validateSourceRef(ref);
  const data=await readWorkspace();const n=data?source(data,ref):null;return n?n.pages.flatMap(p=>p.items.filter(i=>i.type==='text'&&i.sourceAnchor).map(i=>describe(n,p,i))):[];
}
export async function saveSourceNote(ref,{id,pageIndex,text,expectedRevision}={}) {
  validateSourceRef(ref);
  if(!Number.isInteger(pageIndex)||pageIndex<0||typeof text!=='string'||!text.trim()||text.length>100000)fail('SOURCE_NOTE_INVALID','Choose a page and write a note of at most 100000 characters.');
  return updateWorkspace(data=>{
    const n=source(data,ref);
    if(!n)fail('SOURCE_NOTEBOOK_MISSING','Open the source notebook before saving a note.');
    const p=n.pages.find(p=>p.sourcePageIndex===pageIndex);
    if(!p)fail('SOURCE_PAGE_INVALID','That physical source page is unavailable.');
    let item;
    if(id){item=p.items.find(i=>i.id===id&&i.type==='text'&&i.sourceAnchor);if(!item)fail('SOURCE_NOTE_MISSING','The note is unavailable on this page.');if(!Number.isInteger(expectedRevision)||expectedRevision!==item.revision)fail('SOURCE_NOTE_CONFLICT','This note changed elsewhere. Your text is kept; reload the saved note before resolving.');item.text=text;item.revision++;}
    else{if(expectedRevision!==undefined)fail('SOURCE_NOTE_CONFLICT','A new note cannot have an existing revision.');item={id:crypto.randomUUID(),type:'text',x:40,y:60+p.items.length*80,text,revision:1,sourceAnchor:{pageIndex}};p.items.push(item);}
    n.updated=Date.now();n.revision=(n.revision||0)+1;return describe(n,p,item);
  });
}
