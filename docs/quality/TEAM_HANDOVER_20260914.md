# Team app candidate — 14 September 2026

Status: TESTING CANDIDATE. This is not a production or native-device acceptance receipt.

This candidate combines pushed Kothali b75dc5284367fde084b5d618a21664180b9fd8a3 and Studio eb842324ff1ca03ef1043e27aef9f2267a974ece. The merge retains the tender room/service source and the latest native-neutral export, saved work, visible PDF mark export and compact reader controls. Source-note, Studio handoff and playground style/data increments were already present by patch equivalence.

## Entry points

- `/studio/index.html`: local document Studio, library, scanner and source notes; browser-local data.
- `/notebooks/index.html`: editable notebooks; original source and derivative exports remain separate.
- `/workspace/index.html#Tenders`: local tender preparation. No portal submission/signing/payment claim.
- `/workspace/index.html`: communication workspace; live external delivery is not certified.
- `/playground/index.html`: product/design inventory; intended and preview journeys are not live services.
- `/index.html`: existing reader engine. This candidate must not replace an existing production reader release without reconciling main below.

## Main integration boundary

Main 4ff0a1ea1de80d27a2144c6124927bebaded1fbc has separate September 10–11 work not included here: authenticated relay resume/revocation, durable sync outbox/log, encrypted backup/restore, system-state recovery and exact pilot artifact CI. The latest Studio/Kothali line has large overlapping source changes. Blindly merging or replacing main could discard data/security behavior. Review and test that integration separately before production promotion. This draft candidate intentionally retains both existing development owners' source and makes no claim that it supersedes main.

The previously dirty slack-learning source has been copied, reviewed for private/secret patterns and committed separately as wip/slack-learning-preserved-20260914 at 902a263. It remains incomplete and is not merged here. The original checkout is unchanged.

## Verification

Fresh clean dependency installation and production build passed. Final build used Node 24.20.0. Unit gate passed 102/102; focused Studio/notebook/tender gate passed 23/23 with zero failures/skips, including mobile reader controls, scan source custody/recovery, source-note handoff, visible export, saved work and tender exact-byte export. Phone reader screenshot was visually inspected with the testing notice visible and no covered controls. Tests used --test-force-exit because the earlier Node 26 run stalled in Chrome teardown; that interrupted full run is not a green gate. A fresh full suite on Node 24 remains running at commit time; task work/frontend-full-final.log holds its result. Build output credential-pattern scan found no matches; the only bundled PDF is tracked public/examples/orchard-walk.pdf, with no official tender upload/media included. Native devices, production route, live backend/provider and portal work remain separate gates. No deployment or DNS changes were made by this candidate task.

Deployment restriction: use a dedicated preview origin. A path prefix on the production origin does not isolate IndexedDB/localStorage, and cross-app navigation currently assumes root paths. Do not mount this candidate at /preview on app.jjty.in or overwrite the live root reader.

## Final focused correction

All nine playground/PWA/compact-reader tests pass after keeping original page titles, placing the legacy reader testing label inside its existing brand width, and centering the playground source button before clicking below the sticky header. The playground failure reproduced locally and in CI; centering the real button allows the source-inspection/download/mobile/offline journey to finish. Five production entry smoke checks pass with visible testing labels.

The full suite was stopped after red results were established to keep this consolidation bounded. Its log is preserved, not reported green. It ran while the preview labels were being corrected and is not an exact final-candidate full gate. Follow-up reader recovery/shell tests continue separately. Initial CI sandbox failure was addressed by pinning Ubuntu22; the next CI reached the source-inspector test, whose click positioning is now corrected. Current remote verdict must be read from PR4.
