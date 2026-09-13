# Jetty atelier experience implementation plan

Goal: replace the catalogue-first impression with a connected, expressive onboarding-to-work prototype, including contextual assistance and a tender service.

Architecture: `studio/experience.js` owns the new route family and interaction state, `studio/experience.css` its scoped visual system, and `studio/experience-art.js` original architectural SVG artwork. Existing Studio catalogue/widgets and all document engines remain available. No provider, portal, signature or AI service is invoked.

Creative authority: founder delegated aesthetic decisions and requested immediate implementation. Execute inline using executing-plans; no additional aesthetic approval gate.

## Design specification

- Celadon #e8efe5, vellum #fafbf6, engraving ink #253d50, blue #365ccd, silver #dce5e8, plum #785f77. Night mode uses blue-black surfaces with pale celadon text.
- Palatino/Book Antiqua display type evokes drawn architectural plates; Avenir Next/system sans handles controls. Avoid vague slogans, repeated diminutives and promotional prose.
- Layout: desktop work rail / broad document area / contextual margin. Phone: compact header / single meaningful work surface / contextual bottom actions. The art is a river pavilion engraving shared by onboarding and the actual sample brief.
- Reference craft: Notion iOS screen d120561c-525c-42e5-a177-c5bfa948a721 for compact navigation and thumb-level question entry; Atlys public Japan service page for a named outcome, visible document requirements and legible handoffs. No private application was entered and no third-party artwork copied.
- Illustrative tender requirements do not establish family bottlenecks or any real tender's rules. Every tender screen carries sample status. Review and signature simulation must be explicit before actions.

## Build order

- [x] Onboarding: welcome, intended first task, name, sample intake, opening the first document. Back/restart remain available; no sign-in requirement for the design preview.
- [x] Desk: continue document, concrete recent work, service status, new-document chooser, search and theme.
- [x] Work: document on a canvas with adjacent notes, ink tool, zoom, page switch, selection-to-Jetty; phone tabs preserve the same context.
- [x] Jetty: source-specific suggested questions, scripted cited answer, source jump, keep answer as a note, editable note and reviewable share sheet.
- [x] Service: tender overview, five-document packet, missing-document resolution, sample collaborator, cost-sheet review, signature preview and explicit simulated outcome. Visa/company services get scoped introductory sheets rather than dead controls.
- [ ] Review every main rendered mobile screen, dark mode, continuity and keyboard/focus. Run full repository suite and production build. Record before/after limits, commit/push exact source and leave local preview.

Acceptance: start at welcome and reach a marked-up document with a saved cited note; return to desk and reopen it. Start tender preparation, resolve sample missing evidence, inspect review and signature, reach the clearly simulated outcome. No unlabelled external action or generic next-step catalogue is needed for either path.


## Real document scope added during execution

The designer prototype now links to a real local PDF workspace (`#files`). It reuses the existing MuPDF engine, document database, and attachment handoff. Import a PDF, add printable ink or text annotations, save a separate reviewed PDF, reopen it and export it. The source byte array remains unchanged. Draft marks live separately and are not mistaken for saved PDF bytes. Sharing and the advanced editor require a reviewed copy when marks are present.

Editor page, zoom and unfinished form input survive profile/search/theme changes. Failed draft writes retain an in-memory draft with an explicit retry; closing the page before retry is not durable recovery. Structured text is matched to the physical page, with an explicit empty/scanned-page state. Manual place labels are local metadata; no location sensor is queried.

The existing paragraph/form editor remains accessible through a guarded Studio handoff. Ink and added text are annotations, not underlying paragraph replacement or certificate signatures. Protected sources fail closed. The scripted Jetty answers and fictional tender/signature/submission flow remain clearly labelled design previews.

## Verification record

- Full pre-existing repository suite: 496 tests passed, 0 failed; 1,622 seconds. Its test-file list was captured before the new Studio tests and freehand exporter tests were added. The Studio handoff tests were included; additions are checked separately.
- Exporter: eight tests pass, including independent PDF.js readback, geometry, retained source text, restrictions and original-byte custody.
- Production build passes; existing large-chunk warnings remain.
- Desktop and 390px mobile screens reviewed in the browser, including dark canvas, real PDF, tender review and the explicitly simulated outcome.
- Focused Studio onboarding/tender UI and real PDF UI tests pass. The latter covers original-byte custody, saved annotation readback, theme/profile continuity, quota-failure retry, sharing gate and blank-page text. Android artifact provenance is recorded separately after native packaging.

References inspected: [Notion iOS on Mobbin](https://mobbin.com/screens/d120561c-525c-42e5-a177-c5bfa948a721), [Atlys Japan service](https://www.atlys.com/en-IN/visa/japan-visa). Public service layout informed handoffs; no private application or third-party artwork was copied.
