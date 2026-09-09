# EPUB reading modes and passage continuity

## Outcome

Keep advancing the Apple Books baseline after the first semantic EPUB journey. A reader can choose continuous scrolling or paginated reading, move forward/back through the spine, change typography or screen size and resume the same source passage. Screen pages are derived layout, never annotation identity. Keep all PDF Expert/native voice/sync/release commitments active.

## Plan before implementation

1. Audit current semantic DOM, source-bound anchors and sticky controls. Define chapter, source block, character offset and relative passage position independently of CSS geometry. Retain exact original ZIP and version derived metadata if any new persisted data is introduced.
2. Compare browser multicolumn layout and chapter-page containers using long, illustrated, nested-list, RTL and fixed-size publisher fixtures. Preserve semantic selection, annotations, local assets, accessibility and footnote targets. Do not choose a canvas-only or plain-text view to simplify pagination.
3. Add a persistent reading-mode choice and direct forward/back controls, keyboard navigation and meaningful progress. First/last chapter transitions and Return must preserve source ownership and pending note/draft guards. Reduced motion must avoid animated travel.
4. Preserve the visible source passage across mode switches, font changes, mobile/tablet/desktop changes and reload. Resolve bookmark/search/footnote targets through the source identity into the current layout. Hold and cancel stale layouts during route/source changes; cover rapid repeated transitions.
5. Verify real browser journeys and rendered phone/tablet/desktop states, plus backup restore and prior PDF regressions. Update the versioned EPUB parity inventory with exact evidence and remaining gaps. Fixed-layout EPUB, complete typography/themes and native/device parity remain required future work unless completed here.

No push or deployment follows from this plan.
