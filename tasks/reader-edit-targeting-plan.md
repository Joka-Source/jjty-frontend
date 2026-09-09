# Direct paragraph targeting in JETT Edit

## Intended next outcome

The first own Edit flow validates paragraph replacements, keeps recoverable drafts and creates independently checked Library copies. Its page/paragraph form is an interim interaction. The PDF Expert baseline requires selecting the actual page content and seeing that selection while editing.

## Plan before implementation

1. Reuse `inspectEditablePage` paragraph boxes, page transform and page bounds to place real accessible target buttons on the existing source page. Do not infer screen positions from extracted reading blocks or copy engine paragraph IDs into durable annotation anchors.
2. Keep page-number/paragraph selection as a keyboard-accessible equivalent. Choosing either target selects the same paragraph and editing draft. Identify locked/unsupported content truthfully without making text editing appear available on scans.
3. Present the editor beside the PDF on wide screens; on narrow screens use a compact editing surface that retains a visible target and reachable Review/Discard. Inspect actual desktop/tablet/phone renders. Avoid hiding the document behind a large form.
4. Make main own layout changes through the existing reader queue. Preserve physical page/offset and custom zoom, refit fit-width, avoid manufacturing Return points, and cancel stale overlays on source/route/zoom/page-canvas replacement. Do not lose a pending or failed draft.
5. Verify crop/rotation/UserUnit transforms, pointer hit targets after scrolling and zoom, keyboard target equivalence, restored drafts, a changed source during held inspection, and actual edited output. Preserve current independent output, native links/marks/forms and backup gates.

Do not claim direct on-page editing until the actual pointer journey and rendered result are evidenced. General layout, arbitrary fonts/images, replace-all, OCR editing and complete PDF Expert parity remain open; Apple Books EPUB, native voice, sync and release goals remain active.
