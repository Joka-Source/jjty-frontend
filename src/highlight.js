import {isTextMarkup,markupColorRgb,MARKUP_OPACITY} from './text-markup.js';
import { tokenizeWithSpans } from "./match.js";

function readableTextNodes(block) {
  const nodes = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      return parent?.closest(".note, .kept-math")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

export function mapStableTextSegments(segments, stableText) {
  const text = String(stableText ?? "");
  let from = 0;
  return segments.map((raw) => {
    const segment = String(raw ?? "");
    const found = text.indexOf(segment, from);
    const charStart = found >= 0 ? found : from;
    const charEnd = charStart + segment.length;
    from = charEnd;
    return { text: segment, charStart, charEnd };
  });
}

function textMap(block) {
  if (block.classList.contains("pdf-text-layer")) {
    const text = block.dataset.blockText ?? "";
    const nodes = readableTextNodes(block).filter((node) => node.data.length > 0);
    const mapped = mapStableTextSegments(nodes.map((node) => node.data), text);
    const positions = mapped.map(({ charStart, charEnd }, index) => ({
      node: nodes[index],
      start: charStart,
      end: charEnd,
    }));
    return { text, positions };
  }
  const nodes = readableTextNodes(block);
  let text = "";
  const positions = [];
  for (const node of nodes) {
    const start = text.length;
    text += node.data;
    positions.push({ node, start, end: text.length });
  }
  return { text, positions };
}

export function domRangeForCharacters(block, charStart, charEnd) {
  const { positions } = textMap(block);
  const start = boundaryAt(positions, charStart);
  const end = boundaryAt(positions, charEnd, true);
  if (!start || !end || charEnd <= charStart) return null;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

function boundaryAt(positions, offset, preferEnd = false) {
  const hit = positions.find(({ start, end }) =>
    preferEnd ? offset > start && offset <= end : offset >= start && offset < end,
  );
  if (!hit) return null;
  return { node: hit.node, offset: offset - hit.start };
}

export function domRangeForTokens(block, tokenStart, tokenEnd) {
  const { text, positions } = textMap(block);
  const tokens = tokenizeWithSpans(text);
  const first = tokens[tokenStart];
  const last = tokens[tokenEnd];
  if (!first || !last || tokenEnd < tokenStart) return null;
  const start = boundaryAt(positions, first.start);
  const end = boundaryAt(positions, last.end, true);
  if (!start || !end) return null;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

function unionClientRects(rects) {
  const visible = [...rects].filter((rect) => rect.width > 0 && rect.height > 0);
  if (!visible.length) return null;
  const left = Math.min(...visible.map((rect) => rect.left));
  const top = Math.min(...visible.map((rect) => rect.top));
  const right = Math.max(...visible.map((rect) => rect.right));
  const bottom = Math.max(...visible.map((rect) => rect.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

export function measureTokenRange(block, tokenStart, tokenEnd) {
  const range = domRangeForTokens(block, tokenStart, tokenEnd);
  return range ? unionClientRects(range.getClientRects()) : null;
}

export function applyInlineHighlight(block, entryId, tokenStart, tokenEnd, {act='highlight',markupColor}={}) {
  if(!isTextMarkup(act))throw new TypeError('Invalid text markup act.');
  const rgb=markupColorRgb(markupColor).map(value=>Math.round(value*255));
  const style=mark=>{
    mark.dataset.markup=act;
    if(act==='highlight')mark.style.backgroundColor=`rgba(${rgb.join(', ')}, ${MARKUP_OPACITY})`;
    else {
      mark.style.backgroundColor='transparent';
      mark.style.textDecorationLine=act==='underline'?'underline':'line-through';
      mark.style.textDecorationColor=`rgba(${rgb.join(', ')}, ${MARKUP_OPACITY})`;
      mark.style.textDecorationThickness='1.5px';
      mark.style.textUnderlineOffset='.12em';
    }
  };
  if (block.querySelector(`mark.jt-highlight[data-entry="${entryId}"]`)) {
    return block.querySelector(`mark.jt-highlight[data-entry="${entryId}"]`);
  }
  if (block.classList.contains('pdf-text-layer')) {
    // Keep PDF.js item spans (and their stable offsets/transforms) intact.
    // Extracting a range across items clones partial spans with stale metadata.
    const {text,positions}=textMap(block),tokens=tokenizeWithSpans(text);
    const first=tokens[tokenStart],last=tokens[tokenEnd];
    if(!first||!last||tokenEnd<tokenStart)return null;
    let firstMark=null;
    for(const {node,start,end} of positions){
      const a=Math.max(first.start,start)-start,b=Math.min(last.end,end)-start;
      if(b<=a)continue;
      const part=document.createRange();part.setStart(node,a);part.setEnd(node,b);
      const mark=document.createElement('mark');mark.className='jt-highlight';mark.dataset.entry=entryId;style(mark);
      mark.appendChild(part.extractContents());part.insertNode(mark);firstMark??=mark;
    }
    return firstMark;
  }
  const range = domRangeForTokens(block, tokenStart, tokenEnd);
  if (!range || range.collapsed) return null;
  const mark = document.createElement("mark");
  mark.className = "jt-highlight";
  mark.dataset.entry = entryId;
  style(mark);
  mark.appendChild(range.extractContents());
  range.insertNode(mark);
  return mark;
}

export function removeInlineHighlight(block, entryId) {
  for (const mark of block.querySelectorAll(`mark.jt-highlight[data-entry="${entryId}"]`)) {
    mark.replaceWith(...mark.childNodes);
  }
  block.normalize();
}
