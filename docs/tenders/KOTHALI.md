# Kothali tender workspace

Open `/workspace/index.html#Tenders` in the JJTY web application. This prepares the
Old Kothali, Muktainagar concrete road and gutter tender, `2026_PWR_1337988_1`.

## Available now

- Official public listing facts and recorded deadline, checked 13 September 2026.
- Bidder details, working notes, eligibility and corrigendum review checks.
- A five-stage preparation journey with one clear next action and separate
  business, eligibility, document, price/sign and government-submission states.
- Nine document groups, including separate original and completed BOQs.
- Local IndexedDB persistence, original-file downloads, SHA-256 receipts and history.
- Production service-worker caching keeps the tender room available after the
  network is disconnected; uploaded files and review state reopen from IndexedDB.
- Replacement uploads retain earlier originals and reset the relevant reviews.
- Web Locks serialize saves across tabs; document review rejects a stale file version.
- A preparation ZIP contains the exact current and replaced files plus a manifest
  with review status, bidder details and outstanding checks. It is not a portal-ready
  single-upload bundle, a submission receipt or an application backup importer.

Save bidder details before leaving the page. Checklist and upload actions also save
edited bidder fields. Export before clearing browser storage or moving devices.
Data is local to the browser and origin; there is no cross-device sync yet.

## Real tender intake remaining

Import the originals obtained from [MahaTenders](https://mahatenders.gov.in/nicgep/app):
`Tendernotice_1.pdf`, `12_1.pdf` and `BOQ_2288013.xls`. Public listing metadata is
seeded; no official tender file, bidder credential, registration, price, payment or
signature is fabricated. Review the actual NIT to confirm the complete document
list and eligibility. The original BOQ is preserved separately from the priced copy.

Portal authentication/CAPTCHA, pricing inside the official workbook, digital signing,
payment and final portal submission are not implemented by this workspace.

## Verification

`npm run build`

`node --test test/tender-model.test.mjs test/tender.e2e.test.mjs test/unified-workspace-model.test.mjs test/unified-workspace.e2e.test.mjs`

The browser test uses clearly synthetic PDF bytes. It checks reload recovery,
review reset, stale-tab rejection, cross-tab save preservation, exact exported bytes,
retained originals, a network-disabled reload, no page errors and a 390px layout. It does not prove official
PDF validity, real bidder eligibility, native-device behavior or portal submission.
