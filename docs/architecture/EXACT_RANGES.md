# Exact spoken ranges

Say “highlight from Start at the orchard gate to Finish beside the river” to
keep everything from the first endpoint's first word through the last endpoint's
last word. Both phrases must occur completely in the document. Repeated phrases
produce a choice with surrounding context and a page or passage label. The saved
record retains the alternatives offered and the selected endpoints. Reversed or
missing endpoints produce no mark. Starting another document clears pending choices.

Endpoint search compares complete normalized token sequences. It no longer
shortens a phrase or uses a partial fuzzy match to invent an endpoint. Grammar
ambiguity and repeated endpoint ambiguity remain separate decisions. A grammar
choice with a nonexistent complete phrase still cannot create an act; the person
can give a new command using the words shown in the document.

## Durable representation

Cross-block application entries add `rangeAnchor: {version: 1, start, end}`.
Each endpoint uses the existing anchor shape: block and token indexes, exact
quote, prefix, suffix and source digest. Closed cursor and receipt contracts are
unchanged. The history description names both endpoint quotes. Same-block ranges
normalize to an ordinary combined anchor, retaining the same exact word boundary.

`deriveRangeSegments` validates both endpoint identities and ordering, then derives
the first clipped block, complete intermediate text blocks and last clipped block.
The act engine saves one entry before painting any segment. Replay derives the
segments again; invalid source-bound evidence becomes lost and is not painted.
Normalizing a same-block range cannot bypass the source check. Ordinary
single-passage marks may still refind text after an explicit document revision;
that path reports refound, rather than exact, when the source changed. Exact ranges
remain locked to their source. One atomic undo removes the whole range and
persists across reload.

Legacy ranges without exact endpoints remain visibly approximate and cannot be
exported as exact annotations. Text search can find a phrase only within one
ingested block; endpoints spanning separate paragraphs are not automatically
stitched together. Existing moment sharing still carries passage context and is
not a new cropped-range synchronization format.

## PDF export

The exporter verifies the preserved source bytes and exact range anchors, then
maps segments through physical page locators. Each segment gets a stable standard
PDF annotation name, `jett:<record-id>:range:<block-index>`; same-block exports keep
the ordinary annotation name. Native raw text and quads determine placement, and
every serialized segment is reopened and verified. A single missing segment fails
the export. Undo excludes every segment together.

Skipped physical pages are inspected in the actual PDF. Pages with no text, no
annotations and absent or whitespace-only decoded content may be skipped as blank.
Pages containing unrepresented text, images, vector instructions or malformed
content are not silently dropped. This conservative blank-page check does not
claim to recognize every visually blank PDF drawing program.

The independent browser proof uses a real three-page PDF and the actual local
command path, record storage, review and download. Poppler inspection shows no
highlight before the first endpoint or after the last; the entire middle text is
marked. This is controlled command input, not physical microphone/ASR evidence.
