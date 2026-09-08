# One PDF with answers and local marks

In **Fill this form**, select **Include saved local highlights and notes** to
review or download one copy containing both. The option starts unchecked and
resets when the document changes. Server work remains separate. If all local
marks have been undone, the option still produces a filled copy and reports
that there were no surviving marks to include.

The form panel disables export and the inclusion control while answers are
pending, failed or being exported. Reopening an older document object still
uses the latest successfully saved draft retained by the panel. It reads
committed local records at preparation time and owns snapshots of the source,
answers and marks. Document changes and newer review reservations invalidate
older asynchronous preparations.

## Composition and verification

`exportCombinedPdf({source, savedFormDraft, committedRecords, allowFormOnly})`
returns `{bytes, manifest}`. It verifies the preserved original's SHA256 and
the draft's source digest, then applies annotations to the original first.
It never assigns an original digest to modified PDF bytes to bypass anchors.

Before filling, it verifies that field keys, types, editable properties, options, grouping,
geometry and original values still have the same meaning after annotation
serialization. Indirect object numbers may change; canonical group membership
is compared using stable field keys. It applies only changed editable answers.

The final PDF is reopened to check all expected field values and the annotation
manifest: page, identity, subtype, contents, bounds, quads, flags, color and opacity.
The original annotation multiset must survive as well as newly added local marks.
The returned manifest includes source/output digests and truthful field/mark counts.
Review renders and downloads that same immutable final byte snapshot.

Note placement avoids text, existing annotations and form widgets, including empty
fields. A mark overlapping a changed field causes an explicit refusal until the
person resolves it. Unsupported forms, protected signatures, stale drafts,
conflicting shared values, schema changes or lost annotations are not silently
accepted. Originals, saved drafts, receipts and server work are not changed.

## Interoperability

Independent browser readback found that MuPDF's scalar choice setter could update
`/V` while retaining an obsolete `/I`. PDF.js then read the old option even though
the rendered appearance and canonical value looked correct. The form exporter now
synchronizes the widget/canonical field selection index with its export option,
including choices whose displayed label differs from the stored value. Both
PDF.js and the independent pypdf inspector check this consistency.

Tests cover saved answers and marks after reload; explicit unchecked/checked
exports; reviewed and direct downloads; undo; unchanged originals; stale draft
digests; schema drift; lost annotations during filling; widget collisions;
latest saved answers after reopening a stale object; and asynchronous document
and review ownership. The retained synthetic UI download is independently checked
and rendered. This is local browser/PDF evidence, not a claim of every PDF editor,
physical device, printing or signature interoperability.
