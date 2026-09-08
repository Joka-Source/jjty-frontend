# Library and tabbed Reader — execution plan

Authority: founder SSOT section 19 and the continuous goal. Routine product and engineering choices are delegated; the decisions below use that authority without another approval loop. This is a verified increment toward the full application, not a reduced definition of the company goal.

## Outcome

Open two documents from Library, work in each, switch and reload, and return to the same page/offset, zoom mode and selected workspace with saved annotations/forms intact. Closing a tab never deletes its document. The paper is the primary Reader surface; Library, activity and advanced document controls stop occupying permanent columns.

## Scope challenge / what already exists

Reuse the single active renderer, `documentQueue`/`openDocumentNow`, IndexedDB originals/records, semantic position memory, annotation/form/reorder controls, shell routes and actual Bento handoff. Do not retain parallel PDF engines or invent a second document store.

The existing fixed chrome/permanent side columns obscure the document. Current boot opens the newest document; PDF zoom is memory-only, and block position cannot represent an image-only page. `setPdfZoom` can overlap a document open and uses mutable global state after awaiting. These are the concrete gaps addressed here. Fit width is required because the current 75% minimum cannot fit a large page on a phone.

## Architecture decisions

1. A versioned `reader-session.js` stores only validated UI metadata in a separate localStorage key: ordered document IDs, active ID, source fingerprint/revision and per-document page/offset, block fallback, zoom mode/value, workspace and search. Original bytes, answers and annotations remain authoritative in IndexedDB. Corrupt/missing entries are pruned; blocked/quota storage produces a visible persistence warning while reading remains usable. Closing preserves per-document view metadata for later reopening.
2. One mounted renderer. Route activation through the existing serialized document queue; capture outgoing viewport and flush semantic position/form writes before switching. Fetch latest documents by ID for tabs, while preserving existing explicit source-edit snapshot calls. Serialize or generation-guard zoom/render work so stale completions cannot repaint a different document or its history. Persist activation only after successful open.
3. Add an explicit close lifecycle. Inactive close changes tab metadata only. Active close flushes pending saves and opens an adjacent tab; last close releases the renderer and shows Library. Failed form saves retain drafts and a recovery path; do not silently discard them by closing. Tab close is never document deletion.
4. Read/Annotate/Organize/Fill are allowlisted workspace choices connected to real existing panels/actions; persist workspace per document. Transient selected ranges and destructive selections reset. The selected Bento operation is retained per document if it is part of the toolbar. Do not show nonfunctional tools as working controls.
5. PDF zoom has explicit Fit width/custom modes. Fit width uses the actual available reader width and PDF page geometry through the shared renderer, preserving text/canvas alignment. Resize recomputes fit mode only; custom zoom remains custom. Scrolling/zoom snapshots must cover image-only pages without semantic blocks.
6. Honor explicit shell routes and onboarding. Restore the last valid active tab on a Reader reload; a Library/Settings route remains that route. Legacy users without a session keep access to all saved documents through Library. Missing/deleted documents cannot crash restoration.

```
Library / tab / Bento saved result
             |
      capture outgoing view -> flush saves (failure -> recovery)
             |
      documentQueue -> latest stored document / explicit edit snapshot
             |
      single renderer + generation-owned zoom/history
             |
      restore validated page / zoom / workspace / search
             |
      commit active tab metadata -> render tab strip
```

## Design contract

Neutral existing palette, restrained glass on navigation, stable readable paper. Approximately 48px app navigation, horizontal document tabs and a compact document toolbar. Library shows a clear heading, search, Open file and real document rows; pasted-text intake stays available in a disclosure. Primary navigation is Library, Reader and Settings with secondary existing destinations in More.

Move existing nodes/IDs instead of duplicating controls. Source/rename/download/review live in a document menu. Contents, zoom/Fit width, Find and actual PDF workspaces remain close to the paper. Math/server/history become optional panels. The Bento return notice occupies space and cannot overlay controls. Phone layouts have scrollable tabs, 44px targets, no horizontal page overflow in Fit width, and reachable drawers. Reduced motion/transparency and keyboard access remain supported.

Tab keyboard semantics: roving focus with arrows/Home/End; Enter/Space activates (PDF loading is asynchronous); Delete closes the focused tab with focus moved predictably. Close buttons must not be nested interactive elements. Sources: [W3C tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), [MDN storage behavior](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).

## Implementation tasks and ownership

- [ ] T1 / state lane — `reader-session.js`, `main.js`, `pdf-reading.js`, necessary form flush boundary, focused unit tests. Own renderer/session integration and Fit width. No HTML/CSS edits.
- [ ] T2 / chrome lane — `index.html`, `jett.css`, `shell.js`, new small `reader-chrome.js` if needed. Own markup/layout/tab keyboard rendering and route lifecycle callbacks. No `main.js` edits. Agree explicit DOM/callback interface with T1 first.
- [ ] T3 / root verification — new browser tests and existing tests affected by intentional relocated controls. Exercise real state transitions, corruption/write failures and original/form/annotation preservation. No weakening assertions to keep obsolete presentation.
- [ ] T4 / independent reviewer — review plan, state ownership, failure handling, stale render protection, accessibility and actual screenshots; record actionable findings and close them before commit.

T1 and T2 share the source directory but have explicit nonoverlapping file ownership. They run after this plan, coordinate the interface, then integrate before T3 full verification. All agents preserve unrelated README changes. Scoped local commits only.

## Test review and failure map

| Flow / branch | Failure | Required evidence |
|---|---|---|
| Session parse/save | Corrupt metadata; storage throws | Unit validation; browser remains usable and shows save limitation |
| Open/switch | Missing ID, rapid A→B→C, stale zoom | Real browser ends on intended document, correct controls/history; no stale paint |
| View snapshot | Blank page, mixed page sizes, Library round-trip | Independent page/offset/zoom state restored within a documented pixel tolerance |
| Tools/search | Wrong workspace or old search leaks | Per-document workspace/query restored; deliberate anchor navigation wins |
| Edit then close/switch | In-flight or failed form save | Saved answer survives; failed draft remains recoverable, no silent close loss |
| Close active/inactive/last | Deletes work or wrong focus | Tab disappears only; original/records still in Library; keyboard focus correct |
| Reopen/reload | Newest document replaces active | Correct last active and all tabs restored; explicit routes honored |
| Rename/source edit | Stale object/title or invalid page | Latest title, fingerprint handling and page clamping verified |
| Fit width/resize | Clipped page or shifted search | 390/834/1440px screenshots; rotated/cropped highlight alignment preserved |
| Bento round-trip | Returned result replaces source tab | Actual result is a new durable tab; source bytes unchanged after reload |

```
session unit: parse -> normalize -> open/close/update -> persist/error
browser: import A+B -> set independent view/work -> switch -> reload
         -> close inactive/active/last -> reopen from Library
race: delay A render/zoom -> request B -> release A -> B remains current
recovery: form write failure -> close request -> draft/retry remains available
responsive: fit PDF -> resize -> text/highlight coordinates still match paper
```

Focused Node tests plus `npm test` (build and full suite) are required after integration. Actual browser journeys and screenshots establish UI claims; unit pass counts alone do not. If existing controls move into menus, update their tests to perform that real user navigation.

## Performance and error handling

Only one PDF engine is live. Persist small metadata on meaningful transitions and coalesce scroll updates; do not rewrite documents on scroll. Snapshot all relevant state before asynchronous teardown. An activation failure keeps an honest error/retry state and never claims the requested document is active. Keep current record/source custody authoritative.

## NOT in scope for this increment

Full EPUB engine/Apple Books parity, full PDF Expert inventory, native shell replacement, authenticated cloud sync and deployment remain active company requirements but are not claimed by this web shell increment. This change introduces no new distribution artifact or external publication. Thumbnail/Pencil/tool-preset completeness must not be implied by the existing Contents and tool controls.

## Review status

Step 0: scope accepted; necessary lifecycle and layout changes, no parallel renderers or replacement document store. Architecture, code quality, test and performance findings are addressed in the decisions and test map above. Independent architecture and implementation review completed; explicit-anchor fit restoration, close-rejection propagation, non-PDF capability gating and sticky-height feedback findings were repaired. Browser acceptance additionally caught detached-control boot initialization and drawer/pointer timing; focused checks pass. Final npm test passed: build,400tests,0failures. Actual responsive and Bento round-trip evidence is stored under human/evidence/2026-09-09/reader-shell. No new external authority is needed for this local work.
