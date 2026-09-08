import {reviewOrigin} from './reviewed-copy.js';
import {exportAnnotatedPdf} from './pdf-annotations.js';

const explanations={
  NO_EXPORTABLE_ANNOTATIONS:'There are no saved local highlights or notes to export yet.',
  ANNOTATION_SOURCE_DIGEST_MISMATCH:'The stored original no longer matches this document. Reopen the original before exporting.',
  ANNOTATION_DOCUMENT_RESTRICTED:'This PDF has encryption, signature protection or unsupported form behavior.',
  ANNOTATION_PERMISSION_DENIED:'This PDF does not permit annotations.',
  ANNOTATION_ANCHOR_NOT_EXACT:'A saved mark has no verified word-level target. Undo that mark and select its words again.',
  ANNOTATION_RANGE_UNSUPPORTED:'A mark spans pages without exact endpoints. Undo it and mark each passage separately.',
  ANNOTATION_RANGE_PAGE_GAP:'An intermediate page could not be verified. Reopen the original PDF before exporting this range.',
  ANNOTATION_RANGE_ANCHOR_INVALID:'A range endpoint no longer matches the original. Undo that range and select both endpoints again.',
  ANNOTATION_PAGE_TEXT_MISMATCH:'The saved text does not match the PDF closely enough to place every mark accurately.',
  ANNOTATION_QUOTE_MISMATCH:'A saved passage has changed. Undo its mark and select the words again.',
  ANNOTATION_GEOMETRY_UNAVAILABLE:'The PDF does not provide usable text coordinates for a saved mark.',
  ANNOTATION_NOTE_MARGIN_UNAVAILABLE:'This page has no clear margin for a note icon. The note remains saved in JETT.',
  ANNOTATION_ID_ALREADY_EXISTS:'This PDF already contains one of these marks. Reopen the unmarked original to export again.',
  ANNOTATION_SOURCE_MISSING:'The original PDF is unavailable. Reopen the original file to export its marks.',
  ANNOTATION_DUPLICATE_ID:'Some saved marks have conflicting identities. This copy cannot be verified.',
  ANNOTATION_PAGE_LOCATOR_INVALID:'A saved mark points to an unavailable page. Undo it and select the passage again.',
  ANNOTATION_TOKEN_RANGE_INVALID:'A saved word selection is incomplete. Undo its mark and select the words again.',
  ANNOTATION_CONTENTS_MISSING:'A saved note is empty. Undo it or add its contents before exporting.',
  ANNOTATION_SERIALIZED_READBACK_FAILED:'The exported file did not retain every mark correctly. Your saved marks are unchanged.',
  ANNOTATION_SERIALIZED_GEOMETRY_FAILED:'The exported file changed a mark’s position. Your saved marks are unchanged.',
};

// Read committed records at the click, then review an immutable export snapshot.
export function initPdfAnnotationPanel({getRecords, review, exportPdf=exportAnnotatedPdf}) {
  const panel=document.getElementById('pdf-annotation-panel');
  const button=document.getElementById('pdf-annotation-preview');
  const status=document.getElementById('pdf-annotation-status');
  let current=null, generation=0;
  button.addEventListener('click',async()=>{
    if(!current || button.disabled)return;
    const doc=structuredClone(current), version=generation, ownsReview=review.prepare();
    button.disabled=true;status.textContent='Checking saved marks against the original PDF…';
    try {
      const records=await getRecords(doc.id);
      if(version!==generation)return;
      const bytes=await exportPdf(doc,records);
      if(version!==generation)return;
      if(!ownsReview()){status.textContent='A newer review replaced this request.';return;}
      const filename=`${(doc.provenance.name || doc.title || 'document').replace(/\.pdf$/i,'')}-annotated.pdf`;
      const rendered=await review.open(bytes,filename,{kind:'annotated',origin:reviewOrigin(doc)});
      if(version===generation)status.textContent=rendered?'Your saved marks are ready to review. The original is unchanged.':'The review was closed or could not be rendered.';
    } catch(error) {
      if(version===generation)status.textContent=`The annotated copy could not be created: ${explanations[error.code] || error.message}`;
    } finally {
      if(version===generation)button.disabled=false;
    }
  });
  return {setDocument(doc){
    generation++;current=doc;review.close();status.textContent='';button.disabled=false;
    panel.hidden=!(doc?.provenance?.sourceKind==='pdf' && doc.sourceBytes);
  }};
}
