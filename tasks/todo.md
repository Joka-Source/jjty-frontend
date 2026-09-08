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

- [x] Repair Bento handoff banner overlap; bottom-edge pointer processing/export and durable return now accepted (5f9a3b3; harness41a74ce).

## Founder EPUB direction — 9 September

- [x] Record founder authority and seed documentation-backed inventory in `docs/quality/APPLE_BOOKS_EPUB_BASELINE.md` (draft 0.1, iPadOS 26 documentation; device walkthrough pending).

- [ ] Versioned Apple Books EPUB reference walkthrough and complete acceptance inventory; minimum quality at least Apple Books, ambition to surpass it. Keep EPUB source custody and reading/annotation continuity in the shared product design. Current Bento/OCR work continues. Canonical direction recorded in SSOT section19.


## Bento pointer recovery — 9 September

Previous turn: progress, committed local OCR runtime and exact English/Hindi browser/PDF evidence. Plan: reproduce process-button hit interception at the original scroll position; reserve space for the actual handoff banner height without losing responsive controls; test pointer process/export, narrow viewport hit targets and complete durable OCR output. Keep background goal and Apple Books baseline intact.

- [x] Reproduce exact pointer target: original130d4bb process center(720,960), scrollY278 hits banner SPAN; fixed layout hits Start OCR. Independent review clean.
- [x] Verify desktop bottom-edge pointer process/export;390px Return boot;360px organizer reachability/actions; English/mixed durable journeys, source hashes and full PDF text.
- [x] Independent review,938 upstream tests +6 adapter/API tests, scoped commits and SSOT evidence.

Review: banner occupies layout space before the direct page footer; blocked navigation reveals the explanation. Local JETT server was confirmed stopped and restored before final acceptance. Next: broaden OCR fidelity to multi-page/rotated mixed-language documents and visible partial-output warnings. Apple Books inventory/device observation and the full three-platform product goal remain open.


## Multi-page OCR fidelity — 9 September

Previous turn: progress, verified pointer recovery committed. Plan: reproduce actual PDF /Rotate90/270 and nonzero CropBox effects with a four-page image-only English/Hindi corpus; correct viewport-to-source mapping while preserving page geometry and visible original; verify real local engine, pointer export, durable return/search, independent per-page PDF text and raster equality. Keep injected failure tests distinct from real recognition.

- [x] Four-page source corpus: upright mixed English/Hindi, Rotate90, Rotate270 and nonzero CropBox. Baseline22misplacedwords and Poppler page3 reading-order failure reproduced.
- [x] Inverse viewport transform preserves original rotation/crop/UserUnit; eight real-PDFjs geometry regressions and independent review. Bento f0c0a3f.
- [x] Real corpus39word geometry checks; reopened page2/page4 highlights; independent Poppler expectedphrases, unchanged boxes/rotation and identical72dpi pixels. Separate injected-page2 failure verifies visible warning and preserved image-only page.
- [x] Scoped code/evidence committed: Bento f0c0a3f, frontend0b51d3a;946fulltests pass.

Review: rotation/crop mismatch fixed; source pixels remain identical in four-page corpus. Fault injection is separate evidence, not a claim of natural OCR failure or broad accuracy. Next: implement the intended web Library/tabbed Reader, reusing durable custody/operations/Bento integration, with per-document position/zoom/tool state restored through switches and reload. PDF Expert and Apple Books full inventories, native journeys and production remain open.

## Library and tabbed Reader — 9 September

Plan: [reader-plan.md](reader-plan.md). Keep one renderer and durable per-document view metadata, compact document-first chrome, actual fit-width scaling and connected Bento workspaces. Preserve original sources and saved edits when closing tabs.

- [x] Engineering/design plan and independent architectural review.
- [x] Implement session state and compact Library/Reader chrome.
- [x] Browser switch/reload/close preserves position, zoom, workspace and answers; phone fit-width and manual keyboard activation pass.
- [x] Independent implementation review, broader recovery checks and existing workflow regression suite: build and all400tests pass.
- [x] Desktop/tablet/phone rendered evidence and scoped local implementation commit; canonical SSOT update accompanies the evidence commit.

Review: one active renderer, durable per-document view metadata, manual keyboard tabs and actual fit-width rendering. Real Bento duplicate/export/return preserves source bytes and distinct tabs through reload; Poppler confirms1,1,2. Injected form-save failure retains draft/tab/focus until Retry. Phone/desktop drawer access and reviewed annotation/extraction paths pass. Full npm test:400passed,0failed. Broader native, authenticated sync and PDF Expert/Apple Books parity remain open.

## Direct JETT annotation UI — 9 September

Plan: [annotation-ui-plan.md](annotation-ui-plan.md). Founder correction: the Bento catalog is not our professional document interface.

- [x] Visible JETT workspace navigation and direct Highlight, Note, Undo and Export PDF toolbar.
- [x] Stable exact occurrence mapping, cross-page highlights, durable save receipts and retained note drafts on save failure.
- [x] Independent mapping/highlight review; browser annotation/reload/native PDF export and stale-selection recovery checks.
- [x] Desktop/tablet/phone screenshots with no horizontal overflow.
- [x] Full regression gate: build and all 402 tests pass; scoped local implementation/evidence commits accompany this record.

Review: whole-word selections are explicit. Notes currently target one page; highlights can span pages. Browser DOM Range selection and real toolbar clicks are covered; physical touch/drag and full PDF Expert parity remain open. Apple Books remains the minimum EPUB benchmark.

## Visual page organization — 9 September

Plan: [page-organizer-plan.md](page-organizer-plan.md).

- [x] Direct Organize pages entry in JETT with explicit original-copy scope.
- [x] Visual overview, page selection, move earlier/later and extraction through verified snapshot operations; accessible Undo remains available.
- [x] Independently parsed downloaded order/extraction, byte-exact undo, rollback and restricted-document focused tests.
- [x] Independent review repaired incremental-render move closure; reviewed phone/desktop layouts.
- [x] Build and all 403 tests pass; final aspect-ratio render check also passes. Local evidence checkpoint accompanies this record.

Remaining: integrated saved annotations/form answers and durable derived-copy Library publication; full professional Organize workspace and native/touch parity.

## Reviewed copies in Library — 9 September

Plan: [reviewed-copy-library-plan.md](reviewed-copy-library-plan.md).

- [x] Save exact reviewed snapshot through shared derived-document import and atomic putDocIfAbsent.
- [x] Stable parent/output digest identity, explicit primary-source provenance and immutable origin through page edits.
- [x] Injected storage failure retains review; retry persists exact bytes that survive reload.
- [x] Late save cannot close/unlock newer review; queued activation rechecks ownership after pending saves.
- [x] Build and all 404 tests pass; desktop/phone rendered evidence inspected and checkpointed.

Next: compose saved annotations/form answers into the primary Organize workflow and retain the exact resulting copy in Library. Complete merged-input lineage separately; current metadata explicitly identifies the primary source only.

## Organize with saved work — 9 September

Plan: [organize-saved-work-plan.md](organize-saved-work-plan.md).

- [x] Primary Organize snapshots latest persisted form answers and committed marks; explicit original review remains separate.
- [x] Native modal preparation prevents additional form input; queue/review ownership checks discard cancelled results.
- [x] Actual failed-form-save/retry, Highlight/Note toolbar, cancelled preparation, rotation, Library save and reload journey.
- [x] Independent PDF.js field/annotation/rotation readback and Poppler rendered output; source bytes unchanged.
- [x] Independent review repaired modal close timing guard.
- [x] Build and all 405 tests pass; exact PDF/readback/rendered evidence checkpointed.

Next: direct Reader page navigation and thumbnail access, then richer annotation and Edit/Fill & Sign interactions against the PDF Expert inventory. Preserve Apple Books EPUB and all cross-platform gates.

## Direct Reader page navigation — 9 September

Plan: [reader-navigation-plan.md](reader-navigation-plan.md).

- [x] Physical page/total, validated Go, previous/next and durable return point per document.
- [x] Blank-page marker safety, stale selection clearing, queue ownership and destination keyboard focus.
- [x] 200-page small-page PDF jump/invalid input/reload/Return journey using mouse and keyboard.
- [x] Injected post-render history-load failure rolls back page surfaces/zoom and retains Return for retry.
- [x] Correct sticky-control scroll insets; inspected desktop/phone layout with 44px page buttons.
- [x] Build and all 407 tests pass; final navigation/render check and build also pass after control styling/state cleanup. Local evidence checkpointed.

Next: unify numbered-page, contents and search return state, then add collapsible thumbnails. The 200-page fixture uses 200×240pt pages with no text layer; it is navigation evidence, not a large-file performance benchmark or native-device parity proof.
