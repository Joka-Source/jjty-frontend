# BentoPDF adoption: verified source foundation

Inspected 8 September 2026. This is a source adoption map, not an integration-complete claim.

## Exact reference

- Upstream: https://github.com/alam00000/bentopdf
- Commit: `d69566ebefb9cc3ea2d8db4f845596356998a882` (5 September 2026, `fix footer issue`). Package version `2.8.8`.
- Checkout: `/Users/sunlight/Documents/ChatGPT/JJTY/runtime/references/bentopdf`, detached at that commit, clean after inspection.
- Shallow clone only. No dependency installation, lifecycle script, build, application, worker, or WASM binary was executed.
- Permanent source links use `https://github.com/alam00000/bentopdf/blob/d69566ebefb9cc3ea2d8db4f845596356998a882/` plus paths below.

## Modules to adopt, with actual mechanisms

| Area | Verified source paths | Actual implementation and reuse seam |
|---|---|---|
| Page organization | `src/js/logic/organize-pdf-page.ts`, `src/pages/organize-pdf.html` | SortableJS thumbnail grid retains `originalPageIndex`; custom page order validation; preview and thumbnail controls. `saveChanges` lines352–378 creates a fresh pdf-lib PDF and copies the chosen pages. Extract its selection/order model and concrete controls into a document-scoped JETT panel; retain upstream attribution. |
| Rotate/delete/split basic operations | `src/js/utils/pdf-operations.ts`, `src/js/logic/rotate-pdf-page.ts`, `src/js/logic/split-pdf-page.ts`, `src/js/utils/split-pdf-helpers.ts` | Real byte-in/byte-out functions `mergePdfs`, `splitPdf`, `rotatePdfPages`, `deletePdfPages`, `parsePageRange`; `parseRangeGroups`, `evenOddIndices` and qpdf-oriented helpers. Per-page rotation includes arbitrary-angle page embedding. Current JETT quarter-turn native mutation is stricter and should remain the quarter-turn backend; adopt useful orchestration/selection code and extend only through preservation tests. |
| Merge preserving advanced PDF structure | `src/js/logic/merge-pdf-page.ts`, `src/js/utils/merge-cpdf.ts`, `public/workers/merge.worker.js`, `src/js/types/merge-worker-type.ts` | Separate sortable file/page order UI and worker protocol. Page UI posts jobs and an explicit CPDF URL; worker imports that script and performs merge work. There is also the simpler pdf-lib utility path; these are distinct engines, not interchangeable capability claims. |
| Annotation/editor workspace | `src/js/logic/edit-pdf-page.ts`, `src/pages/edit-pdf.html`, `src/js/config/editor-fonts.ts` | Integrates the vendored `bentopdf-viewer` container/plugin APIs with the PDFium WASM URL, annotation handling and free-text font preparation. Reusable production-shaped editor host rather than isolated toolbar inspiration. Requires adapter boundary to JETT prepared bytes and durable records. |
| Existing text editing | `src/js/logic/edit-pdf-text-page.ts`, `src/js/logic/edit-pdf-text-dock.ts`, `src/js/editcore/app.js`, `src/js/editcore/core.js`, `src/js/editcore/engine-loader.js` | Editor menus, fit/zoom, history, selection and document panel; `PdfEngine` owns PDFium document/page handles and exposes saving. `saveSpliced` and `save` are concrete content-edit output paths. The loader resolves bundled `bentopdf-pdfium/editcore.wasm`. This is an actual existing-text implementation worth adopting behind a JETT adapter, not a new text overlay pretending to edit originals. |
| Difficult PDF text/content preservation | `src/js/editcore/streamsplice.js`, `tagsurgery.js`, `type3surgery.js`, `shadingsurgery.js`; tests `src/tests/editcore-smoke.test.ts`, `editcore-fonts.test.ts`, helpers `editcore-harness.ts`, `editcore-fixtures.ts` | Specialized content-stream parsing/splicing, tags, Type3 and shading handling. Reuse this tested engine boundary as a unit with its fixtures; do not casually copy one stream manipulation function without dependencies and proof. Tests were inspected, not run. |
| Form filling | `src/js/logic/form-filler-page.ts`, `public/pdfjs-viewer/viewer.html` | Uses a same-origin PDF.js iframe with a Blob URL. Its outer download action invokes `downloadButton`/`secondaryDownload` in the iframe. This is a viewer-backed form workflow, not an independent field serializer. JETT's source-bound draft and reopened field checks remain useful additions. |
| Form creation and existing field extraction | `src/js/logic/form-creator.ts`, `src/js/logic/form-creator-extraction.ts`, `src/js/types/form-creator-type.ts`, `src/tests/form-creator-extraction.test.ts` | pdf-lib native form creation, PDF.js rendering, draggable/resizable field state, extraction of existing fields, radio grouping, actions/visibility and barcode support. Adapt field creation/drawing model and fixture cases; JETT must retain its explicit treatment of scripts, signatures and unsupported dynamic forms. |
| OCR | `src/js/utils/ocr.ts`, `src/js/logic/ocr-pdf-page.ts`, `src/js/utils/hocr-transform.ts`, `src/js/utils/font-loader.ts`, `src/js/config/font-mappings.ts`; tests `src/tests/ocr.test.ts`, `hocr-transform.test.ts` | `performOcr(bytes,options)` returns PDF bytes, full text and per-page warnings. Tesseract recognizes rendered pages, hOCR geometry is mapped to PDF points, original pages are copied and an OCR text layer added. Includes RTL handling, font fallback, per-page timeout and worker termination. This is the first major missing JETT processing capability to adopt after organizer scaffolding. |
| OCR runtime ownership | `src/js/utils/tesseract-runtime.ts`, `src/js/utils/tesseract-language-availability.ts` | Explicit worker/core/language asset overrides and available-language checks. JETT should package/pin these assets and surface install/readiness before capture; browser processing does not itself mean no runtime network access. |
| Rendering/runtime | `src/js/utils/render-utils.ts`, `src/js/utils/page-preview.ts`, `src/js/utils/setup-pdf-worker.ts`, `src/js/pdf.worker.ts` | Progressive thumbnail rendering, placeholder observation, lazy-render cleanup and PDF.js worker setup/polyfill. Good direct reuse candidates after removing global singleton state and adding JETT generation cancellation. |
| Engine provider setup | `src/js/utils/wasm-provider.ts`, `src/js/config/wasm-cdn-config.ts`, `src/js/utils/wasm-preloader.ts`, `src/js/logic/wasm-settings-page.ts` | Provider registry, explicit runtime URLs and loading. Actual defaults are jsDelivr: PyMuPDF WASM0.11.16, gs-wasm0.1.1, coherentpdf2.5.5. User overrides are persisted in a Bento-specific localStorage key. Do not silently inherit these origins or settings into JETT. |
| Function-node workflows | `src/js/workflow/editor.ts`, `src/js/workflow/nodes/{merge,split,rotate,ocr}-node.ts` | Actual workflow node implementations already exist. Use these as the source of operation input/output contracts when exposing JETT function nodes; they do not automatically supply JETT receipts, undo, authority or background persistence. |

## Dependency and licence evidence

Declarations below were read from the pinned `package-lock.json`, root `package.json`/`LICENSE`, and vendored tarball `package.json` entries. This is an inventory of declarations, not a complete legal conclusion or full binary/transitive audit.

| Component | Exact locked version | Declared licence / evidence |
|---|---|---|
| BentoPDF application | 2.8.8 | `AGPL-3.0-only` in package.json, AGPLv3 root LICENSE. `docs/licensing.md` describes a separate commercial licence for its own code. No commercial grant was acquired or assumed. |
| pdf-lib | 1.17.1 | MIT |
| pdfjs-dist | 5.5.207 | Apache-2.0; note manifest range differs from exact lock |
| Tesseract.js | 7.0.0 | Apache-2.0 |
| SortableJS | 1.15.7 | MIT |
| @pdf-lib/fontkit | 1.1.1 | MIT |
| @neslinesli93/qpdf-wasm | 0.3.0 | ISC wrapper declaration; underlying qpdf/binary notices still require inventory before shipping |
| bentopdf-viewer | 2.9.1, tarball suffix8ff5002c6cd5 | MIT in tarball package.json; vendored compiled package, not its complete upstream source tree |
| bentopdf-pdfium | 0.0.0-8ff5002c6cd5 | AGPL-3.0 in tarball package.json; contains compiled JS/WASM. Do not infer a permissive licence from the PDFium name. |
| DOMPurify | 3.4.12 | MPL-2.0 OR Apache-2.0 |
| JSZip | 3.10.1 | MIT OR GPL-3.0-or-later |
| Rete / rete-area-plugin | 2.0.6 / 2.1.5 | MIT |
| PyMuPDF / Ghostscript / CPDF runtime packages | Pinned URLs above | Upstream README/docs identify AGPL-3.0 components, loaded separately. These binaries were not downloaded or executed during this audit. |

Important source/documentation discrepancy: upstream licensing prose says processing libraries are not bundled, but this exact checkout includes an **AGPL-declared bentopdf-pdfium tarball** and `public/qpdf.wasm`, plus LibreOffice runtime assets. Do not use that broad prose as a complete dependency boundary. Separate component notices and source availability must accompany actual redistribution. Root application commercial licensing does not establish rights for every third-party engine.

## First reusable integration recommendation

Adopt a **Bento-derived page organizer** as the next bounded JETT implementation, with an attributed vendor source directory pinned to this SHA. Start from `organize-pdf-page.ts`, `render-utils.ts`, `page-preview.ts` and `split-pdf-helpers.ts`, extract the actual selection/order/thumbnail behavior into a scoped adapter, and wire operations into JETT's prepared-copy review. This is deliberate source adaptation, with upstream files and modifications recorded, not independently recreating their UI from screenshots.

1. Preserve upstream notices and record the applicable source licence for copied code. Keep a source manifest with upstream SHA and local patch list; use the project's chosen distribution licence route rather than silently treating AGPL code as MIT.
2. Replace global DOM and singleton state with instance-owned state, immutable page identities, generation cancellation, keyboard reorder/select, recoverable operation history and an explicit apply step.
3. Improve `parseRangeGroups`: upstream currently silently skips invalid parts and uses numeric values without requiring integers. Return precise errors for fractional/malformed/out-of-range input, cap work, and do not execute a partly valid selection without showing it.
4. Connect quarter-turn controls to JETT's already verified native rotation operation. Bento's fresh-document copy/embed paths do not themselves prove preservation of all document-level AcroForms, signatures, outlines and attachments. Retain JETT's protection gates and reopen verification, and test a native organizer backend against repeated widgets, notes, rotated pages, outlines and attachments before claiming preserved functionality.
5. Follow with direct adoption of the OCR pipeline and its hOCR/font/runtime helpers under a source-tracked adapter. Add abort handling, local asset availability, searchable-output readback, and clear partial-page warnings.
6. Evaluate the complete Bento text-edit engine/package boundary as the next substantial editor integration. Obtain/track corresponding vendored engine source and notices; run the upstream fixture harness alongside JETT's preservation fixtures. Keep originals and form/annotation evidence intact while editing a derived copy.

PDF Expert parity remains the founder's full target. This map establishes concrete code to reuse; it does not certify feature, UI, gesture, microinteraction, accessibility or native-platform parity. No frontend source changed in this task.


## Implementation checkpoint — 8 September 2026

The first actual adaptation now lives in `vendor/bentopdf/page-order.js`, with
upstream LICENSE, NOTICE and a source manifest. It adapts the pinned split helpers
and custom-order behavior into strict complete-permutation validation. The review
screen accepts page numbers and ascending ranges (for example `3,1-2`), rejects
missing/repeated/malformed pages, and renders a derived copy before download.
This is a bounded custom-order operation, not the complete thumbnail organizer.

The native backend uses MuPDF rearrangePages and then reopens serialized bytes.
Testing found that native rearrangement drops catalog metadata, including AcroForm;
the adapter explicitly retains allowed catalog entries and verifies their contents.
Page content/resources, geometry, annotations, appearance streams, form values and
Info metadata are checked against original page identities. Independent PDF.js
readback covers reordered pages and filled/annotated fixtures. The original remains
unchanged. Failed or superseded previews cannot replace a newer review.

Navigation/tag structures (PageLabels, Outlines, Dests, Names, StructTreeRoot and
OpenAction), restricted/signature/dynamic forms and denied assembly permissions
remain refused. Deletion, duplication, merge, drag reordering and persistent organizer history
are not implemented by this increment. Source licensing is AGPL-3.0-only; no
commercial grant is assumed. This local implementation is not a production release.

A subsequent local increment adds one-step undo for reorder and rotation; it restores the exact prior reviewed bytes and handles render failure, close and supersession. Full build and 268 tests pass.


A later local checkpoint adds bounded semantic bookmark reconstruction for complete
reordering and early operation availability. Direct/local GoTo destinations,
nested/collapsed hierarchy, titles, style and coordinates are independently checked.
This supersedes the blanket Outlines refusal above only for this verified subset.
Named destinations, external bookmark actions, malformed/oversized trees and
unremapped numeric links/page actions remain refused. Tagged structures, attachment
name trees and page labels remain excluded. Build and 279 tests pass. Reader
bookmark navigation is a separate, still unimplemented interaction.
