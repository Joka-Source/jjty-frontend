# JJTY Sage design edition

A designer prototype commissioned on 12 September 2026. Pastel sage, deep forest, paper, lavender, and butter form a shared light/dark visual system. The original app and playground remain available unchanged at their existing entries.

## Open

Run `npm run dev -- --port 8785 --strictPort`, then open `/studio/index.html`.
For the production build: `npm run build`, then `npm run preview -- --host 127.0.0.1 --port 8786 --strictPort`, and open `/studio/index.html`.

## Explore

- My space: resume reading, recent documents, quick thoughts, capture shortcuts.
- Inbox: sample conversations, attachment review, reply and undo presentation.
- Library: collections, document covers, search and content filters.
- Reader and notebooks: composed pages, annotations, margins, paper and ink controls.
- Voice and capture: waveform, transcript, scanner, and import presentation.
- Journey atlas: all 27 inherited journeys, 145 walkthrough steps, designed endings, empty/offline/error states, reference inspector.
- Design system: actual Studio palette and control styles, feedback, type, and theme previews.
- Inspiration: PostHog and the existing Mobbin selection, with source links and adaptation notes.

Use the moon/sun control for themes, or Command/Ctrl+K for search. The same Studio screen renderers are used in the workspace and its journey walkthroughs. A walkthrough step is not necessarily a separate unique screen; related steps retain their surrounding screen for continuity.

## Boundaries

All people and documents are fictional. Messages, account connections, sharing, capture, backups, deletion and exports are visual simulations. There is no actual sending, permission grant, microphone access, file upload, or backend persistence. Theme preference is stored locally; editable sample content is temporary. This is a design edition, not a native or store-ready release.

Build order: `docs/superpowers/plans/2026-09-12-sage-design-build-order.md`.
Visual specification: `docs/superpowers/specs/2026-09-12-sage-design.md`.
