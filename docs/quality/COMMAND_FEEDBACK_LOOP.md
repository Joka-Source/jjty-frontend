# Command feedback loop

The founder SSOT in `jjty-human/JETT_SSOT.md` remains product authority.
This document describes the local implementation and repeatable debugging loop.

## Use it

Open Settings → Command history. Final voice utterances and registered pointer
commands receive correlation IDs. Rows show intent, target decisions and outcomes.
Mark a row Worked or Missed and choose the intended command when the parser got it
wrong. A saved receipt measures persistence, not whether the person meant that
passage; human feedback is a separate fact.

Recognized words are not retained in this journal by default. Enable the local
words checkbox for a deliberate reproduction, then turn it off to remove those
words from the journal. Consent resets on reload. Existing durable document action
records have their own evidence and are unaffected. The legacy developer Glass
trace also remains separate; this feature does not erase it or claim that no other
local store contains text.

Export analytics events downloads metadata-only JSON. No SDK or network sender
is installed. This array follows the event shape of the PostHog batch API:
https://posthog.com/docs/api/capture . It is not a complete ingestion request:
the authorized project, host, token, identity policy and ingestion verification
are still needed. No hosted PostHog dashboard or end-to-end analytics is claimed.
Raw transcripts, corrections, document content, titles and account identifiers
are excluded from this export. Local trace IDs join stages within the export.

## Evidence semantics

- `capture`: session state, processing route and an allowlisted failure reason.
  Starting/listening/reconnecting remain one trace; terminal states end ownership.
  A failed start has no fabricated heard event.
- `heard`: a final transcript or a pointer command entered the pipeline.
- `intent`: parsed command or reading, separate from target certainty.
- `target`: matched, ambiguous or missing, with numeric range metadata when known.
- `result`: saved only after the act engine returns a durable entry with a receipt;
  failed writes never count as saved. Handled operations without such a receipt
  retain unknown durable outcome. A no-op has no demonstrated effect.
- Human `worked`/`missed`: usefulness feedback, never inferred from test success.

Stages for one utterance share an ID. A target ambiguity choice retains the original command ID through confirmation.
Generic grammar-choice and document-return prompts still need broader parent
attribution; do not infer complete lineage for every application control.
Final voice commands link to the retained capture session through `capture_id`.
The bounded journal can evict old sessions; it is not an unbounded audit ledger.
Capture state records distinguish no-results failures, reconnects, denied access
and unavailable local engines. `audioHeld` means the app owns a live input stream;
false does not establish whether the browser service owns a microphone.
Interim audio frames, audio signal quality, non-registry controls and every OS
command are not covered by this journal.
The existing capture diagnostics and controlled voice benchmark cover different
layers. Do not label this the history of every possible application event.

The default journal retains 200 commands (maximum configurable 500), up to 16
stages each. Storage errors leave current changes in memory with a visible warning; older
persisted history may remain if the browser refuses the update. They must not
break document work. The journal is diagnostic evidence; IndexedDB
remains the durable action authority.

## Improvement loop

1. Reproduce with a synthetic document and record expected words/action.
2. Inspect recognition, grammar, targeting and durable outcome separately.
3. Add a regression that fails before the change; include a no-mutation case.
4. Fix the responsible layer and run its focused tests.
5. Run the build/full suite and inspect the rendered journey.
6. Record revision, fixture, result and limitations in PRODUCT_AUDIT and the SSOT.

Current screenshot regression: both “Highlight a lead charge” and “Highlight a
late charge” previously became bare-highlight ambiguity plus reading. The new
adapter recognizes an explicit phrase. Exact unique “a late charge” is selected;
missing “a lead charge” does not mutate the previous passage; repeated occurrences
require choice. No fuzzy ASR repair is claimed. This is controlled-transcript
behavior, not a microphone accuracy measurement.

Focused gate:

```sh
node --test --test-concurrency=1 test/command-journal.test.mjs test/command-journal.e2e.test.mjs test/intents.test.mjs test/targeting.test.mjs
```

Full gate: `npm test`. The journal has no impact on the original-document custody
contract. GStack investigation and the local workbench are execution tools;
installed skill presence is never treated as passing product verification.

## GStack investigation receipt

Symptom: an explicit highlight phrase did not select the intended words.
Root cause: the grammar recognized bare highlight ambiguity and treated its
phrase argument as reading. Capture substitution is a separate upstream issue.
Fix: full-utterance phrase intent plus exact target resolution; no stale-cursor
fallback for missing named words. Parser and target tests failed before the fix
and pass after it; the real browser confirms exact saved anchor and no mutation
for the incorrect phrase. General recognition quality remains open.

The workbench heartbeat was paused on the founder’s request, separately from the
application microphone. GStack investigate preamble activated successfully;
proactive workflow use is enabled, telemetry and artifact synchronization remain
off. Three delegated lanes produced independently owned parser/targeting,
journal-core and return-motion changes, with lead integration and final gates.
