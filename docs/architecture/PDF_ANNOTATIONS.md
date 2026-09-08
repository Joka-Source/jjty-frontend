# Portable local PDF marks

The reader's **Keep marks in a PDF** panel produces a derived PDF with saved
local highlights, importance marks and notes. Review renders the exact export
bytes; its download preserves standard PDF annotations rather than flattening
page screenshots. The imported original remains byte-for-byte unchanged.

`exportAnnotatedPdf(document, records)` reads committed records for that document.
It excludes undone marks, undo events and unrelated acts. Highlights become
yellow `Highlight` annotations; importance marks become orange highlights with
an importance label. Notes become `Text` annotations with their saved contents.
Each annotation has a stable `NM` value derived from its local record ID.

## Exact placement

The exporter hashes the preserved source bytes and requires agreement with both
document provenance and each mark's anchor. It maps the anchor's block through
its `page:N` locator: a blank or unreadable page must not shift the destination.
The saved word span and quotation must still agree. Native MuPDF structured text
must have the same complete sequence of raw tokens as the stored page text.
Whitespace differences are permitted, but normalization alone is insufficient.

Character quads come from the PDF text itself and are passed to MuPDF's annotation
API in its native page coordinates. This preserves multiline spans and rotated
pages without guessing from the reader's DOM bounding rectangle. Repeated phrases
are distinguished by their token indexes. Serialization is followed by a fresh
readback of annotation identity, page, type, contents and every highlight quad.
Compatible adjacent characters are joined into smooth line bands; different
orientations, heights or large gaps remain separate. Note icons use a clear page
margin instead of covering the selected words. A page without a usable margin
refuses note export rather than covering its text.
Existing annotations and previously placed notes also reserve their space, so
multiple notes on one passage remain individually visible.

## Failure and review ownership

One unsupported surviving highlight or note fails the whole export. Stale,
legacy or approximate anchors, ranges without exact endpoints, changed text,
missing geometry, duplicate identities, encryption and signature protection are
not silently ignored. The original PDF's annotation permission is respected.
No mark remains exportable after its undo. Existing annotations in the original
are preserved; a collision with a local record's annotation identity is rejected.

The form and annotation panels share one review owner. Starting a new preparation
invalidates earlier pending preparation; closing or changing documents cancels
pending render work and clears the snapshot. Download is available only after
every review page has rendered. Failures leave the source and local history intact.
Close and download controls stay visible while the pages scroll, including on
a phone-sized viewport. Queued close events from an older review do not invalidate
its replacement preparation.

## Current boundary

This exports local annotations only. Filled form drafts and server-authoritative
work remain separate, explicit export scopes. It does not create digital
signatures, flatten notes, export local math/quotes as annotations, or establish
PDF Expert/Acrobat parity. Complex scripts, unusual text extraction, large files
and richer accessible review remain separate acceptance work. MuPDF's existing
licensing and deployment requirements remain applicable.
The review includes keyboard-accessible, expandable notes beneath each page.
Their contents come from the exact PDF snapshot's `Text` and `FreeText`
annotations, rather than local history. Text is inserted literally, retaining
line breaks and wrapping long strings; PDF contents never become HTML. Closing,
Escape and replacement reviews remove both page images and note text. Clicking
the icon inside the canvas is not yet an interactive popup.

Tests cover repeated text after a blank page, multiline and rotated targets,
standard annotation readback, original preservation, stale targets, undo, and
the browser journey from saved acts through reload, review and download.
Independent pypdf structure checks and Poppler renders supplement engine checks.
The engine returns independent plain annotation snapshots and releases native
annotation wrappers. Repeated reads cannot expose freed native objects or edits
made by a previous caller. PDF JavaScript is disabled before exposing pages.
