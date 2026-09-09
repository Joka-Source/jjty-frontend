// A recoverable editing intention, never a text anchor or proof of output.
export function validateTextEditDraft(value, sourceDigest) {
  const invalid = () => { throw new Error('EDIT_DRAFT_INVALID'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  if (!/^sha256:[a-f0-9]{64}$/.test(sourceDigest) || value.sourceDigest !== sourceDigest) invalid();
  if (!Number.isSafeInteger(value.pageIndex) || value.pageIndex < 0 || value.pageIndex > 100000) invalid();
  if (!(Number.isSafeInteger(value.paragraphId) && value.paragraphId >= 0) &&
      !(typeof value.paragraphId === 'string' && value.paragraphId.length > 0 && value.paragraphId.length <= 200)) invalid();
  const box=value.originalBox;
  if(!box || !['x','top','w','h'].every(key=>Number.isFinite(box[key])) || box.w<=0 || box.h<=0 || !Number.isFinite(value.originalRotation)) invalid();
  if (typeof value.originalText !== 'string' || !value.originalText.length || value.originalText.length > 100000 ||
      typeof value.text !== 'string' || value.text.length > 100000) invalid();
  return {sourceDigest, pageIndex:value.pageIndex, paragraphId:value.paragraphId,
    originalBox:{x:box.x,top:box.top,w:box.w,h:box.h},originalRotation:value.originalRotation,
    originalText:value.originalText, text:value.text};
}
