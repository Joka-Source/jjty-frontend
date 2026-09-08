# Bento-first delivery — 9 September

Founder priority: install/adopt actual Bento now; pause unrelated Android backup work.

Plan: preserve upstream at d69566e, adapt in separate runtime/bento-jett worktree. Add bounded local source/result transport with strict origin and token ownership while retaining Bento COOP/COEP. JETT Library opens the full tools; Reader sends an original copy to a real upstream upload handler. Saved output returns as a distinct durable document with provenance, retry identity and original preserved. No parity or production claim from local integration.

- [x] Install and run upstream Bento; verify real create/duplicate/export.
- [x] Bridge actual source intake and exported PDF through Bento tools.
- [x] JETT source handoff and durable result return with reload/retry recovery.
- [x] Independent review of origin checks, lifecycle, failures and source custody.
- [x] Real browser source -> duplicate/rotate -> export -> JETT reopen; independent PDF readback.
- [x] Focused checks and full frontend suite.
- [x] SSOT evidence and local commits (frontend3a9639b, Bento161d39a).

Ownership: bento_bridge owns isolated Bento worktree; frontend_bento owns frontend implementation; lead owns integration/review evidence and SSOT. Existing README edits preserved.

Review: actual upstream Multi Tool source intake -> duplicate -> PDF export -> durable JETT return -> Library reopen after reload passed in isolated Chrome. Poppler independently confirmed three pages in order1,1,2; original bytes unchanged. Full frontend suite387 passed, additional focused service/IndexedDB checks passed. Local integration only; original-copy handoff excludes JETT annotations. Android backup remains paused. Next: cover Edit PDF and Fill/Sign return journeys and remove handoff loss on upstream reset navigation.

## Bento editing continuation

Prior turn: progress; installed integration and verified source/edit/export/reopen with independent readback.

- [x] Verify real Edit PDF and form/sign output in isolated browser, including fill -> sign chain.
- [x] Preserve explicit handoff through upstream navigation with stale-session guards.
- [x] Add direct purpose-labelled tool choice in JETT Reader and preserve it on Resume.
- [x] Review, focused tests, build and output fidelity; update SSOT with exact revisions.

Plan: retain original-copy semantics. Allow only verified upstream tool routes through one service mapping; persist the selected tool with pending session for recovery. Keep old pending sessions compatible with Organize default. Expose tool choice only for PDF sources.

Review: frontend391tests/build pass; Bento5tests/tsc pass; independent review clean. Poppler/pdf-lib verified4actual browser journeys including fill-to-sign continuity. Sourcef2cde76/Bento4c5c3c3. Added text is not existing-text replacement. Next verify actual existing-text engine, then OCR through the same durable return.

## Existing-text and OCR continuation

Previous goal turn: progress; actual editing, forms and fill-to-sign output verified and committed.

Plan: expose actual upstream existing-text editor and OCR routes with explicit labels; verify original text replacement and image-only-to-searchable output through real browser exports and durable return. Preserve original bytes and document structures; independently inspect results before claims.

- [x] Add supported text/OCR routes and purposeful Reader choices.
- [x] Real existing-text replacement, exported PDF readback and JETT reopen.
- [x] Real OCR on image-only source, engine/asset evidence and searchable returned output.
- [x] Independent review, focused/full checks, SSOT and scoped commits.

Review: text replacement changes original content (not overlays); form geometry preserved, font substitution remains. OCR fresh engine and searchable JETT reopen passed; partial recognition cannot omit source pages. Frontend391/full build, OCR51, bridge6 and tsc pass. Next local OCR asset packaging/offline acceptance, then broader fidelity corpus.

## Local OCR assets

Previous goal turn: progress; existing-text replacement and searchable OCR journeys verified with source preserved.

Plan: pin worker/core variants, English/Hindi data and fonts; reproducible installer validates hashes and keeps binaries outside tracked application data. Preserve explicit host overrides. Local launcher prepares complete assets before serving. Verify fresh browser OCR with every nonloopback request blocked, including workers, then durable return/search. This proves independence from external services while local servers run, not server-free offline PWA behavior.

- [x] Pinned manifest, complete installation and runtime defaults with override tests.
- [x] Launcher prepares/verifies required local assets (23 pinned files; bash syntax and asset check pass).
- [x] Fresh external-network-blocked English and mixed Hindi/English OCR, full expected PDF text, durable return/reload/search; keyboard process/export.
- [x] Independent review, 72 Vitest +4 Node tests, TypeScript, original/output checksums, Poppler readback and committed synthetic evidence. Bento130d4bb/harnessaffd81b.

- [ ] Repair Bento handoff banner overlap with OCR process control after language-list scrolling; keyboard activation is used for current mixed-language acceptance and does not prove pointer reachability.

## Founder EPUB direction — 9 September

- [x] Record founder authority and seed documentation-backed inventory in `docs/quality/APPLE_BOOKS_EPUB_BASELINE.md` (draft 0.1, iPadOS 26 documentation; device walkthrough pending).

- [ ] Versioned Apple Books EPUB reference walkthrough and complete acceptance inventory; minimum quality at least Apple Books, ambition to surpass it. Keep EPUB source custody and reading/annotation continuity in the shared product design. Current Bento/OCR work continues. Canonical direction recorded in SSOT section19.
