import {isTextMarkup,isTextMarkupRangeVerb,normalizeMarkupColor} from './text-markup.js';
// Local library data only. This is a consistency-checked backup, not a signature
// or authority to contact any server. Derived reading text is not authenticated
// by the source-byte digest; PDF export still verifies native text independently.
import { deriveRangeSegments, resolveAnchor } from './anchors.js';
import { validateTextEditDraft } from './pdf-edit-draft.js';

export const LIBRARY_BACKUP_MAX_BYTES = 100 * 1024 * 1024;
const MAX_ITEMS = 100000, MAX_BLOCKS = 100000;
const DOC_KEYS = 'id title titleRevision text blocks provenance warnings pdfEngine sourceBytes sourceMime imageSource refusal createdAt revision formDraft'.split(' ');
const RECORD_KEYS = 'id docId kind act verbId blockIndex blockEnd modality evidence confidence matchedText anchor rangeAnchor arrival targetChoice noteText undone undoes createdAt cursor receipt mathSpeech mathLatex mathUnparsed migration markupColor'.split(' ');
const forbidden = new Set(['__proto__','prototype','constructor','serverLink','settings','runtime','connection','connections','accessToken','refreshToken','token','tokens','credentials']);
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const integer = (value, min=0, max=MAX_BLOCKS) => Number.isSafeInteger(value) && value >= min && value <= max;
const str = value => typeof value === 'string';
const id = value => str(value) && value.length > 0 && value.length <= 1024;
const date = value => str(value) && Number.isFinite(Date.parse(value));
const digest = value => str(value) && /^sha256:[a-f0-9]{64}$/.test(value);
function clean(value, depth=0) {
  if(depth>24) fail('BACKUP_TOO_DEEP');
  if(value===null || typeof value==='boolean') return value;
  if(str(value)){if(value.length>LIBRARY_BACKUP_MAX_BYTES)fail('BACKUP_TOO_LARGE');return value;}
  if(typeof value==='number'){if(!Number.isFinite(value))fail('BACKUP_INVALID_NUMBER');return value;}
  if(Array.isArray(value)){if(value.length>MAX_ITEMS)fail('BACKUP_TOO_MANY_ITEMS');return value.map(v=>clean(v,depth+1));}
  if(!plain(value))fail('BACKUP_INVALID_OBJECT');
  const out={};
  for(const [key,item]of Object.entries(value))if(!forbidden.has(key)&&item!==undefined)out[key]=clean(item,depth+1);
  return out;
}
function pick(value, keys) {
  if(!plain(value))fail('BACKUP_INVALID_OBJECT');
  return Object.fromEntries(keys.filter(k=>value[k]!==undefined).map(k=>[k,clean(value[k])]));
}
function bytes(value) {
  if(value instanceof Uint8Array)return value.slice();
  let values;
  if(Array.isArray(value))values=value;
  else if(plain(value)){
    const keys=Object.keys(value);if(keys.some((key,i)=>key!==String(i)))fail('BACKUP_INVALID_BYTES');
    values=keys.map(key=>value[key]);
  }else fail('BACKUP_INVALID_BYTES');
  if(values.length>LIBRARY_BACKUP_MAX_BYTES)fail('BACKUP_TOO_LARGE');
  for(let i=0;i<values.length;i++)if(!Object.hasOwn(values,i)||!integer(values[i],0,255))fail('BACKUP_INVALID_BYTES');
  return Uint8Array.from(values);
}
async function hash(value) {
  return 'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),v=>v.toString(16).padStart(2,'0')).join('');
}
function checkAnchor(anchor) {
  if(!plain(anchor)||!integer(anchor.blockIndex)||!integer(anchor.tokenStart,0,10000000)||!integer(anchor.tokenEnd,anchor.tokenStart,10000000)
    ||!str(anchor.quotedText)||!anchor.quotedText||!str(anchor.prefix)||!str(anchor.suffix)||!digest(anchor.docDigest))fail('BACKUP_INVALID_ANCHOR');
}
/** Validate and detach before any IndexedDB write transaction is opened. */
export async function validateLibrarySnapshot(snapshot) {
  if(!plain(snapshot)||Object.keys(snapshot).some(k=>!['docs','records','positions'].includes(k)))fail('BACKUP_INVALID_SNAPSHOT');
  for(const key of ['docs','records','positions'])if(!Array.isArray(snapshot[key])||snapshot[key].length>MAX_ITEMS)fail('BACKUP_INVALID_COLLECTION');
  const docs=[], records=[], positions=[], docMap=new Map(), docDigests=new Map(), recordMap=new Map(), positionIds=new Set();let totalBytes=0;
  for(const raw of snapshot.docs){
    const {sourceBytes,formDraft,textEditDraft,...rest}=raw??{};const doc=pick(rest,DOC_KEYS);
    if(!id(doc.id)||!str(doc.title)||!str(doc.text)||!date(doc.createdAt)||!integer(doc.revision,1,Number.MAX_SAFE_INTEGER))fail('BACKUP_INVALID_DOCUMENT');
    if(doc.titleRevision!==undefined&&!integer(doc.titleRevision,0,Number.MAX_SAFE_INTEGER))fail('BACKUP_INVALID_DOCUMENT');
    if(doc.titleRevision>0&&(!doc.title.trim()||doc.title!==doc.title.trim()||doc.title.length>200))fail('BACKUP_INVALID_DOCUMENT');
    if(docMap.has(doc.id))fail('BACKUP_DUPLICATE_DOCUMENT');
    if(doc.blocks!==undefined && (!Array.isArray(doc.blocks)||doc.blocks.length>MAX_BLOCKS||doc.blocks.some((b,i)=>!plain(b)||!str(b.text)||b.index!==i||!str(b.kind)||(b.locator!==undefined&&!str(b.locator)))))fail('BACKUP_INVALID_BLOCKS');
    if(doc.provenance!==undefined && (!plain(doc.provenance)||!digest(doc.provenance.contentDigest)||!integer(doc.provenance.byteSize,0,LIBRARY_BACKUP_MAX_BYTES)||!str(doc.provenance.sourceKind)||!date(doc.provenance.capturedAt)))fail('BACKUP_INVALID_PROVENANCE');
    if(doc.warnings!==undefined&&(!Array.isArray(doc.warnings)||doc.warnings.some(value=>!str(value))))fail('BACKUP_INVALID_DOCUMENT');
    if(doc.sourceMime!==undefined&&!str(doc.sourceMime))fail('BACKUP_INVALID_DOCUMENT');
    if(doc.imageSource!==undefined&&(!plain(doc.imageSource)||!integer(doc.imageSource.width,1,100000)||!integer(doc.imageSource.height,1,100000)))fail('BACKUP_INVALID_DOCUMENT');
    if(doc.refusal!==undefined&&(!plain(doc.refusal)||!str(doc.refusal.kind)||!str(doc.refusal.message)))fail('BACKUP_INVALID_DOCUMENT');
    if(sourceBytes!==undefined){
      doc.sourceBytes=bytes(sourceBytes);totalBytes+=doc.sourceBytes.length;
      if(totalBytes>LIBRARY_BACKUP_MAX_BYTES)fail('BACKUP_TOO_LARGE');
      if(!doc.provenance||doc.provenance.byteSize!==doc.sourceBytes.length||await hash(doc.sourceBytes)!==doc.provenance.contentDigest)fail('BACKUP_SOURCE_DIGEST_MISMATCH');
    }
    if(formDraft!==undefined){
      const draft=formDraft;
      if(!plain(draft)||!doc.provenance||draft.sourceDigest!==doc.provenance.contentDigest||!plain(draft.values)||Object.entries(draft.values).some(([key,value])=>!id(key)||!(str(value)||typeof value==='boolean')))fail('BACKUP_INVALID_FORM_DRAFT');
      doc.formDraft={sourceDigest:draft.sourceDigest,values:Object.fromEntries(Object.entries(draft.values))};
    }
    if(textEditDraft!==undefined){
      try{
        if(doc.provenance?.sourceKind!=='pdf'||!doc.sourceBytes)throw new Error();
        doc.textEditDraft=validateTextEditDraft(textEditDraft,doc.provenance.contentDigest);
      }catch{fail('BACKUP_INVALID_TEXT_EDIT_DRAFT');}
    }
    docs.push(doc);docMap.set(doc.id,doc);docDigests.set(doc.id,doc.provenance?.contentDigest??await hash(new TextEncoder().encode(doc.text)));
  }
  for(const raw of snapshot.records){
    const record=pick(raw,RECORD_KEYS),doc=docMap.get(record.docId);
    const blockTexts=doc?.blocks?.map(b=>b.text)??doc?.text.split(/\n\s*\n/).filter(s=>s.trim());
    if(!id(record.id)||!doc||!['act','undo','return'].includes(record.kind)||!id(record.act)||!date(record.createdAt)||!integer(record.blockIndex,0,(blockTexts?.length??0)-1)
      ||(record.blockEnd!=null&&!integer(record.blockEnd,record.blockIndex,blockTexts.length-1))||(record.undone!==undefined&&typeof record.undone!=='boolean'))fail('BACKUP_INVALID_RECORD');
    if(isTextMarkup(record.act)){try{normalizeMarkupColor(record.markupColor);}catch{fail('BACKUP_INVALID_MARKUP_COLOR');}}
    else if(record.markupColor!==undefined)fail('BACKUP_INVALID_MARKUP_COLOR');
    if(recordMap.has(record.id))fail('BACKUP_DUPLICATE_RECORD');
    for(const key of ['noteText','matchedText','evidence','verbId','mathSpeech','mathLatex'])if(record[key]!==undefined&&!str(record[key]))fail('BACKUP_INVALID_RECORD');
    for(const key of ['cursor','receipt'])if(record[key]!=null&&(!plain(record[key])||record[key].sourceId!==record.docId))fail('BACKUP_INVALID_RECORD_REFERENCE');
    if(record.mathUnparsed!==undefined&&(!Array.isArray(record.mathUnparsed)||record.mathUnparsed.some(value=>!str(value))))fail('BACKUP_INVALID_RECORD');
    if(record.anchor)checkAnchor(record.anchor);
    // Cached resolutions are never imported as proof; recompute from the preserved anchors.
    if(record.rangeAnchor){
      try{record.resolvedSegments=deriveRangeSegments(record.rangeAnchor,{blockTexts,docDigest:docDigests.get(doc.id)});}
      catch{fail('BACKUP_INVALID_RANGE');}
      record.anchor=structuredClone(record.rangeAnchor.start);record.resolvedAnchor=record.resolvedSegments[0];record.arrival='exact';
      record.blockIndex=record.resolvedSegments[0].blockIndex;record.blockEnd=record.resolvedSegments.at(-1).blockIndex;
    }else if(record.anchor){
      const revision=/^r(\d+)$/.exec(record.receipt?.sourceRevision??'');
      const resolved=resolveAnchor(record.anchor,{blockTexts,docDigest:docDigests.get(doc.id),
        allowSourceChange:!record.rangeAnchor&&!isTextMarkupRangeVerb(record.verbId)&&!!revision&&doc.revision>Number(revision[1])});
      record.arrival=record.migration==='legacy'&&resolved.arrival!=='lost'?'approximate':resolved.arrival;
      if(resolved.arrival!=='lost'){record.resolvedAnchor=resolved;record.blockIndex=resolved.blockIndex;}
    }else if(record.kind==='act')record.arrival='approximate';
    records.push(record);recordMap.set(record.id,record);
  }
  for(const record of records)if(record.undoes!=null){
    const target=recordMap.get(record.undoes);if(record.kind!=='undo'||!target||target.docId!==record.docId||target.kind!=='act'||target.id===record.id)fail('BACKUP_INVALID_UNDO_REFERENCE');
  }
  for(const raw of snapshot.positions){
    const position=pick(raw,['docId','revision','blockIndex','blockCount','updatedAt']);
    if(!docMap.has(position.docId)||!integer(position.revision,1,Number.MAX_SAFE_INTEGER)||!integer(position.blockCount,1)||!integer(position.blockIndex,0,position.blockCount-1)||!date(position.updatedAt))fail('BACKUP_INVALID_POSITION');
    if(positionIds.has(position.docId))fail('BACKUP_DUPLICATE_POSITION');
    positionIds.add(position.docId);positions.push(position);
  }
  return {docs,records,positions};
}
export async function encodeLibraryBackup(snapshot) {
  const validated=await validateLibrarySnapshot(snapshot);
  const text=JSON.stringify({format:'jt-library-backup',version:1,...validated,docs:validated.docs.map(doc=>({...doc,...(doc.sourceBytes?{sourceBytes:Array.from(doc.sourceBytes)}:{})}))});
  if(new TextEncoder().encode(text).length>LIBRARY_BACKUP_MAX_BYTES)fail('BACKUP_TOO_LARGE');
  return text;
}
export async function decodeLibraryBackup(text) {
  if(!str(text)||text.length>LIBRARY_BACKUP_MAX_BYTES||new TextEncoder().encode(text).length>LIBRARY_BACKUP_MAX_BYTES)fail('BACKUP_TOO_LARGE');
  let value;try{value=JSON.parse(text);}catch{fail('BACKUP_INVALID_JSON');}
  if(!plain(value)||value.format!=='jt-library-backup'||value.version!==1||Object.keys(value).some(k=>!['format','version','docs','records','positions'].includes(k)))fail('BACKUP_UNSUPPORTED_FORMAT');
  return validateLibrarySnapshot({docs:value.docs,records:value.records,positions:value.positions});
}
