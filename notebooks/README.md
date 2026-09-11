# JETT notebook workspace

Open `/notebooks/index.html` from `npm run dev` or the built site. Vite bundles this as a second application entry. The existing document desk links to it. This is independently implemented, runnable notebook software. The current product priority is a complete, coherent UI with shared platform semantics; native PDF engine integration is a later adapter boundary.

## Implemented

- Library: create notebooks, cover colors, search, favorites, folders, rename, duplicate, recoverable Trash.
- Pages: grid/ruled/dotted/blank templates per page, thumbnails, named outline entries, add, duplicate, reorder, remove with undo, direct page navigation, fit/50–200% zoom.
- Workspace: multiple notebook tabs retain separate page positions and in-memory undo histories; reload reopens the active notebook/page. Closing a tab leaves notebook content intact. Library metadata changes clear that notebook's older editor undo history.
- Editing: SVG pen, translucent highlighter, rectangle, whole-stroke erase, typed text, sticky notes, raster image insertion, temporary laser pointer; polygon lasso selects objects for movement, text editing, duplication and deletion; undo/redo in the open notebook.
- PDF: import up to 20 MB/100 pages through PDF.js, searchable extracted text and rendered page backgrounds. Keep exact original PDF bytes. This route uses rendered backgrounds, not native PDF text/form editing.
- Export: validated editable JSON backup; unchanged original PDF; self-contained printable HTML; flattened annotated PDF through MuPDF, with paper templates and page content.
- Offline: production service worker caches the notebook shell and restores its route on offline reload. First use of the lazy PDF export engine requires network access.
- Persistence: IndexedDB (`jett-notebooks`, workspace store); one-way migration from legacy localStorage `jett-notebooks-v1`, leaving that legacy copy intact. Writes report completion/failure; unsaved work triggers a close warning. JSON restore adds notebooks without replacing existing notebook IDs.

## UI and platform contract

`design/tokens.json` is the semantic color, spacing, type, radius and motion source. `design/icons/*.svg` contains original reusable vector controls. `design/product.json` defines the product surfaces; `design/interaction-contract.json` defines menus, intermediate states, focus, cancellation, ownership and expected outcomes. `product.css` and `product-ui.js` implement the browser presentation. Native renderers should reuse the semantics and outcomes while respecting platform text metrics, permissions and safe areas.

The library has grid/list views, sorting, preferences, quick notes and a keyboard notebook switcher (Command/Control+K). The editor has contextual tool guidance, pen presets, page action sheets with boundary-aware disabled actions, named dialog actions, focus restoration, save receipts and reduced motion.

Voice cursor reuses the existing capture lifecycle. A unique phrase reveals matching typed text; PDF text lands on its page. Multiple matches ask for a choice. Highlight is reversible and validates notebook/page ownership. Opening dialogs pauses recognition; a phrase received during a stroke waits for release. **Try words** is explicitly a no-microphone rehearsal. Browser recognition availability varies and may use the browser provider service. Physical microphone operation is not established by the mocked callback tests.

## Boundaries

Local browser storage is not cloud synchronization or a backup. Export before changing device/browser/origin. Concurrent tabs are not a collaboration system. PDF imports retain their original source in backups, so source file size affects storage use. Annotated PDF export is flattened; JSON retains editable objects. Ink is not a pressure-sensitive native Pencil engine. Lasso uses object origins/ink vertices, not full geometric intersections. OCR/handwriting search, audio recording/playback, AI, multiplayer, account/billing flows and full native platform parity remain unimplemented. Original PDF remains unchanged when notebook pages are reordered.

## Verification

Run `node --test test/notebook-model.test.mjs test/notebook-workspace.e2e.test.mjs test/notebook-product-ui.e2e.test.mjs`, `npm run build`, and the repository regression suite `npm test`. Browser evidence and the dated status are in `docs/evidence/notebooks/verification.md`.

Reference: Goodnotes atlas in `Joka-Source/jjty-human`. Slack research informs persistent navigation; it does not establish notebook parity. Test artifacts use synthetic content only.
