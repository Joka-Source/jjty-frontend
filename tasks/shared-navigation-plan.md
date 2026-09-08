# Shared Reader navigation

Unify page-number, contents and search detours through the same serialized document-owned navigation implementation. Preserve the first departure page/offset/zoom until Return succeeds, including same-page search movement. Contents awaits actual success and no longer owns a separate Back history in JETT; standalone contents controller compatibility remains explicit.

Search events snapshot query/source and reject superseded typing. No-hit searches update paint/count without moving or creating a return point. Search navigation uses the exact hit geometry, leaves focus in the search field and shares blank-page/selection/dirty-note guards. Publish search state only for the active owner. Return remains durable across reload/tab switches.

Verify mixed contents→search→numbered jumps→Return, exact same-page results, query misses, rapid typing, stale source and callback failure. Existing contents standalone/recovery tests and the full suite remain required. Reader thumbnails follow on this common navigation foundation; no parity completion claim.
