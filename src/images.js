import { contentDigest } from './ingest.js';

export function imageMime(bytes) {
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if ([137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n)) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (['GIF87a','GIF89a'].includes(ascii(0,6))) return 'image/gif';
  if (ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP') return 'image/webp';
  throw new Error('This image format is not supported yet. Use PNG, JPEG, WebP or GIF.');
}

// Application image extension, deliberately distinct from the text connector
// v0.1 contract. No invented text blocks: OCR is a later derived operation.
export async function ingestImage(file) {
  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  const sourceMime = imageMime(sourceBytes);
  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([sourceBytes], { type: sourceMime }));
  } catch {
    throw new Error('This image could not be read. Try the original file or another copy.');
  }
  const imageSource = { width: bitmap.width, height: bitmap.height, mime: sourceMime };
  bitmap.close();
  return {
    schemaVersion: '0.2.0', blocks: [], warnings: [], sourceBytes, sourceMime, imageSource,
    provenance: { sourceKind: 'image', name: file.name, byteSize: sourceBytes.length,
      contentDigest: await contentDigest(sourceBytes), capturedAt: new Date().toISOString() },
  };
}

export async function mountImage(container, doc) {
  const bytes = doc.sourceBytes instanceof Uint8Array ? doc.sourceBytes : new Uint8Array(Object.values(doc.sourceBytes));
  const url = URL.createObjectURL(new Blob([bytes], { type: imageMime(bytes) }));
  const figure = document.createElement('figure'); figure.className = 'image-document';
  const picture = document.createElement('img'); picture.src = url; picture.alt = doc.title;
  try { await picture.decode(); } catch (error) { URL.revokeObjectURL(url); throw error; }
  const controls = document.createElement('div'); controls.className = 'image-controls';
  const zoom = document.createElement('button'); zoom.type = 'button'; zoom.textContent = 'Actual size'; zoom.setAttribute('aria-pressed','false');
  zoom.addEventListener('click', () => {
    const actual = figure.classList.toggle('actual-size');
    zoom.textContent = actual ? 'Fit image' : 'Actual size'; zoom.setAttribute('aria-pressed', String(actual));
  });
  const size = document.createElement('span'); size.textContent = `${picture.naturalWidth} × ${picture.naturalHeight}`;
  controls.append(zoom, size);
  const viewport = document.createElement('div'); viewport.className = 'image-viewport'; viewport.tabIndex = 0; viewport.setAttribute('aria-label','Image view'); viewport.append(picture);
  const caption = document.createElement('figcaption'); caption.textContent = 'Original image saved on this device. Text recognition is not available here yet.';
  figure.append(controls, viewport, caption); container.append(figure);
  return () => { figure.remove(); URL.revokeObjectURL(url); };
}
