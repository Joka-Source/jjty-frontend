# A closer look: contributor guide

Internal product map, audited 13 September 2026 against frontend c2d2342 and crop engine 39baa99. The guide is intentionally separate from everyday document controls. Route integration belongs to the Studio owner: import `guideView` and `setupGuide` from `studio/product-guide.js`, render `guideView()` at `#guide`, then call `setupGuide(root)` after each render. Link it from the existing “A closer look” surface. This module does not start microphones, collect sensors or produce AI answers.

## Ownership and intent

A person begins with a document, makes marks or thinks beside it, and returns with a result. Original bytes and source digest belong to `src/db.js` and ingestion. Studio drafts belong to the existing attachments store; editable source notes belong to `jett-notebooks` through transactional `notebooks/storage.js`. Keep these distinct: a notebook note is not automatically a PDF annotation. Worktrees and GitHub carry code; the JT document vault is not a development repository.

Read `AGENTS.md`, `CLAUDE.md`, `docs/superpowers/plans/2026-09-13-editor-experience-contract.md` and `docs/superpowers/plans/2026-09-13-pdf-capability-contract.md` before changing the interaction or capability claims. `docs/quality/PRODUCT_AUDIT.md` includes historical evidence; inspect date and artifact before reusing a claim.

## Inventory semantics

- Working surface: accessible through Studio at this inventory baseline. This is not a native parity assertion.
- Engine / original reader: implementation exists, but Studio exposure is absent or independently in flight.
- Design preview: explicitly illustrative content or interactions.
- Intended: a future journey or implementation gap, not a working service.

The searchable inventory in `studio/product-guide.js` is the maintained entry list. Update statuses only after real journey proof. It links documents, onboarding, journeys, design system, widgets and references. Source pointers remain readable paths rather than production URLs that expose repository source.

## Accessible action architecture

Studio `dispatchDocumentCommand()` provides named document actions. The original reader registry and command journal provide separate existing semantics; do not claim they are already one universal intent engine. Adapters should agree on action, exact target/source, cancellation, undo and saved result. Page text is the structured alternative to canvas reading. Keyboard controls and direct pointer placement should converge on the same source coordinates.

Verify actual keyboard focus, touch scrolling, zoom/text scaling, reduced motion and screen-reader reading order. DOM labels alone do not prove VoiceOver/TalkBack success. No gesture should be the only route. Denied microphone/location/sensor access must preserve a useful alternative. Location metadata stays private by default.

## Voice and mathematics

Existing `src/voice-capture.js#createVoiceCapture` owns capture lifecycle; `src/math.js#translateSpokenMath` wraps the vendored rule translator and returns speech, LaTeX and unparsed terms. `makeSpokenMathDocument` and `src/registry/verbs/math-keep.js` support durable local mathematics. This is not a general AI correction model.

The advanced intended journey is explicit capture → words and mathematics preview → correction of uncertainty → chosen destination → reversible insertion. Preserve typed input and source words. The guide intentionally does not execute a fabricated version of this pipeline.

## Platform material references

Apple [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) and [Materials](https://developer.apple.com/design/human-interface-guidelines/materials) describe native material and system accessibility adaptation. Android [Compose semantics](https://developer.android.com/develop/ui/compose/accessibility/semantics) describes semantic roles/actions/state for accessibility services. CSS translucency is not native Liquid Glass; a browser capsule is not ActivityKit. These primary references were inspected for guidance, not device-integration proof.

## Review and evidence

Change one concrete journey, reuse the owning engine, preserve an interrupted draft, and verify the produced artifact. For PDF work, independently inspect output geometry/content and unchanged originals. For notebooks, test stale writers, conflicts, reload and backup linkage. Run focused checks plus required repository gates. Report browser, emulator, physical device, commit/push and deployment separately.

Open items include unified history/redo, existing PDF image editing, broader OCR exposure, live provider/AI integrations, native input adapters and portable source-plus-notebook backup. Root integration may advance the inventory; reconcile this guide with its latest receipt before release.
