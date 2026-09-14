import { inspectPdfForm } from './pdf-forms.js';

function fail(code) { const error = new Error(`FREEHAND_${code}`); error.code = error.message; throw error; }
const finite = n => typeof n === 'number' && Number.isFinite(n);
const same = (a, b) => Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => same(v, b[i])) : typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.01 : a === b;
function nativeText(page) { const text = page.toStructuredText(); try { return text.asText(); } finally { text.destroy(); } }

/**
 * Add printable PDF Ink and FreeText annotations to an owned copy of a PDF.
 * pageIndex is zero-based. Coordinates are MuPDF page.getBounds() coordinates:
 * top-left origin, points (72 per inch), including the page's displayed rotation.
 * Ink points are one stroke; width defaults to 2pt, color to [0.15,0.22,0.17]
 * (RGB components 0..1). Text x/y are the top-left of an auto-sized box;
 * fontSize defaults to 14pt. Explicit newlines are supported; text never shrinks.
 * Unsupported Helvetica glyphs or additions extending outside the page fail.
 * Rejects empty edits, protected/signed PDFs and malformed geometry. Does not
 * modify existing text, flatten annotations, certify or digitally sign a PDF.
 * Caller owns source identity/digest and keeps the original separately.
 */
export async function exportFreehandPdf(sourceBytes, options = {}) {
  if (!(sourceBytes instanceof Uint8Array || sourceBytes instanceof ArrayBuffer) || !sourceBytes.byteLength) fail('SOURCE_MISSING');
  const bytes = sourceBytes instanceof Uint8Array ? new Uint8Array(sourceBytes) : new Uint8Array(sourceBytes.slice(0));
  if (!options || typeof options !== 'object') fail('EDITS_INVALID');
  const {ink = [], text = []} = options;
  if (!Array.isArray(ink) || !Array.isArray(text)) fail('EDITS_INVALID');
  if (!ink.length && !text.length) fail('NO_ANNOTATIONS');
  if (ink.length + text.length > 5000) fail('TOO_MANY_ANNOTATIONS');
  const restrictions = (await inspectPdfForm(bytes)).restrictions;
  if (restrictions.some(r => ['encrypted','signed-document','signature-protection','xfa-unsupported','calculated-form-unsupported'].includes(r))) fail('DOCUMENT_RESTRICTED');
  const mupdf = await import('mupdf');
  const doc = new mupdf.PDFDocument(bytes), owned = [];
  const keep = o => { owned.push(o); return o; };
  try {
    doc.disableJS();
    if (!doc.hasPermission('annotate')) fail('PERMISSION_DENIED');
    const pages = Array.from({length:doc.countPages()}, (_, i) => keep(doc.loadPage(i)));
    const before = pages.map(p => ({text:nativeText(p), bounds:p.getBounds(), count:p.getAnnotations().reduce((n,a) => { a.destroy(); return n+1; },0)}));
    const font = keep(new mupdf.Font('Helvetica'));
    const prepared = [];
    for (const [type, items] of [['Ink', ink], ['FreeText', text]]) {
      for (const item of items) {
        if (!item || !Number.isInteger(item.pageIndex) || item.pageIndex < 0 || item.pageIndex >= pages.length) fail('PAGE_INVALID');
        const bounds = before[item.pageIndex].bounds;
        const inside = (x,y,pad=0) => finite(x) && finite(y) && x-pad >= bounds[0] && y-pad >= bounds[1] && x+pad <= bounds[2] && y+pad <= bounds[3];
        const color = item.color ?? [0.15,0.22,0.17];
        if (!Array.isArray(color) || color.length !== 3 || color.some(c => !finite(c) || c < 0 || c > 1)) fail('COLOR_INVALID');
        if (type === 'Ink') {
          const width = item.width ?? 2;
          if (!finite(width) || width <= 0 || width > 50) fail('WIDTH_INVALID');
          if (!Array.isArray(item.points) || item.points.length < 2 || item.points.length > 100000 || item.points.some(p => !Array.isArray(p) || p.length !== 2 || !inside(p[0],p[1],width/2))) fail('POINTS_INVALID');
          if (!item.points.some(p => p[0] !== item.points[0][0] || p[1] !== item.points[0][1])) fail('STROKE_EMPTY');
          prepared.push({type,pageIndex:item.pageIndex,color:[...color],width,points:item.points.map(p=>[...p]),contents:'Hand-drawn ink'});
        } else {
          const size = item.fontSize ?? 14, value = item.text;
          if (!finite(size) || size < 4 || size > 144) fail('FONT_SIZE_INVALID');
          if (typeof value !== 'string' || !value.trim() || value.length > 10000 || /[\u0000-\u0009\u000B-\u001F\u007F]/.test(value)) fail('TEXT_INVALID');
          const widths = value.split('\n').map(line => [...line].reduce((sum,c) => { const glyph = font.encodeCharacter(c); if (!glyph) fail('TEXT_GLYPH_UNSUPPORTED'); return sum + font.advanceGlyph(glyph)*size; },0));
          const rect = [item.x,item.y,item.x+Math.max(...widths)+8,item.y+widths.length*size*1.5+8];
          if (!inside(rect[0],rect[1]) || !inside(rect[2],rect[3])) fail('TEXT_BOUNDS_INVALID');
          prepared.push({type,pageIndex:item.pageIndex,color:[...color],size,rect,contents:value});
        }
      }
    }
    const prefix = `jetty-freehand:${crypto.randomUUID()}`;
    for (const [i, item] of prepared.entries()) {
      const annotation = keep(pages[item.pageIndex].createAnnotation(item.type));
      item.name = `${prefix}:${i}`;
      annotation.setName(item.name); annotation.setContents(item.contents); annotation.setFlags(mupdf.PDFAnnotation.IS_PRINT);
      if (item.type === 'Ink') { annotation.setInkList([item.points]); annotation.setColor(item.color); annotation.setBorderWidth(item.width); }
      else { annotation.setRect(item.rect); annotation.setBorderWidth(0); annotation.setDefaultAppearance('Helv',item.size,item.color); }
      annotation.update();
    }
    for (const page of pages) page.update();
    const buffer = doc.saveToBuffer({garbage:3,compress:true});
    let output; try { output = new Uint8Array(buffer.asUint8Array()); } finally { buffer.destroy(); }
    const reopened = new mupdf.PDFDocument(output);
    try {
      reopened.disableJS();
      if (reopened.countPages() !== pages.length) fail('READBACK_PAGES_FAILED');
      for (let i=0;i<pages.length;i++) {
        const page = reopened.loadPage(i); const annotations = [];
        try {
          annotations.push(...page.getAnnotations());
          if (nativeText(page) !== before[i].text || !same(page.getBounds(),before[i].bounds)) fail('READBACK_CONTENT_FAILED');
          const expected = prepared.filter(item=>item.pageIndex===i);
          if (annotations.length !== before[i].count+expected.length) fail('READBACK_COUNT_FAILED');
          for (const item of expected) {
            const matching = annotations.filter(a=>a.getName()===item.name), a = matching[0];
            if (matching.length!==1 || a.getType()!==item.type || a.getContents()!==item.contents || !(a.getFlags()&mupdf.PDFAnnotation.IS_PRINT)) fail('READBACK_ANNOTATION_FAILED');
            if (item.type==='Ink' && (!same(a.getInkList(),[item.points]) || !same(a.getColor(),item.color) || !same(a.getBorderWidth(),item.width))) fail('READBACK_INK_FAILED');
            if (item.type==='FreeText' && (!same(a.getRect(),item.rect) || !same(a.getDefaultAppearance().size,item.size) || !same(a.getDefaultAppearance().color,item.color))) fail('READBACK_TEXT_FAILED');
          }
        } finally { annotations.forEach(a=>a.destroy()); page.destroy(); }
      }
    } finally { reopened.destroy(); }
    return output;
  } finally { owned.reverse().forEach(o=>o.destroy()); doc.destroy(); }
}
