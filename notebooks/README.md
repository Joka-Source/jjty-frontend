# JETT notebook workspace

Open `/notebooks/index.html` from `npm run dev` or the built site. Vite bundles this as a second application entry. The existing document desk links to it. This is independently implemented, runnable notebook software; complete Goodnotes visual and behavioral parity remains outstanding.

## Implemented

- Library: create notebooks, cover colors, search, favorites, folders, rename, duplicate, recoverable Trash.
- Pages: grid/ruled/dotted/blank templates per page, thumbnails, named outline entries, add, duplicate, reorder, remove with undo, direct page navigation, fit/50–200% zoom.
- Editing: SVG pen, translucent highlighter, rectangle, whole-stroke erase, typed text, sticky notes, raster image insertion, temporary laser pointer; polygon lasso selects objects for movement, text editing, duplication and deletion; undo/redo in the open notebook.
- PDF: import up to 20 MB/100 pages through PDF.js, searchable extracted text and rendered page backgrounds. Keep exact original PDF bytes. This route uses rendered backgrounds, not native PDF text/form editing.
- Export: validated editable JSON backup; unchanged original PDF; self-contained printable HTML; flattened annotated PDF through MuPDF, with paper templates and page content.
- Offline: production service worker caches the notebook shell and restores its route on offline reload. First use of the lazy PDF export engine requires network access.
- Persistence: IndexedDB (`jett-notebooks`, workspace store); one-way migration from legacy localStorage `jett-notebooks-v1`, leaving that legacy copy intact. Writes report completion/failure; unsaved work triggers a close warning. JSON restore adds notebooks without replacing existing notebook IDs.

## Boundaries

Local browser storage is not cloud synchronization or a backup. Export before changing device/browser/origin. Concurrent tabs are not a collaboration system. PDF imports retain their original source in backups, so source file size affects storage use. Annotated PDF export is flattened; JSON retains editable objects. Ink is not a pressure-sensitive native Pencil engine. Lasso uses object origins/ink vertices, not full geometric intersections. OCR/handwriting search, audio recording/playback, AI, multiplayer, account/settings/billing flows and full native platform parity remain unimplemented. Original PDF remains unchanged when notebook pages are reordered.

## Verification

Run `node --test test/notebook-model.test.mjs test/notebook-workspace.e2e.test.mjs`, `npm run build`, and the repository regression suite `npm test`. Browser evidence and the dated status are in `docs/evidence/notebooks/verification.md`.

Reference: Goodnotes atlas in `Joka-Source/jjty-human`. Slack research informs persistent navigation; it does not establish notebook parity. Test artifacts use synthetic content only.
