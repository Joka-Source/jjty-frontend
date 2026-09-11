# Notebook workspace verification — 11 September 2026

Route: `/notebooks/index.html`. Engineering branch: `feat/slack-learning-lab`; original notebook increment: `7f7532eeba15e4a739d4e0105f14421be0448bb8`.

## Current observed passes

- Production Vite build; automated notebook browser test (import, reload, reorder, outline, zoom, narrow layout); production offline notebook reload test; nine model tests covering immutable history, backup validation, source preservation and lasso movement.
- In-app browser: create, pointer ink, typed text, add/duplicate pages, undo/redo, reload recovery, search, validated additive backup restore; folders and Trash/restore.
- Imported synthetic `test/fixtures/jett-fillable.pdf`: two pages render, extracted text search works, annotations survive reload.
- Image insertion, sticky note, rectangle, temporary laser (no persistent object), lasso text edit/move and undo.
- Page reorder retains selected page content; named outline appears; undo restores original order. 200% zoom produces a 1440 px page without overflowing the app. Expanded toolbar fits 390 px viewport after overflow fix.
- Downloaded original PDF hash equals fixture: `4fd8273558b765ab9597566bc0676a34d097ab3d909e733d8e30d9f8daf088af` (15,063 bytes).
- Downloaded printable HTML contains two page sections and PDF page backgrounds.
- Downloaded annotated PDF (331,910 bytes) opens independently in MuPDF with two pages. Rendered first page visually verified with synthetic source, inserted image and sticky note. It is a flattened export.

## Regression history and gate

The previous run was incomplete/red. This turn diagnosed and fixed its two observed failures: command-journal screenshot used an absent directory; exact resolved anchors lost original metadata during reload. Both focused browser tests now pass. The complete `npm test` run finished: 480 cases, 478 passed, two failed, none cancelled (1,812 seconds). The image-view failure was another machine-specific screenshot path; the voice test hit port 4960 owned by a different checkout. Fixed image screenshots to the test temporary directory and made the voice test use its own preview server address. Both failing tests subsequently pass in focused reruns. The full 480-case suite was not repeated after these test-harness corrections; retain the original red result as history.

Final focused checks: ten notebook model/browser tests pass, including a 21 MiB additive restore and rejection of a blank page destination; all six production PWA tests pass; fresh build passes. Independent review found three notebook issues (restore size mismatch, asynchronous export reading live paper state, empty destination crash); all fixed and rereviewed without remaining findings in that scope. Editor controls now use original vector icons and compact reference-based chrome.

Notebook tabs were subsequently added and verified in the in-app browser and automated browser test: independent pages and undo ownership, reload to active notebook/page, closing without deleting content, and library metadata changes invalidating stale undo snapshots. A session reconciliation unit test drops missing/trashed tabs and clamps page indices. The updated production offline test also passes. Tabbed UI remains 390px wide at a 390px viewport. The history fix received a targeted independent rereview with no remaining finding.

No deployment, physical-device, multiplayer or exact Goodnotes visual/behavioral parity claim. Source PDFs are retained unchanged; notebook edits and flattened exports are separate derivatives. Tests use synthetic content.


## UI-first product pass

Founder clarification: prioritize a production-quality working UI and portable assets; full PDF engine parity is not this pass's acceptance target. Added semantic tokens, original SVG assets, surface/state contracts, contextual editor controls, grid/list/sort, creation/page menus, local preferences, keyboard switching, dialog focus restoration and reduced motion. Voice cursor reuses the capture lifecycle and supports unique/ambiguous/no-match feedback plus reversible typed-text highlighting. PDF phrase targeting is page-level.

Fresh checks: 12 focused model/browser cases pass (including the new product journey), production Vite build passes, and production offline notebook reload passes. JSON design files and all SVG icons parse. In-app browser inspection covered desktop editor, page action menu, typed phrase cursor and dialog dismissal. The automated 390px journey checks overflow. Live microphone/native stylus/other-platform rendering was not exercised.

Independent review caught voice results changing page ownership during dialogs and stale targets surviving Find. Fixed by pausing capture before dialogs, gating late/deferred callbacks, validating notebook/page ownership, and clearing stale targets. Targeted rereview found no remaining issue in that scope. Tests explicitly protect an open text draft from a late recognition callback.

Full repository regression result is recorded below when the run completes. Legacy Chrome teardown leaves childless browser processes after renderers close; test-owned childless processes were released, with interventions logged separately. This is not an unattended clean teardown claim.
