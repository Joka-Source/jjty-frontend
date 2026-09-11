# Notebook workspace verification — 11 September 2026

Route: `/notebooks/index.html`. Engineering branch: `feat/slack-learning-lab`; original notebook increment: `7f7532eeba15e4a739d4e0105f14421be0448bb8`.

## Current observed passes

- Production Vite build; automated notebook browser test (import, reload, reorder, outline, zoom, narrow layout); production offline notebook reload test; seven model tests covering immutable history, backup validation, source preservation and lasso movement.
- In-app browser: create, pointer ink, typed text, add/duplicate pages, undo/redo, reload recovery, search, validated additive backup restore; folders and Trash/restore.
- Imported synthetic `test/fixtures/jett-fillable.pdf`: two pages render, extracted text search works, annotations survive reload.
- Image insertion, sticky note, rectangle, temporary laser (no persistent object), lasso text edit/move and undo.
- Page reorder retains selected page content; named outline appears; undo restores original order. 200% zoom produces a 1440 px page without overflowing the app. Expanded toolbar fits 390 px viewport after overflow fix.
- Downloaded original PDF hash equals fixture: `4fd8273558b765ab9597566bc0676a34d097ab3d909e733d8e30d9f8daf088af` (15,063 bytes).
- Downloaded printable HTML contains two page sections and PDF page backgrounds.
- Downloaded annotated PDF (331,910 bytes) opens independently in MuPDF with two pages. Rendered first page visually verified with synthetic source, inserted image and sticky note. It is a flattened export.

## Regression history and gate

The previous run was incomplete/red. This turn diagnosed and fixed its two observed failures: command-journal screenshot used an absent directory; exact resolved anchors lost original metadata during reload. Both focused browser tests now pass. A fresh complete `npm test` is running; final result will replace this pending status. Do not treat this as a full-suite pass yet.

No deployment, physical-device, multiplayer or exact Goodnotes visual/behavioral parity claim. Source PDFs are retained unchanged; notebook edits and flattened exports are separate derivatives. Tests use synthetic content.
