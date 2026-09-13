# Integrated source notes Implementation Plan

**Goal:** Connect actual Studio PDFs to durable editable notebooks and truthful runtime activity, while conceptualization continues independently.

**Architecture:** Reuse the existing document store for source PDFs and notebook model/store for note content. Source references contain document identity, digest and physical page; no second PDF copy or raster import. Studio owns its interface; the notebook app owns its full editing canvas. A narrow activity module reports actual operations without inventing AI, microphone or portal activity.

**Authority:** Founder explicitly delegated gap selection and continued implementation. No additional aesthetic approval is needed. The Ken task owns narrative and edits no app source.

## Build order

- [ ] Shared storage and source-note adapter: transactionally merge disjoint notebook changes; reject stale same-notebook changes; retain input on errors. Validate source references and revisions. Test simultaneous writers and backup round trips.
- [ ] Studio margin notes: add/edit saved notes on the physical PDF page, source return, full-notebook link, clear local-only/paper-export boundary. Preserve current editor input and PDF source bytes.
- [ ] Notebook routing: open a validated notebook ID directly; source page link resolves its actual PDF digest and refuses stale/missing sources while keeping notes available.
- [ ] Runtime activity: show real opening/saving/export/wait/error states in the upper capsule; bottom contextual controls point to real editor tools. Keyboard labels, focus and reduced motion remain first-class.
- [ ] Browser proof: PDF → note → notebook → source page → reopen; source bytes unchanged; concurrent windows and failed saves do not silently lose notes; activity reflects actual outcomes.
- [ ] Full repository gate, production browser review, independent review, commit/push. Package the exact frontend into Android and verify available emulator. Preserve previous verified APK and distinguish new artifact evidence.

No connected AI, provider delivery, sensor input, signing or production launch claim follows from this work. Notes are editable notebook content; PDF text/ink annotations remain separate reviewed-file operations.
