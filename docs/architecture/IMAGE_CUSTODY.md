# Local image custody

Images are application documents with original bytes, not fabricated text
paragraphs. PNG, JPEG, GIF and WebP signatures are detected from bytes; browser
decoding must succeed before persistence. Filename and supplied MIME are hints,
not decoding authority. The original is retained without rasterizing or replacing
it. EXIF/animation/color metadata remain in the downloaded source; no promise of
identical rendering across different browser color-management engines is made.

The application image ingestion extension in `src/images.js` uses version
`0.2.0`, empty `blocks`, source kind `image`, the existing provenance fields,
`sourceBytes`, `sourceMime`, and `imageSource: {width, height, mime}`. The old
closed jt-connectors v0.1 schema is left intact. This extension is local; it is
not asserted to conform to that text connector schema or to be accepted by a
remote service. A shared versioned source/asset contract and capability handling
must precede remote sync. The app already stores PDF original bytes separately
from the text connector shape; image custody uses that existing IndexedDB path.

Rendering uses a blob URL whose bytes are the stored original. Decode errors
leave a readable recovery state, without rewriting the source. Switching
documents removes the image view and revokes its URL. Actual-size mode scrolls
inside the image viewport. Download original and JSON backup retain the source.

No OCR has occurred. No text blocks, voice matches, source annotations, private
sharing or network receipts are invented. OCR will be a separate derived result
with region geometry, engine/version and uncertainty attached to this source.
Cloud and self-hosted synchronization are still separate outstanding work.
