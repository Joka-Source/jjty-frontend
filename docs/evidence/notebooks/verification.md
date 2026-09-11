# Notebook workspace verification — 11 September 2026

Route: `/notebooks/index.html`. Engineering branch: `feat/slack-learning-lab`; original notebook increment: `7f7532eeba15e4a739d4e0105f14421be0448bb8`.

## Current observed passes

- Production Vite build; automated notebook browser test (import, reload, reorder, outline, zoom, narrow layout); production offline notebook reload test; eight model tests covering immutable history, backup validation, source preservation and lasso movement.
- In-app browser: create, pointer ink, typed text, add/duplicate pages, undo/redo, reload recovery, search, validated additive backup restore; folders and Trash/restore.
- Imported synthetic `test/fixtures/jett-fillable.pdf`: two pages render, extracted text search works, annotations survive reload.
- Image insertion, sticky note, rectangle, temporary laser (no persistent object), lasso text edit/move and undo.
- Page reorder retains selected page content; named outline appears; undo restores original order. 200% zoom produces a 1440 px page without overflowing the app. Expanded toolbar fits 390 px viewport after overflow fix.
- Downloaded original PDF hash equals fixture: `4fd8273558b765ab9597566bc0676a34d097ab3d909e733d8e30d9f8daf088af` (15,063 bytes).
- Downloaded printable HTML contains two page sections and PDF page backgrounds.
- Downloaded annotated PDF (331,910 bytes) opens independently in MuPDF with two pages. Rendered first page visually verified with synthetic source, inserted image and sticky note. It is a flattened export.

## Regression history and gate

The previous run was incomplete/red. This turn diagnosed and fixed its two observed failures: command-journal screenshot used an absent directory; exact resolved anchors lost original metadata during reload. Both focused browser tests now pass. The complete `npm test` run finished: 480 cases, 478 passed, two failed, none cancelled (1,812 seconds). The image-view failure was another machine-specific screenshot path; the voice test hit port 4960 owned by a different checkout. Fixed image screenshots to the test temporary directory and made the voice test use its own preview server address. Both failing tests subsequently pass in focused reruns. The full 480-case suite was not repeated after these test-harness corrections; retain the original red result as history.

Final focused checks: nine notebook model/browser tests pass, including a 21 MiB additive restore and rejection of a blank page destination; all six production PWA tests pass; fresh build passes. Independent review found three notebook issues (restore size mismatch, asynchronous export reading live paper state, empty destination crash); all fixed and rereviewed without remaining findings in that scope. Editor controls now use original vector icons and compact reference-based chrome.

No deployment, physical-device, multiplayer or exact Goodnotes visual/behavioral parity claim. Source PDFs are retained unchanged; notebook edits and flattened exports are separate derivatives. Tests use synthetic content.
