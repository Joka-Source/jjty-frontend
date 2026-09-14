import {tokenizeWithSpans} from './match.js';

// DOM coordinates are accepted only when the source slice is an exact match.
export function pdfSelectionTarget(selection, doc, root) {
  if (!doc || !selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
  const range=selection.getRangeAt(0),epub=doc.provenance?.sourceKind==='epub';
  function endpoint(node,offset) {
    const element=node.nodeType===3?node.parentElement:node;
    const item=element?.closest(epub?'[data-block]':'[data-pdf-char-start]');
    const block=item?.closest('[data-block]');
    if(epub){const book=block?.closest('.epub-book');if(!book||book.dataset.epubDocId!==doc.id||book.dataset.epubDigest!==doc.provenance?.contentDigest)return null;}
    if (!item || !block || !root.contains(item)) return null;
    const blockIndex=Number(block.dataset.block),text=doc.blocks?.[blockIndex]?.text;
    const start=epub?0:Number(item.dataset.pdfCharStart),end=epub?text?.length:Number(item.dataset.pdfCharEnd);
    if (typeof text!=='string' || !Number.isInteger(start) || text.slice(start,end)!==item.textContent) return null;
    const prefix=document.createRange();prefix.selectNodeContents(item);
    try { prefix.setEnd(node,offset); } catch { return null; }
    const char=start+prefix.toString().length;
    if(char<start || char>end)return null;
    return {blockIndex,char,text,item};
  }
  const from=endpoint(range.startContainer,range.startOffset),to=endpoint(range.endContainer,range.endOffset);
  if(!from || !to || from.blockIndex>to.blockIndex || (from.blockIndex===to.blockIndex && from.char>=to.char))return null;
  let previous=null;
  for(const item of root.querySelectorAll(epub?'.epub-book [data-block]':'[data-pdf-char-start]')){
    if(!range.intersectsNode(item))continue;
    const block=item.closest('[data-block]'),text=doc.blocks?.[Number(block?.dataset.block)]?.text;
    const start=epub?0:Number(item.dataset.pdfCharStart),end=epub?text?.length:Number(item.dataset.pdfCharEnd);
    if(typeof text!=='string'||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||text.slice(start,end)!==item.textContent)return null;
    const blockIndex=Number(block.dataset.block);
    if(epub){const book=block.closest('.epub-book');if(book.dataset.epubDocId!==doc.id||book.dataset.epubDigest!==doc.provenance?.contentDigest||(previous&&blockIndex!==previous.blockIndex+1))return null;}
    if(previous&&(blockIndex<previous.blockIndex||(blockIndex===previous.blockIndex&&(start<previous.end||text.slice(previous.end,start).trim()))))return null;
    previous={blockIndex,end};
  }
  const expected=doc.blocks.slice(from.blockIndex,to.blockIndex+1).map((block,index)=>{
    const text=block.text;
    return text.slice(index===0?from.char:0,index===to.blockIndex-from.blockIndex?to.char:undefined);
  }).join('');
  const compact=value=>value.replace(/\s+/gu,'');
  if(compact(range.toString())!==compact(expected))return null;
  function target(point, isStart) {
    const spans=tokenizeWithSpans(point.text);
    const first=isStart?spans.findIndex(t=>t.end>point.char):0;
    let last=isStart?spans.length-1:spans.findLastIndex(t=>t.start<point.char);
    if(first<0 || last<first)return null;
    return {blockIndex:point.blockIndex,tokenStart:first,tokenEnd:last,quotedText:point.text.slice(spans[first].start,spans[last].end)};
  }
  let start=target(from,true),end=target(to,false);
  if(!start || !end)return null;
  if(from.blockIndex===to.blockIndex){
    if(start.tokenStart>end.tokenEnd)return null;
    const spans=tokenizeWithSpans(from.text);
    start={...start,tokenEnd:end.tokenEnd,quotedText:from.text.slice(spans[start.tokenStart].start,spans[end.tokenEnd].end)};
    end=start;
  }
  return {docId:doc.id,digest:doc.provenance?.contentDigest,revision:doc.revision,
    start,end,range:range.cloneRange(),nodes:[from.item,to.item],quote:start===end?start.quotedText:`${start.quotedText} … ${end.quotedText}`};
}
export function selectionStillCurrent(target,doc,root) {
  if(!target || target.docId!==doc?.id || target.digest!==doc.provenance?.contentDigest
    || target.revision!==doc.revision || !target.nodes.every(node=>node.isConnected&&root.contains(node)))return false;
  const current=pdfSelectionTarget({rangeCount:1,isCollapsed:target.range.collapsed,getRangeAt:()=>target.range},doc,root);
  return !!current && JSON.stringify(current.start)===JSON.stringify(target.start) && JSON.stringify(current.end)===JSON.stringify(target.end);
}
