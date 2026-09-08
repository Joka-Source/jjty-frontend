# Apple Books EPUB baseline — inventory draft 0.1

Founder authority: `../human/JETT_SSOT.md`, section 19, 9 September 2026. Apple Books sets the minimum EPUB reading experience; JETT aims to surpass it. PDF Expert remains the PDF reference.

Evidence level: official documentation reviewed 9 September 2026, iPadOS 26 guide. No physical-device walkthrough or JETT parity is claimed. Installed Books build, OS build, device, locale and fixture checksums must accompany the observed inventory. These grouped rows are a starting checklist, not a complete inventory.

| ID | Documented reference behavior | JETT acceptance to verify | Status / owner |
|---|---|---|---|
| EPUB-01 | Margin taps, swipes, both-margins advance; previous/current location navigation | Intentional navigation without losing the reading anchor | Pending / Reader |
| EPUB-02 | Contents, book search, page/location jumps | Results and chapter jumps return to the right passage | Pending / Reader |
| EPUB-03 | Font, size, bold, theme, brightness, scrolling and page-turn styles | Settings persist and reflow retains position | Pending / Reader |
| EPUB-04 | Line/character/word spacing, margins, columns, justification, reset | Extreme settings preserve legibility and content | Pending / Accessibility |
| EPUB-05 | Automatic position saving, bookmarks, menu side, Line Guide | Reopen at the same passage; usable controls with assistive input | Pending / Reader |

Reference: [Apple iPadOS 26 reading guide](https://support.apple.com/guide/ipad/read-books-ipadc8494b6b/26/ipados/26).

| ID | Documented annotation behavior | JETT acceptance to verify | Status / owner |
|---|---|---|---|
| EPUB-06 | Adjustable selection, highlight colors and underline | Selection remains anchored through reflow | Pending / Annotate |
| EPUB-07 | Add/remove notes; highlights list jumps to passage | Notes survive reopening and settings changes | Pending / Annotate |
| EPUB-08 | Share selected or multiple annotations; bulk deletion | Output is usable; affected items are clear | Pending / Annotate |
| EPUB-09 | Translate, search or copy selection | Exact selected text reaches the chosen action | Pending / Reader |

Reference: [Apple annotation guide](https://support.apple.com/en-ae/guide/ipad/ipade2f8027b/ipados).

Additional JETT acceptance areas, not claims about observed Apple behavior: EPUB import validation and original-byte recovery; fixed-layout and reflowable corpus; images, footnotes, links and complex tables; mixed Hindi/English and RTL; keyboard, screen reader and reduced-motion journeys; offline reopening; cross-device reading and annotation conflicts; crash recovery and export portability. Expand these after device observation instead of assuming documentation captures every interaction.

To exceed the baseline, evaluate durable user-owned work, voice targeting, mixed-language reading and continuity across web, iPad and Android against real journeys. Do not label any dimension better until comparative evidence exists.
