# Dock desktop Pages without hiding document text

## Evidence and outcome

The page-browser desktop render verifies bounded previews and navigation, but its persistent overlay hides the left edge of document text. The desktop panel must reserve space while preserving the reading place. Mobile stays a modal drawer. This replaces the prior no-width-change constraint with page/offset continuity through final layout.

## Independently reviewed implementation

- Main owns desktop open/close as a queueReader transaction. Validate source and Reader route; reject dirty note changes before changing layout.
- Capture source identity, page/offset, readerView, dock state and article.scrollLeft. Suppress the delayed scroll-capture timer during the transition.
- Apply a gutter to reader-main so article width truly changes. Fit mode rerenders through setPdfZoomNow with preserveView and throwOnFailure. Custom zoom keeps exact scale and existing horizontal scrolling.
- Restore the captured reading place against final geometry, refresh controls, then commit panel open/closed state. Preserve Return unchanged.
- Failure restores prior gutter/view/horizontal offset and retains the prior panel state. Reuse verified renderer rollback; never claim opening/closing succeeded after failed Fit.
- Source/route changes and desktop/mobile transitions may happen during render. Recheck identity after awaits and coordinate docking removal with responsive Fit scheduling; stale completion must not alter a new source.

## Acceptance

Fit and custom zoom on deep pages, exact page/offset continuity, no obscured left-edge text, failed-render rollback, retained dirty notes, rapid toggles, source replacement and desktop-to-mobile transitions. Keep thumbnail allocation and existing mixed navigation/source-byte tests. Inspect desktop and phone renders and run the full gate before an evidence commit.

Next after docking: richer own-UI annotation tools and persistent styles against the PDF Expert inventory, without dropping Apple Books EPUB, native voice, authenticated sync or release requirements.
