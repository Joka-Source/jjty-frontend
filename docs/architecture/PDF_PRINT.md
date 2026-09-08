# Open an exact PDF for printing

Use **Review original** for a preserved PDF, or review a filled, annotated or
combined copy. Once all pages have rendered, **Open for printing** opens that
same immutable PDF in a new browser tab. Choose the PDF viewer's Print control
to select a printer, page range, scale and other settings. Browsers configured
to download PDFs may download the copy instead; open it in a PDF reader.

The handoff uses an `application/pdf` Blob made from the reviewed byte snapshot.
It does not print JETT's HTML or convert its page canvases into a new PDF.
Closing the review or reviewing another document does not replace the bytes in
an already opened viewer. The original stored document, form draft and local
records remain unchanged.

Both download and print handoff stay disabled during rendering and after a
render failure. A blocked tab leaves the reviewed copy available for download
and another attempt. Object URLs remain available while their viewer is open
and are revoked after the viewer closes. Navigating away from the JETT page
ends its ownership of these temporary URLs; save a copy for independent custody.

This is a browser PDF handoff, not confirmation that a printer produced output.
The viewer controls physical sizing, printer margins and annotation printing.
In particular, a PDF note's contents remain in the PDF, but the expanded note
text in JETT's review is not an added printable page. The viewer may print only
its icon unless annotation/comment printing is selected or supported.

Browser behavior references: [Chrome printing](https://support.google.com/chrome/answer/1069693?hl=en-gb),
[Chrome PDF download settings](https://support.google.com/chrome/answer/95759?hl=en-Gb),
and [object URL lifetime](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/blob).

`test/pdf-print.test.mjs` uses a private, headed Chrome instance to observe the
native PDF viewer, compare the handed-off bytes, exercise blocked-tab recovery,
and check URL lifetime across review replacement and viewer close. It also
covers the actual application's original-PDF entry point, phone action layout,
and disabled printing after a render failure. It never invokes native printing.
Set `JETT_PRINT_PROOF_DIR` to retain the PDF and viewer/phone screenshots.
