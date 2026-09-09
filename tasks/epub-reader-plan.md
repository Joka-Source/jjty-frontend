# EPUB reading with Apple Books as the quality floor

## Authority and current evidence

The founder requires Apple Books as the EPUB reference and at least its reading quality; this is part of the active company goal, not a replacement for full PDF Expert parity. Apple's iPadOS 26 reference documents page navigation, a return to the previous reading location, search, contents, font sizing and selectable page-turn/scrolling modes. [Primary reference, checked 9 September](https://support.apple.com/guide/ipad/read-books-ipadc8494b6b/26/ipados/26). The reference is not evidence that JETT implements these behaviors.

Read-only code exploration finds no EPUB handler or reader in the current web application. `src/ingest.js`, `src/db.js` and `src/library-backup.js` already retain original source bytes and provenance. The connector source enum/schema must add EPUB. Its `htmlToBlocks` is a text extractor, not a safe renderer for publisher HTML. Installed MuPDF opened and laid out a generated EPUB probe, but emitted a version warning; this does not prove EPUB3, publisher styling, accessibility or Apple Books-quality rendering. Android's generic MuPDF document service is reusable, while its import MIME gate excludes EPUB.

## Plan before implementation

1. Establish EPUB2/3 fixtures with chapter order, nested contents, internal links/footnotes, emphasis, images, Unicode and publisher CSS. Include malformed paths, missing spine items, resource limits, scripts/remote references and fixed-layout metadata. Compare actual rendering and reading order; do not choose a plain-text or image-only reader simply because an engine is installed.
2. Preserve the exact ZIP source, digest and original download. Validate container/OPF/manifest/spine and bounded archive expansion before Library publication. Store only validated, versioned EPUB metadata; retain original resource identity and keep external content from silently loading or executing.
3. Render reflowable semantic chapter content with local resources and a deliberate typography contract. Reuse a reviewed sanitizer rather than treating text extraction as sanitization. Compare the browser and available engine against the fixture corpus before choosing the renderer; retain author emphasis, headings, illustrations and navigation.
4. Add the own Reader's contents, search, remembered passage, typography and reading-mode controls. Locations and annotation anchors must use stable source/chapter/text identity, not screen page numbers that change with font size or viewport. Preserve existing tab, Library and backup behavior.
5. Complete import → read → navigate → change typography → annotate/bookmark → reload → backup/restore with source bytes and exact passage intact. Test pointer/keyboard/accessibility and phone/tablet/desktop renders. Record current Apple Books gaps explicitly, including fixed layout, complex typography, footnotes, motion, offline assets and native/cross-device continuity; advance them rather than declaring a small preview to be parity.

Keep PDF editing/font/layout/Fill & Sign, actual native voice, authenticated sync and the three-platform release gates active. No push or deployment follows from this plan.
