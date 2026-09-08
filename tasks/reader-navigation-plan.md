# Next: direct Reader page navigation

Reference inventory rows pe-ipad-page-jump and pe-ipad-page-return define the numbered-page and previous-place jobs. They are documented reference behavior, not physical-device observations. Implement in our Reader: current physical page / total, validated page entry, previous/next page and a return-to-departure control. Retain the current reading renderer, source identity and per-document session. Follow with a collapsible thumbnail navigator using bounded/downsampled rendering.

Use the full reader chrome height when locating the visible page. Reject invalid numbers without moving. A deliberate jump captures the departure page/offset/zoom; Return restores that place, and a tab switch cannot apply a stale destination. Keep behavior consistent with search/contents return and durable per-document location. Do not invent page-label support when only physical indexes are available.

Verify a 200-page fixture (including blank pages), invalid input, repeated jumps, tab switching, reload, phone controls and keyboard navigation. Inspect rendered UI, run meaningful focused and full checks, and distinguish web evidence from current iPad PDF Expert device parity. Full Edit/Fill & Sign, richer annotations, Apple Books EPUB and three-platform continuity remain in scope.
