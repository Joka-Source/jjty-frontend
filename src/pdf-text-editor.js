import {PdfEngine} from '../vendor/bento-editcore/core.js';
import {consolidateContentArrays,protectType3Text,protectFragileText} from '../vendor/bento-editcore/type3surgery.js';
import {protectPatternArtwork} from '../vendor/bento-editcore/shadingsurgery.js';
import {inspectEditSource,assertEditRegion,verifyEditedPdf} from './pdf-edit-validation.js';

function fail(code){const error=new Error(code);error.code=code;throw error;}
function ownBytes(bytes){if(!(bytes instanceof Uint8Array)&&!(bytes instanceof ArrayBuffer))fail('EDIT_SOURCE_INVALID');return new Uint8Array(bytes).slice();}
const textOf=paragraph=>paragraph.runs.map(run=>run.text).join('');
const region=paragraph=>({...paragraph.box,text:textOf(paragraph)});
function dispose(engine){if(!engine)return;try{engine.close();}finally{if(engine._providerPtr){engine.M.removeFunction(engine._providerPtr);engine._providerPtr=0;}engine.M._FPDF_DestroyLibrary();}}
async function openProtected(bytes,pageIndex){
  if(!Number.isInteger(pageIndex)||pageIndex<0)fail('EDIT_PAGE_INVALID');
  let prepared=bytes.slice(),type3=null,fragile=null;
  // Protection failures abort this edit; silently skipping one would weaken verification.
  prepared=await consolidateContentArrays(prepared)??prepared;
  prepared=await protectPatternArtwork(prepared)??prepared;
  const protectedType3=await protectType3Text(prepared);if(protectedType3){prepared=protectedType3.bytes;type3=protectedType3.seg;}
  const protectedFragile=await protectFragileText(prepared);if(protectedFragile){prepared=protectedFragile.bytes;fragile=protectedFragile.pages;}
  const engine=await PdfEngine.create();
  try{
    engine.open(prepared);if(pageIndex>=engine.pageCount)fail('EDIT_PAGE_INVALID');
    if(type3)engine.setType3Seg(type3);if(fragile)engine.setFragilePages(fragile);
    engine.loadPage(pageIndex);engine.normalizeFontsForEdit();
    if(!engine.generateContent())fail('EDIT_GENERATE_FAILED');
    return engine;
  }catch(error){dispose(engine);throw error;}
}

/** Inspect the same normalized protected model that a later fresh edit will use. */
export async function inspectEditablePage(bytes,pageIndex){
  const original=ownBytes(bytes),metadata=await inspectEditSource(original);if(metadata.restrictions.length)fail('EDIT_DOCUMENT_RESTRICTED');let engine;
  try{engine=await openProtected(original,pageIndex);return {paragraphs:structuredClone(engine.buildModel()),pageBounds:structuredClone(metadata.pages[pageIndex].bounds),transform:structuredClone(metadata.pages[pageIndex].transform)};}
  finally{dispose(engine);}
}

// Myers shortest edit script retains equal islands between independent edits.
// Bound pathological all-different input rather than allocating quadratic memory.
function textDiff(a,b){
 const frontier=new Map([[1,0]]),trace=[];let work=0;
 for(let d=0;d<=a.length+b.length;d++){
  trace.push(new Map(frontier));
  for(let k=-d;k<=d;k+=2){
   if(++work>200000)fail('EDIT_DIFF_LIMIT');
   let x=k===-d||(k!==d&&(frontier.get(k-1)??-1)<(frontier.get(k+1)??-1))?(frontier.get(k+1)??0):(frontier.get(k-1)??0)+1;
   let y=x-k;while(x<a.length&&y<b.length&&a[x]===b[y]){x++;y++;}
   frontier.set(k,x);
   if(x>=a.length&&y>=b.length){
    const script=[];let px=a.length,py=b.length;
    for(let level=d;level>=0;level--){
     const v=trace[level],diagonal=px-py,previous=diagonal===-level||(diagonal!==level&&(v.get(diagonal-1)??-1)<(v.get(diagonal+1)??-1))?diagonal+1:diagonal-1;
     const sx=v.get(previous)??0,sy=sx-previous;
     while(px>sx&&py>sy){script.push({kind:'equal',text:a[--px]});py--;}
     if(level){if(px===sx)script.push({kind:'insert',text:b[--py]});else script.push({kind:'delete',text:a[--px]});}
    }
    return script.reverse();
   }
  }
 }
}
async function replacementRuns(paragraph,text,engine){
 const originals=[];paragraph.runs.forEach((run,index)=>{for(const char of Array.from(run.text))originals.push({char,run,index});});
 if(!originals.length)fail('EDIT_PARAGRAPH_EMPTY');
 const script=textDiff(originals.map(item=>item.char),Array.from(text)),runs=[],checks=new Map();let position=0,lastKind=null;
 const append=(source,part,kind)=>{if(!part)return;const previous=runs.at(-1);if(previous?.sourceIndex===source.index&&lastKind===kind)previous.text+=part;else runs.push({...source.run,sourceIndex:source.index,text:part});lastKind=kind;};
 for(let i=0;i<script.length;){
  if(script[i].kind==='equal'){append(originals[position++],script[i++].text,'equal');continue;}
  const inherited=originals[position]??originals.at(-1);let inserted='';
  while(i<script.length&&script[i].kind!=='equal'){const item=script[i++];if(item.kind==='delete')position++;else inserted+=item.text;}
  append(inherited,inserted,'insert');
  const cps=checks.get(inherited.index)??new Set();for(const char of inserted){const cp=char.codePointAt(0);if(![9,10,13].includes(cp))cps.add(cp);}checks.set(inherited.index,cps);
 }
 for(const [index,cps]of checks){
  if(!cps.size)continue;const font=engine.runFontData(paragraph.id,index);
  if(font?.length){
   // Actual font bytes may be raw CFF; no substitute font is requested.
   const {Font}=await import('mupdf');let face;try{face=new Font('source-run',font);}catch{fail('EDIT_GLYPH_UNVERIFIED');}
   try{if([...cps].some(cp=>face.encodeCharacter(cp)===0))fail('EDIT_GLYPH_UNSUPPORTED');}finally{face.destroy();}
  }else{const known=new Set(Array.from(paragraph.runs[index].text).map(char=>char.codePointAt(0)));if([...cps].some(cp=>!known.has(cp)))fail('EDIT_GLYPH_UNVERIFIED');}
 }
 return runs;
}

/** Produce and independently verify a new PDF, never accumulating failed edits. */
export async function editPdfParagraph(bytes,{pageIndex,paragraphId,originalText,originalBox,originalRotation,text}={}){
  const original=ownBytes(bytes);
  if(typeof originalText!=='string'||typeof text!=='string'||!text.trim()||text.length>100000)fail('EDIT_TEXT_INVALID');
  if(text===originalText)fail('EDIT_TEXT_UNCHANGED');
  const metadata=await inspectEditSource(original);if(metadata.restrictions.length)fail('EDIT_DOCUMENT_RESTRICTED');let engine;
  try{
    engine=await openProtected(original,pageIndex);
    const paragraph=engine.buildModel().find(item=>item.id===paragraphId);
    if(!paragraph||textOf(paragraph)!==originalText||!originalBox||!['x','top','w','h'].every(key=>Number.isFinite(originalBox[key])&&Math.abs(originalBox[key]-paragraph.box[key])<=0.01)||!Number.isFinite(originalRotation)||Math.abs(originalRotation-(paragraph.rotation??0))>0.001)fail('EDIT_PARAGRAPH_STALE');
    if(!paragraph.editable||paragraph.lockReason)fail('EDIT_PARAGRAPH_LOCKED');
    const runs=await replacementRuns(paragraph,text,engine),fmt=structuredClone(paragraph.format),before=region(paragraph);
    const preview=engine.previewParagraph(paragraph.id,runs,fmt);if(!preview)fail('EDIT_PREVIEW_FAILED');
    assertEditRegion(metadata,pageIndex,before,{x:preview.x,top:preview.top,w:preview.width,h:preview.height,text});
    const committed=engine.commitParagraph(paragraph.id,runs,fmt);if(!committed)fail('EDIT_COMMIT_FAILED');
    const after=region(committed);if(after.text!==text)fail('EDIT_COMMIT_TEXT_MISMATCH');
    assertEditRegion(metadata,pageIndex,before,after);
    if(!engine.generateContent())fail('EDIT_GENERATE_FAILED');
    const output=await engine.saveSpliced();if(!output?.length)fail('EDIT_SAVE_FAILED');
    const verified=await verifyEditedPdf(original,output,{pageIndex,before,after});
    return {bytes:verified,before,after};
  }finally{dispose(engine);}
}
