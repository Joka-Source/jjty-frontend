# Keep the document visible in JETT Annotate

## Evidence and outcome

The inspected 390×844 markup screenshot puts the page below approximately 708px: app navigation, tabs, workspace, three rows of document/navigation controls, two annotation rows and a redundant expanded export panel. Horizontal overflow passes, but that is insufficient reading quality. The own toolbar already exposes Export PDF. Preserve the durable markup journey while recovering useful page space.

## Implementation sequence

1. Consolidate the legacy annotation review surface into the existing Export PDF action. Preserve its underlying review ownership, dirty-note checks and error/status reporting; migrate any useful description into review. Update old highlight-only wording to marks. Keep combined forms behavior explicit.
2. Give narrow screens a compact document/view control disclosure with current page and Pages/Find still reachable. Keep exact control identities and existing handlers; expose zoom, page entry and document operations through deliberate opening rather than three permanently wrapped rows. Retain touch targets and keyboard labels.
3. Preserve selection, note drafts, source ownership, Return and reading offset when controls open/close or the viewport changes. Never silently discard a draft or perform a navigation as a layout side effect.

Independent review: a disclosure changes `readerTop()`. Capture the document-owned page/offset before changing open state, suppress transitional persistence, and restore after final header geometry. ResizeObserver alone runs too late to recover the original offset. Reuse the main-owned layout transaction and cancellation patterns rather than an independent scrolling controller.

## Verification

Write a browser journey using actual pointer/keyboard access for narrow-screen tools, all three markup actions, export, dirty-note refusal and page navigation/Return. Check document-visible height and absence of horizontal overflow at 390×844 and 768×1024, plus desktop stability. Inspect screenshots rather than treating CSS assertions as design approval. Update existing helpers to use visible controls without bypassing UI; run focused and full gates and independent review.

This is a UI continuation, not PDF Expert completion. Keep richer annotation editing, Pencil, EPUB/Apple Books, native voice, authenticated sync and release gates active.
