# PDF capability contract and execution order

Founder correction, 13 September 2026. The annotation redesign at c2d2342 is a checkpoint, not a complete PDF application. Rank is based on frequency of the user job and consequence of getting it wrong, not equal toolbar space. Existing engine code, reachable UI, and current artifact verification are separate columns.

| Priority / user job | Capability | Engine / source evidence | Reachable product UI | Missing or incomplete behavior | Platform / verification |
|---|---|---|---|---|---|
| P0 read and understand | Open, navigate, zoom, exact page text | MuPDF primary renderer, source bytes in IndexedDB | Studio focused editor c2d2342 | Search and selectable text absent from Studio | Current browser journey passed; new Android package in verification |
| P0 review evidence | Select, search, highlight / underline / strikeout | `pdf-selection.js`, `pdf-annotations.js#exportAnnotatedPdf`, `text-markup.js`; exact anchors and five colors | Original reader tools work through main.js; not Studio | Integrated selectable text and contextual markup lifecycle | Dedicated engine/browser tests exist; current full run pending; no physical Pencil claim |
| P0 correct a document | Existing paragraph editing, distinct from added text | `pdf-text-editor.js#inspectEditablePage/editPdfParagraph`, geometry/pixel/text/form verification | Original reader Edit workspace; Studio handoff | Cohesive direct targeting and return in Studio; arbitrary typography/layout not established | Historical exact edited-file tests, not this checkpoint's Android proof |
| P0 recover a mistake | Undo AND redo | Durable markup undo, Studio undo, notebook undo/redo, review single previous snapshot | Different scopes and controls | Common Studio redo; clear operation scope for document transforms | Studio undo verified; unified redo absent |
| P1 mark / sign by hand | Ink and added text | `pdf-freehand.js`, printable Ink/FreeText; source retained | Studio Pen/Text contextual tools | Pressure/palm/stylus hardware behavior not proven; no certificate signing | Current browser readback and prior API35 output proof |
| P1 prepare a page | Crop | MuPDF page geometry primitive; old coordinate handling understands CropBox | No owned authoring UI found | Real crop authoring, visual preview, fresh copy, undo/redo | Missing owned implementation; rotations/UserUnit must be tested |
| P1 assemble / organize | Rotate, reorder, extract, merge | `pdf-rotation.js`, `pdf-reorder.js`, `pdf-extract.js`, `pdf-merge.js` | Existing pdf-review.js, not direct Studio | Integrated Pages workflow; dedicated delete/blank insert not found in owned path | Dedicated tests exist; current full run pending |
| P1 complete paperwork | Forms | `pdf-forms.js`, `pdf-form-panel.js` | Original reader Fill; Studio handoff | Integrated targeted form workflow; restricted/dynamic types remain refused | Historical supported-field readback; not blanket XFA support |
| P1 deliver work | Export/share/print | Exact-byte browser viewer handoff in `pdf-review.js`; native Studio SAF export | Studio export, no print entry | Direct Studio print; Android native print adapter not established | Browser print handoff historical proof; no physical print proof |
| P1 keep context | Linked notebook / source | transactional source-notes.js, exact digest/page ref | Studio Notes ↔ full notebook | Portable source-plus-notebook bundle remains separate work | Current browser bidirectional/recovery proof; Android in progress |
| P2 revise visual material | Existing image replace/move/resize/crop | No owned API/UI found in current audit; vendor primitives not parity proof | Notebook image insertion is a different capability | Existing PDF image lifecycle, preservation checks, targeted UI | Not implemented in audited owned path; broader vendor audit open |
| P2 scanned paperwork | OCR | Prior local engine and crop/rotation transforms referenced in tasks/todo.md; integration inventory still being checked | Not exposed in Studio | Source-preserving OCR workflow and current-language/platform gate | Not yet fully audited; do not label entirely absent |
| P2 remove sensitive content | Redaction | MuPDF primitive exists; owned workflow not established | No verified Studio path | Actual removal, preview, irreversible-action clarity and leak verification | Not yet fully audited; crop is explicitly not redaction |
| P2 certify documents | Certificate signing | No certificate signing in audited frontend | Handwriting only | Credential/device/service authority and certificate verification | Missing here; no signing success may be simulated |
| Later reference parity | Bookmarks/outlines, annotation list, two-page/read modes, image/OCR conversion, compression, links, stamps/shapes, measurement | Some reader modules exist; vendor capabilities vary | Incomplete audit | Full lifecycle/platform matrix remains open | Not claimed from a feature catalog |

## Reference evidence and recovered requirements

Primary PDF Expert pages inspected today: [text editing](https://support.readdle.com/pdfexpert/en_US/edit-pdfs/edit-text-in-pdf-files), [image editing](https://support.readdle.com/pdfexpert/en_US/edit-pdfs/edit-images-in-pdfs), [text markup](https://support.readdle.com/pdfexpert/en_US/reading-pdfs/highlight-underline-and-strikethrough-text), [content selection/crop](https://support.readdle.com/pdfexpert/en_US/annotate-pdfs/content-selection-tool), [page management](https://support.readdle.com/pdfexpert/en_US/managing-files-and-folders/add-delete-and-rearrange-pdf-pages), [drawing](https://support.readdle.com/pdfexpert/en_US/annotate-pdfs/draw-on-a-pdf-file). These are official documented interactions, not new hands-on iOS observations. Crop article's Mac section describes page crop; iOS section describes annotation/screenshot selection. Image editing docs distinguish real object editing from scanned image content.

Recovered local requirements: `tasks/pdf-text-markup-plan.md` preserves exact single/cross-page selection, named colors, durable undo, backup and native annotation output; `tasks/reader-edit-text-plan.md` bounds paragraph editing and leaves arbitrary fonts/images/layout open; `docs/architecture/PDF_PRINT.md` requires the exact immutable PDF bytes, disabled failed-render handoff, blocked-tab recovery and no physical-printer success claim. Prior crop tests validate geometry, not crop authoring.

## High-priority interaction lifecycles

| Tool | Enter / target | Configure / preview | Apply / cancel / history | Persistence / delivery | Input and failure |
|---|---|---|---|---|---|
| Highlight / underline / strikeout | Read-select or Highlight tool; select exact source words on page, with searchable text-list equivalent | Selected quote, named color and style; preview only selected source geometry | Apply commits source-anchored mark; Cancel clears selection; Undo/Redo restores exact same mark | Same draft custody as other Studio marks; native PDF subtype/quads/color verified on export | Touch text selection and keyboard-selectable text; reject stale source and ambiguous mapping; scans explain unavailable text selection |
| Existing text | Edit task, tap/select real paragraph; explicit paragraph list equivalent | Original and replacement together, target outline; verified edited PDF preview | Apply creates reviewed copy; Cancel preserves source and draft; document history references previous exact artifact | Reuse existing paragraph engine and verification, never cover old words with white rectangle | Bounds/glyph/overlap refusal explains remedy; no supported-action placeholder |
| Crop | Pages task, Crop current page; direct rectangle selection with four inset fields | Shade excluded area, show retained bounds; dimensions in points | Preview on current page; Apply creates cropped copy; Cancel removes preview; history can return original exact artifact | Change CropBox only; original preserved; content is hidden, not erased; exported box and preserved streams verified | Keyboard insets, touch drag, all rotations/nonzero CropBox/UserUnit; invalid rectangle/protected document refused |
| Print | Export task, Print saved PDF | Exact saved artifact and visible-marks inclusion decision | Open system/browser print UI; cancel preserves file; no print-completed fabrication | Immutable PDF snapshot, not HTML/canvas screenshot | Native adapter only if implemented; browser popup recovery; download fallback |
| Undo / redo | Contextual explicit controls, keyboard standard shortcuts | Enabled state reflects actual applicable history | New edit clears redo; cancelled operation adds no history; failures keep previous usable state | Draft history restored with document | Two-finger horizontal swipes conflict with page navigation, pan/zoom and platform/screen-reader gestures. Do not reserve them globally. Evaluate an opt-in edit-mode gesture only after explicit controls and real touch conflict tests; teaching must be contextual and dismissible |

## Immediate build order

1. Keep c2d2342 Android checkpoint verification isolated; don't let new work change its provenance.
2. Implement owned crop engine with structure/readback tests in an isolated writer; root owns Studio integration.
3. Expose exact source-word selection, highlighter/underline/strikeout, search and redo through one contextual Review toolset, reusing anchors and native exporter.
4. Integrate crop preview/apply/history and exact saved-PDF print into Pages/Export. Verify actual output, not a painted rectangle.
5. Bring actual paragraph editing and existing page/form tools into the same workspace; continue the ranked matrix before claiming parity. Image editing, OCR, redaction and other reference tools stay explicitly open until independently verified.

## Integrated checkpoint after the initial audit

The matrix above records the pre-build gap assessment, not the current implementation inventory. The searchable `#guide` surface is the current capability map.

- Studio now exposes source-word search, DOM text selection, highlight/underline/strikeout, native-annotation reviewed copies, and CropBox authoring. Browser readback verifies Highlight and Underline survive reviewed export and crop; source bytes remain equal. The crop engine separately verifies rotation, existing boxes, UserUnit and retained document structure.
- Existing paragraph editing is integrated directly: select a paragraph or its page target, persist replacement draft, reopen it, and create an independently checked edited PDF. Unsupported glyph/layout/overlap cases retain the existing engine's refusals.
- Ink/text redo is durable in the Studio draft. Markup redo currently lasts for the open document session; cross-page range metadata is retained when reapplying an existing range. A common persistent operation history across all editing tools remains open.
- Android exact-PDF printing has a native adapter at native revision `a0be01c`; the frontend now answers validated subset requests using the existing extraction engine. Unsupported extraction fails explicitly. Native all-page printing keeps the exact source bytes. System-dialog, subset output and cancellation verification require the packaged checkpoint; no physical printing claim follows.
- Short-height input layout passed the browser geometry check at 800 × 250. The prior Android landscape keyboard failure remains open until the next emulator package verifies it.
- The guide links real journeys, reference evidence, widget/capsule specimens, accessible input states, voice-to-LaTeX foundations and intended adapters. Working-surface labels mean browser reachability, not native or release parity.

Focused evidence logs: `/tmp/jetty-selection-final.log`, `/tmp/jetty-capabilities-ui-final-2.log`, `/tmp/jetty-integrated-final-focused.log`. The earlier full-suite run began before this integration and is not exact-revision proof of these changes.

### Page and form checkpoint

Studio now exposes supported form fields with draft recovery, verified filled copies, and guarded route changes during failed saves. A real browser test injects storage failure, attempts to leave through hash navigation, verifies the answers stay visible, retries, reopens, and independently reads filled PDF fields. Error feedback stays inside an open control panel so it cannot cover Retry.

Page organization now exposes rotate/reorder/extract/merge through the existing preservation engines. A Studio journey rotates, reorders, extracts, and opens the prior exact version. Extraction now accepts bounded constructor metadata and the native Ink/FreeText/Underline/StrikeOut annotations produced by Studio while preserving them; forms/navigation and unsupported structures remain refused. An opaque page-object reference inside metadata is rejected. A 100 MB preflight bounds merge input before reading files.

Short-height layout uses the same horizontal text row at every width. At 920 × 126 CSS pixels, input and the full 44 px Add button remain within the viewport. Separate Android verification is required for the new layout.

Focused gate: 19 tests pass in `/tmp/jetty-second-checkpoint-final.log`, including form recovery, real page journeys, exact native extraction, native print responder, existing form lifecycle, and paragraph/short-height/guide checks. Subsequent snapshot guards require the refreshed editor gate before packaging.

### Scanner, image and resume checkpoint

Studio Library now exposes camera/file scanning, checkpoint recovery, separate new documents, and one-transaction custody of PDF plus all active/superseded/removed source images. Stable save identity includes the exact PDF digest and checkpoint metadata: repeated equal output reuses its record; a changed revision or different PDF bytes creates a separate record. Browser tests exercise camera track shutdown, storage failure/retry, removed-source equality, repeat save, rotated save, new scan, different-byte acknowledgement and cold-launch resume. Browser media is synthetic; physical camera quality is unmeasured. OCR is not wired to a browser provider.

Write now exposes bounded native PDF image move/resize/replacement, with unsupported structure explained before editing. The Studio-level test follows file import through the actual command dispatcher, saves a moved copy, independently reads image bounds, and compares original bytes. Component tests also cover replacement transparency refusal, storage retry and stale page/route completion.

Fresh gates: `/tmp/jetty-scan-image-journeys-final.log` (5 pass); `/tmp/jetty-scan-exact-custody.log` (1 pass after exact-byte identity fix); `/tmp/jetty-scan-checkpoint-editor-regression.log` (11 pass). Production build succeeds. Previous broad moving-source suite had 508/510 passing, with both failures passing fresh isolated reruns; this is not an exact-final full-suite claim.

Android checkpoint d504449 separately verifies the full keyboard target, form persistence and field readback, page rotation/reorder/extraction, and original byte equality. Scanner/image/resume changes require a newer package. Native iOS scanner work is separately owned in the current JttyApp target and is not yet claimed complete.

### Android lifecycle follow-up

Actual API 35 testing of e722 found that Android Home did not reliably produce a WebView visibility change, leaving the camera client active. The next frontend handles an explicit native-background event by stopping capture and resetting controls; native onStop must emit it and stop video tracks as a fallback. Permission denial now offers retry or image intake. The mobile rail now fits all five actions in one row. The original native RED is retained; only a fresh package can clear the Android lifecycle gate.
