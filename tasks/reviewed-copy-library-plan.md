# Next: keep reviewed copies in Library

Expose Save copy to Library for the exact current reviewed snapshot. Reuse main.js Bento return ingestion (ingestPdfBrowser → addIngested with stable id → atomic putDocIfAbsent). Capture origin document ID/content digest when Review opens, propagate through edits/undo/rollback, and hash parent identity plus output digest for retry identity. Capture snapshot bytes at Save; never regenerate from mutable current document state. Once persistence commits, a later reader/render error must report saved with reopen recovery, not retry as a failed save.

Test double click, repeated save, changed output, reload, failed insert, and post-commit reader failure. Derived copy should open as its own tab and retain exact reviewed bytes. Preserve original and avoid copying parent local records/forms into the derived doc; embedded marks/answers belong in the bytes. Combined export uses exportCombinedPdf after flushing drafts, with provenance captured from the owner at preparation. Merged copies require all source digests before claiming complete source lineage.

This closes a custody gap in the own-UI workflow. It does not replace the intended full Organize/Edit/Fill & Sign workspace or broader PDF Expert, Apple Books, native, voice, sync and production gates.
