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

function textMap(block) {
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

export function applyInlineHighlight(block, entryId, tokenStart, tokenEnd) {
  if (block.querySelector(`mark.jt-highlight[data-entry="${entryId}"]`)) {
    return block.querySelector(`mark.jt-highlight[data-entry="${entryId}"]`);
  }
  const range = domRangeForTokens(block, tokenStart, tokenEnd);
  if (!range || range.collapsed) return null;
  const mark = document.createElement("mark");
  mark.className = "jt-highlight";
  mark.dataset.entry = entryId;
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
