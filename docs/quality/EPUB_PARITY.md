# Apple Books EPUB baseline — inventory v1, 9 September 2026

Apple Books is the founder's minimum EPUB experience, alongside PDF Expert for PDF. This inventory separates implementation evidence from parity. Owner: JETT reader lane (Codex). Reference: Apple's iPadOS26 reading guide, linked in `tasks/epub-reader-plan.md`; physical-device reference walkthrough remains required.

| Requirement | Acceptance | Current evidence / remaining work |
| --- | --- | --- |
| Original custody | Import, original download and recovery retain identical ZIP bytes | EPUB2/3 ingest and backup tests; browser separate-library restoration. 32MB input cap, 64MB expansion cap |
| Reflow and publisher intent | Headings, emphasis, lists, images, fonts and safe publisher CSS survive reading | Scoped semantic DOM and no-external-request browser tests. Broader publisher corpus, obfuscated fonts, SVG/MathML and media support incomplete |
| Contents and links | Nested contents and internal footnote links reach exact source passage, with Return | Own sticky controls and generated nested contents; advanced footnote popovers/history incomplete |
| Search | Find every occurrence and navigate without losing departure | Matching-passage search exists; within-passage occurrence navigation/highlight and search across unsupported content incomplete |
| Typography | Actual publisher-sized text changes size without changing passage identity | Fixed-point paragraphs and deep-scroll regression; advanced spacing, theme, accessibility and font controls incomplete |
| Annotations | Touch/keyboard selection, highlights/notes/undo and recovery preserve exact source anchor | Shared source-bound EPUB selection and saved annotation restore; Pencil/native journeys incomplete |
| Reading continuity | Scroll/font/resize/reload and backup restore retain the exact passage | Browser local journey; exact intra-paragraph offsets, pagination and cross-device sync incomplete |
| Page/scroll modes | Page advance/back, selectable transitions and continuous scrolling | Continuous reflow only; page turns/pagination/reduced-motion comparison incomplete |
| Fixed layout | Image-heavy EPUBs preserve declared viewport and spread | Explicitly refused currently; implement rather than reinterpret as reflow |
| Native quality | Apple Books reference walkthrough plus iOS/iPadOS/Android tests and real journeys | Not yet evidenced; web tests do not establish native parity |

No Apple Books or full PDF Expert parity is claimed. Source code, generated fixtures, browser checks, physical devices and production are distinct evidence levels.
