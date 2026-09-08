# Correct orientation in a PDF copy

Open **Review original**, or review a filled, annotated or combined copy.
Each page offers **Rotate left** and **Rotate right**. JETT prepares and verifies
the changed PDF, then renders it again. Download and print handoff use that exact
rotated copy. The library original, saved form draft and local records stay intact.
Rotation belongs to this prepared copy; closing the review discards those changes
unless you downloaded it. Four quarter-turns restore the starting orientation.

While a rotation is being prepared, further page changes, download and print are
disabled. A failure retains the previous reviewed copy and its working controls.
Closing the review or switching documents invalidates pending work. The rotated
filename ends in `-rotated.pdf`; repeated turns do not accumulate suffixes.

## Native preservation

`rotatePdfPages(bytes, [{pageIndex, quarterTurns}])` owns its input bytes and
changes only the leaf page's `/Rotate`. It resolves inherited orientation first,
requires integer quarter-turns and valid existing angles, and checks assembly
permission. Encrypted, signed, protected and unsupported dynamic-form inputs
retain the existing conservative refusal boundaries. JavaScript is disabled.

After saving, it reopens the PDF and verifies every page's expected rotation.
It fingerprints the dereferenced document catalog and information graph,
excluding only leaf-page rotation. Stream contents are compared by decoded-byte
SHA256, so lossless compression changes do not falsely fail. This checks content,
resources, raw widget/annotation coordinates, appearances, form values and other
catalog data without depending on indirect object numbering. Complexity limits
fail explicitly rather than skipping verification.

Displayed annotation/widget bounds legitimately change with rotation, so they
are not compared as invariant coordinates. The original PDF's stored geometry
must remain unchanged. This operation neither rasterizes nor flattens forms.
It does not implement reordering, extraction, merging, cropping or other page
operations, nor certify every PDF corpus or external viewer.

## Recovery and verification

If the changed PDF passes structural checks but its preview fails to render,
JETT restores the previously rendered pages, filename and exact byte snapshot.
The previous download and print handoff remain usable. It does not restore stale
pages after the user closes the review or prepares a newer one.

The core tests cover inherited negative angles, normalization, invalid requests,
protected files, form/annotation preservation and deliberately damaged saves.
The browser journey downloads a rotated combined copy, independently reads its
fields and marks, checks four-turn normalization and cancellation, and verifies
that the stored original bytes remain unchanged. Fault-injection browser tests
exercise render failure, closing and replacement with real MuPDF processing.
Retained output is also inspected with pypdf and rendered independently using
Poppler. These are local fixtures, not physical printing or full PDF parity.
