# Own JETT Edit text workspace

## Outcome and source evidence

The next missing primary workspace is Edit. Reuse Bento's actual PDF text engine beneath JETT controls, with original source preservation, reversible draft changes, rendered review and a durable derived Library document. This increment advances the full PDF Expert baseline; it does not close general text/layout/font or editing parity.

Read-only audit of installed Bento revision `f0c0a3fc83ad99655026b7a8524cbb6ba58cdde4` found `src/js/editcore/core.js` exposes `PdfEngine.create`, `open`, `loadPage`, `buildModel`, `previewParagraph`, `commitParagraph`, `saveSpliced` and `close`. `engine-loader.js` loads `bentopdf-pdfium` version `0.0.0-8ff5002c6cd5`. `app.js` contains additional preservation and font helpers but installs global UI handlers; do not embed that controller or silently omit its preservation logic. Repo and engine metadata declare AGPLv3; retain source, license and exact provenance with any vendoring.

## Plan before implementation

1. Inspect the model/run format and upstream save pipeline, including tags, Type3 text, artwork and font substitution. Establish an independently verified fixture matrix and supported/fail-closed boundaries. Determine a portable local engine dependency; no absolute developer runtime path or assumed running Bento server in product code.

   Independent review priority: composed input already contains native annotations. Editing beneath a mark/note can leave obsolete geometry or quoted contents even without copying JETT records. Define and verify annotation adjustment/reanchoring as part of full editing support. Until that is proven, refuse edits intersecting annotated paragraphs with a clear explanation; never silently preserve misleading marks. Include this intersection in the fixture matrix.
2. Add an isolated, owned engine adapter over copied committed work using the existing queue/form flush/combined export pipeline. Clean up WASM resources on cancellation and source changes. Paragraph IDs are session-local and must never become JETT text anchors.
3. Add JETT Edit controls for paragraph selection, preserving run formatting during text changes, reversible draft changes and visible preview. Validate insertion characters/font support instead of promising glyph fidelity without proof. Guard unsaved note/edit drafts and stale completions.
4. Commit into copied bytes only after preview acceptance, independently parse/render the result and open existing PDF Review. Use the existing reviewed-copy ingestion for Library saving, retry identity and parent provenance; changed text must not inherit obsolete annotation anchors.
5. Test genuine edits (including replacement length and line reflow), cancellation, undo, source switching, storage failure, unsupported cases, original bytes, saved work, PDF output and reopened Library copies. Inspect rendered results, run independent review and full gates.

`saveSpliced()` may serialize the full document. Do not claim byte preservation outside an edit. General replace-all, arbitrary font replacement, images/layout, scanned OCR editing and full PDF Expert parity remain explicit requirements beyond this first verified workflow.
