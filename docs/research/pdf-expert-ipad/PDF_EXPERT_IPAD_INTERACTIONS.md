# PDF Expert iPad: official interaction inventory

Accessed 8 September 2026. Companion `pdf-expert-ipad-interactions.json` contains 24 rows with stable IDs and the requested fields. All rows are official help documentation, not direct app observations. App/OS versions are unspecified, so `observed_version` is null. `verification_needed` identifies unanswered behavior; `proposed_acceptance` is JETT design/test synthesis, not a PDF Expert promise or implemented JETT result.

Only the iPad/iOS sections were used. Several pages carry a machine-translation notice even on their English route. Icon images were not visually inspected, so controls are identified by documented names and placement, not guessed icon shapes. No entitlement, timing, gesture precision, offline durability or hardware claim was independently measured.

Important boundaries: the navigation article documents a previous-page return, not an arbitrarily deep back/forward history. The iOS summary article specifies HTML, whereas Mac lists additional formats. The selection article documents iOS annotation/screenshot selection and its action menu; crop instructions in the Mac section are not imported into iPad rows. Pencil sensitivity and palm behavior remain real-hardware checks.

## Sources read

- [nav](https://support.readdle.com/pdfexpert/en_US/reading-pdfs/jump-to-a-specific-page) — rows: pe-ipad-page-jump, pe-ipad-page-return.
- [tabs](https://support.readdle.com/pdfexpert/en_US/tips-and-tricks/work-with-tabs-on-your-ipad) — rows: pe-ipad-tab-switch, pe-ipad-tab-context, pe-ipad-tab-reorder.
- [toolbar](https://support.readdle.com/pdfexpert/en_US/tips-and-tricks/work-with-pdf-tools-and-customize-the-toolbar) — rows: pe-ipad-toolbar-toggle, pe-ipad-toolbar-position, pe-ipad-toolbar-organize.
- [annotations](https://support.readdle.com/pdfexpert/en_US/annotate-pdfs/view-and-export-annotation-summary) — rows: pe-ipad-annotation-jump, pe-ipad-annotation-search, pe-ipad-annotation-color, pe-ipad-annotation-delete.
- [export](https://support.readdle.com/pdfexpert/en_US/annotate-pdfs/export-annotation-summary) — rows: pe-ipad-summary-export, pe-ipad-annotated-pages-export.
- [selection](https://support.readdle.com/pdfexpert/en_US/annotate-pdfs/content-selection-tool) — rows: pe-ipad-area-selection.
- [drawing](https://support.readdle.com/pdfexpert/en_US/annotate-pdfs/draw-on-a-pdf-file) — rows: pe-ipad-drawing-presets, pe-ipad-drawing-navigation, pe-ipad-zoom-writing.
- [highlight](https://support.readdle.com/pdfexpert/en_US/reading-pdfs/highlight-underline-and-strikethrough-text) — rows: pe-ipad-text-markup, pe-ipad-markup-adjust-undo.
- [forms](https://support.readdle.com/pdfexpert/en_US/fill-and-sign-pdfs/fill-out-pdf-forms) — rows: pe-ipad-form-field-entry, pe-ipad-flat-form-entry, pe-ipad-form-date, pe-ipad-form-clear.

No frontend source changed. Validate the JSON as an array; all 24 IDs are unique and every row has the required schema fields. This is a bounded interaction inventory, not complete product parity coverage.
