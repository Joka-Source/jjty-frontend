# JETT functional audit

- Product: full JETT; this ledger covers the web work application.
- Branch: codex/jett-experience, base 10acc0e.
- Runtime: Node 22, Vite, browser IndexedDB; localhost:5174.
- Start: npm run dev -- --port 5174 --strictPort.
- Focused test: npm run build && node --test test/shell.e2e.test.mjs.
- Full local gate: npm test.
- Stop: terminate only the owned Vite process.
- Test data: synthetic text and bundled sample; no private uploads or microphone activation.
- Authority: IndexedDB documents/positions/records plus rendered UI.
- Evidence: local test logs and screenshots. No production proof implied.

| Journey | Result | Evidence / next action |
|---|---|---|
| First-run text intake | PASS_LOCAL | Independent paste composer; real click with installation hint present, save and reopen. test/shell.e2e.test.mjs. |
| Find saved work | PASS_LOCAL | Title/content search, empty result, reload and open; synthetic persisted content inspected. |
| Desktop and phone shell | PASS_LOCAL | Desktop/mobile shell gate, 390px rendered phone with no horizontal overflow; current JETT style. |
| Voice cursor and downstream actions | PASS_LOCAL | Controlled transcript journey covers in-paragraph movement, exact highlight/restart/undo and pointer precedence. Physical microphone and remote application remain unverified. |
| PDF import and output parity | PARTIAL_LOCAL | Native review; source-preserving filled, annotated and combined copies; exact multi-page ranges and independent output checks. See checkpoint entries and ../architecture/PDF_COMBINED.md. Full parity remains open. |
| Markdown structure/source | PASS_LOCAL | Heading, quote and fenced code render; CRLF/BOM reading normalization; downloaded source bytes exactly match after reload. |
| Images | PASS_LOCAL | PNG/JPEG/GIF/WebP intake, decoding, display, exact original download and reload verified; see image checkpoint below. |
| Accounts / self-hosted sync | PARTIAL_LOCAL | Explicit local-development PDF server upload, hash readback, retry/reconnect and undo verified. Production identity, accounts and broad durable sync remain open. |
| Optional macOS notch / TV / Watch | UNTESTED | Purpose-specific surfaces required; browser brand treatment is not native implementation. |

Continue to the highest-impact failing or unproven journey after every verified
increment. Use PASS_LOCAL only after suitable proof, and record exact revision.

## 8 September checkpoint

Full gate: 106 tests passed, zero failed/skipped, including production build.
Evidence: ../jett-experience-test.log in the sibling JJTY workspace (absolute:
/Users/sunlight/Documents/ChatGPT/JJTY/jett-experience-test.log).
After the reduced-motion arrival fix, build plus focused motion/shell gate:
9 passed. Evidence: /Users/sunlight/Documents/ChatGPT/JJTY/jett-final-focused.log.
Rendered phone check: width and scrollWidth both 390px, content opacity 1 with
reduced motion. Screenshots are in the JJTY workspace.

Defects resolved: install prompt intercepted paste; display:grid overrode hidden
state; Markdown parser mishandled CRLF code fences; reading discarded structure;
source download was missing; surface arrival ignored OS reduced-motion preference.
The short-viewport offline test now scrolls its target clear of the fixed bottom
navigation before clicking, preserving the existing mobile interaction.

Remaining immediate work: intake progress/error/retry and duplicate prevention;
image support; full Markdown semantics; voice downstream action audit; original
source availability for old/pasted documents; shared backend/sync integration.
Native notch, accounts, signatures, tender workspaces and production deployment
are not covered by this local checkpoint.

## Intake recovery increment

PASS_LOCAL: home intake disables overlapping submissions, keeps text when an
IndexedDB write fails, exposes retry guidance, and allows selecting the same
file again. A synthetic quota failure followed by retry creates one document.
PASS_LOCAL: if rendering fails after persistence commits, the UI reports saved
and returns to the library; reopening uses the existing document, without a
duplicate import. Build and six shell E2E tests pass; log:
/Users/sunlight/Documents/ChatGPT/JJTY/jett-intake-test.log.

Next: extend this recovery treatment to the reading-panel/drop intake paths;
images; original-preserving paste; full Markdown semantics; exact voice actions;
shared backend and sync. The previous full gate remains the earlier 106-test
checkpoint; this increment has a focused six-journey gate.

## Paste custody and reading intake

Implemented exact source-byte preservation for plain and rich paste. The
connector's content digest selects the actual retained clipboard flavor, including
fallback from empty HTML. Original HTML is downloadable but is never inserted
as executable markup in the reading view.

Reading-panel file and paste intake now catches failed writes, retains drafts,
restores enabled controls and permits retries. File drops process every supplied
file in order, stop on the first failure, and do not intercept ordinary text
dragging. Source MIME is stored with the original for accurate download.

Regression checks cover synthetic quota failure/retry with byte comparison,
multiple dropped files, normal text drag behavior, and visible-reader restart
before original download. Test clicks wait for stable controls; the Markdown
restart test now waits for the reader to be visible, rather than reloading while
its hidden DOM is still being prepared.

Evidence: /Users/sunlight/Documents/ChatGPT/JJTY/jett-source-custody-test.log.
Image storage, full Markdown semantics and cross-device source custody remain
unimplemented/unverified; these fixes do not establish remote sync.

## Image custody and responsive reading

PASS_LOCAL: PNG/JPEG/WebP/GIF ingestion detects signatures and requires browser
decoding before saving. Images use a documented local source extension with
empty text blocks. Fit and actual-size views use the original; switching
documents releases the image view. The original survives restart and downloads
byte-for-byte. Corrupt image intake creates no library entry.

Desktop (1280×900) and phone (390×844) screenshots were visually inspected.
The install hint follows the work surface. Reading headings clear the fixed
header, with an explicit browser geometry assertion; image content fits phone
width. The file-intake hint now includes supported images.

Evidence: jett-image-full-test.log has 112 passing tests. After the final header
spacing and hint correction, jett-image-final-test.log has a successful build
and all nine shell journeys passing. Screenshots: jett-image-desktop.png and
jett-image-phone.png, under the parent JJTY workspace.

This establishes local image custody, not OCR, annotations, production sync or
remote contract compatibility. Those remain pending, alongside voice downstream
actions and full Markdown semantics.

## Voice cursor and exact action recovery

Browser reproduction exposed a frozen cursor: the matcher updated its token
span within a paragraph but marker movement was conditional on changing the
paragraph. Movement now follows each matched span while scrolling remains
conditional on changing paragraphs.

A deliberate paragraph click now clears cached spoken targets and matcher
position. Recognized fresh commands are excluded from cursor matching so the
recognizer's cumulative earlier reading cannot steal that selection. Both the
live recognition callback and scripted replay provide the latest segment for
this distinction; interim preview creates no durable actions.

The browser regression follows two spans in one paragraph, highlights the exact
second phrase, reloads, undoes, reloads again, then selects a different paragraph
and issues a command with cumulative recognition history. The two pre-fix logs
record the frozen cursor and wrong-paragraph action. This exercises real DOM,
matcher, intent parser, action engine and IndexedDB with synthetic transcripts;
it is not physical microphone or remote-target proof.

Evidence under the JJTY workspace: jett-voice-cursor-before.log,
jett-voice-selection-before.log, jett-voice-cursor-test.log and
jett-voice-full-test.log.

Next trust-sensitive finding: the act engine paints before its IndexedDB write
completes, and undo mutates before persistence. Reproduce failed action writes
and ensure the displayed result remains consistent with durable history.

Final gate for this increment: build and all 113 tests passed in
jett-voice-full-test.log.

## Action-write failure and atomic undo

A browser fault injection reproduced a visible highlight after its record write
failed. Acts now paint only after the history transaction commits. Failed saves
show retry guidance while keeping the previously saved document state.

Undo now persists its target update and new undo record in one IndexedDB
transaction, both for the open reader and the all-document history path.
In-memory target mutation and visual reversal happen after commit. The database
helper aborts queued writes on synchronous exceptions as well as propagating
asynchronous transaction errors. Record-written telemetry fires after commit.

The real-browser journey covers a failed highlight, successful retry, failure
on undo's second write, reopening with the original highlight intact, explicit
transaction abort, another reopening, then successful undo and durable removal.
Evidence: jett-action-durability-before.log and jett-action-durability-test.log
in the parent JJTY workspace; broader gate: jett-action-durability-full-test.log.

Remaining: serialize rapid recognition commands and investigate document-switch
races during pending writes/rendering. These local changes do not establish
shared backend or cross-device transaction behavior.

PASS_LOCAL: full build and 114 tests pass. The final focused failure/abort
journey also passes independently against the same build.

## Recognition order and document isolation

A browser reproduction lost a rapid undo because it ran before the preceding
highlight finished persisting. Final recognition segments now execute in order.
Target evidence is captured on recognition arrival, so later reading does not
redirect a queued highlight. An instruction tied to a document is stopped with
retry guidance if the document changes before execution. The queue survives a
failed command.

Document opens serialize their complete render/history/position lifecycle.
A late act or undo completion checks the currently open document before applying
visual effects or adding to its in-memory history. Persisted source-document
work remains recoverable when that document is reopened.

PASS_LOCAL browser journeys: rapid highlight/undo; two rapidly spoken highlights
with different targets; concurrent document imports/opens; a deliberately held
record completion followed by switching documents; refusal of the queued old
document undo; reopening the source with its exact highlight. These use the
real matcher, intent pipeline, DOM and IndexedDB, with controlled transcript
and transaction-completion timing. Physical audio and remote execution remain
unverified. Evidence: jett-concurrency-before.log, jett-concurrency-test.log,
and jett-concurrency-full-test.log in the parent JJTY workspace.

Next: reproduce the shared backend baseline and connect local document actions
to its authoritative interaction contract; keep local save, delivery and remote
application evidence separate. Concurrent edits from separate browser tabs and
backend clients remain outside this local recognition queue's guarantees.

Full gate: 116 tests pass. After the final undo document-identity guard, the
build and four affected browser journeys pass in jett-concurrency-final-test.log.

## Shared server transport baseline

Implemented the existing HTTP upload/attach/context/interaction/projection/undo
contract in src/server.js. Retains exact retry envelopes; changed-request ID
reuse is rejected locally. HTTPS remote origins and explicit caller credentials
are required; redirects are rejected. No UI or automatic upload is enabled.

PASS_LOCAL: scripts/verify-server.mjs against isolated loopback backend storage
checks acknowledged digest, downloaded server-original bytes, one applied mark,
geometry readback, rejection of changed-context ID reuse, unchanged retry,
reattach, undo and unchanged local source. jett-server-client-proof.log records
the result; build passes. This proof script refuses non-loopback endpoints.

Backend gates observed separately: six application tests and two PN-1 HTTP
tests pass; PN-1/PN-3 HTTP subset passed three tests; eight work/restart tests
pass, including actual domain-process restart. Typecheck passes. An independent
contract audit identified a stale Flow B clarification expectation: approved
PN-2/PN-4 behavior is unresolved/TARGET_NOT_FOUND without safe evidence. The test
was corrected, preserving the independent ambiguity test.

Independent review found and prompted fixes for complete retry-envelope
snapshots and proof-script origin enforcement. The first live process exit
remains unexplained; later repeated client journeys passed. No production,
account, browser rendering or cross-device claim follows from these results.
Next connect the explicit server/document UI and render authoritative work.

## Explicit server reader checkpoint

The PDF reader now connects to a named server with session-only credentials,
explicit upload, digest-checked saved-copy reconnect, page-scoped commands,
quoted proposal review/apply/cancel, authoritative SVG work and server undo.
A complete pending request is persisted before transport. Lost responses remain
recoverable after browser reload; readback reattaches to obtain fresh context.

PASS_LOCAL: real HTTP/browser proof passes upload consent, geometry, reconnect,
undo, no persisted token, and lost-response/reload retry without duplicate work.
A separate generated fixture passes proposal preview, explicit Apply, Undo and
Cancel without an effect. Transport proof also passes after preserving the async
rejection contract for changed request-ID reuse. Evidence: parent workspace
jett-server-ui-proof.log, jett-server-proposal-proof.log and
jett-server-client-proof.log. No production or physical audio claim.

Founder correction: immediately prioritize fluctuating voice cursor and cycling
microphone. Three delegated workstreams cover capture lifecycle reproduction,
cursor animation reproduction, and public Wispr/local-engine architecture
research while the coordinator verifies this server checkpoint.

## Voice lifecycle and cursor investigation

Reproduced from the original mic section: two concurrent starts created two
recognizers; ten network-error/end events caused eleven immediate starts;
pause stopped only the newest recognizer and the earlier one could still emit
a command. The permission preflight also opened and immediately stopped an
unused stream. Separately, three cursor retargets left three animation callbacks,
and stop left two behind. Previous browser tests used injected text/reduced motion
and did not cover these lifecycles.

The capture adapter now owns one recognizer with generation-fenced callbacks,
waits for its start event before reporting listening, aborts on pause, and uses
bounded delayed reconnects. Device/permission failures stop with retry guidance.
Page exit cancels capture and leaves a truthful paused state on cached return.
The marker owns one animation callback across retargets and cancels it on stop.
Settings now represent starting, reconnecting and error states explicitly.

Thirteen focused capture/motion tests pass, including the cursor regression that
failed before the fix. These prove application lifecycle behavior, not physical
microphone continuity or local transcription. Browser recognition can still use
a remote service. Public-source and recovered prototype research is recorded in
../VOICE_CAPTURE_RESEARCH.md in the parent workspace; no private Wispr or Astra
production code access is claimed.

The real-toggle browser regression exposed a separate fresh-onboarding failure:
skipping mic permission left the header toggle hidden. Boot now initializes the
off-state controls before welcome. The regression passes against the updated
build and verifies startup cancellation, no late act, resume/listen/pause and
page lifecycle cancellation. Its recognizer is deliberately controlled; it does
not record the user's microphone. The first full run caught this failure
(124/125); the corrected build passes all 125 tests in jett-voice-final-full-test.log.
Independent capture/motion review and browser regression are complete. Physical
audio remains unverified; this checkpoint repairs reproduced application bugs.

## Local speech capability and explicit processing choice

Added a persisted on-device-only speech setting, explicit language availability
check and user-activated pack download. The existing browser service mode now
discloses possible remote audio processing in onboarding and settings. Switching
mode or language pauses capture. Local start requires an installed supported
locale plus processLocally support, and refuses to start instead of falling back.
Pending availability results cannot revive a paused session, and reconnects keep
the original session's language/processing policy.

Real private Chrome152 probing found available/install/processLocally APIs and
en-US/en-IN downloadable packs. No pack download or audio capture was performed.
The controlled browser journey covers absent pack refusal, explicit installation,
local start configuration and preference persistence. Thirteen capture unit
checks independently pass, including asynchronous cancellation and policy snapshots.
Evidence: parent jett-local-speech-capability.json and VOICE_CAPTURE_RESEARCH.md.
Live audio accuracy and continuity remain unverified.

Full local gate:132 tests pass in jett-local-voice-full-test.log. Independent
settings review and stale-query browser coverage completed. This is capability
and policy proof; actual model installation and synthetic-audio recognition are
next, followed by physical device acceptance when explicitly exercised.

## Real generated-audio speech proof

Chrome152 installed its local speech assets through the application's explicit
control. A generated Samantha voice passage fed directly as a Web Audio track
into the real recognizer produced the exact orchard passage and “highlight this”.
The recognizer reported processLocally=true. JETT's normal matcher, intent parser,
voice action and IndexedDB paths produced one highlight and receipt; reload
recovered it and history UI undo reversed it. Original bytes/digest and receipt
identity are checked by the repeatable verifier. No transcript helper is used.

This is PASS_LOCAL_SYNTHETIC for one generated English utterance, not physical
mic acceptance. CDP page networking was set offline during recognition; that is
not proof of OS-wide egress isolation. Native recognition.start() with fake WAV
input remained no-speech, whereas explicit generated-track input succeeded.
The earlier fake-media-device-only attempt did not establish its native source
routing and is excluded from acceptance. No claim of general accent/noise quality,
all-language support or Wispr-equivalent capture follows from this result.

Evidence: parent jett-local-speech-verified.log and runtime/local-speech-proof/
app-track-result.json, recognized-highlight.png. Scripts and exact limits are in
docs/architecture/VOICE_CAPTURE.md. Independent review tightened observed local
mode, real final results, pre-capture empty work, exact receipt and original-byte
assertions. Application code is unchanged from76d7548 (132-test gate); this
checkpoint adds real-engine verification and documents the remaining device seam.

## Capture owns one local audio stream

Local speech now verifies installed language and processLocally support before
requesting audio. It acquires one stream, passes its track to recognition, and
reuses it across bounded recognizer restarts. Pause, terminal errors, device-ended
and page exit release tracks; cancelled pending permission requests cannot revive
a session and late streams are stopped. Browser-service mode creates no extra
stream. Unsupported local track input does not fall back to native capture.

Nineteen capture tests pass. Independent real-controls browser coverage verifies
one acquisition, same-track recovery, pause/mode-change release and no acquisition
before availability. Real local ASR with a supplied generated stream passes the
exact highlight, receipt, source-byte custody, reload and undo journey; it also
checks one acquisition and ended track on pause. This extends the prior synthetic
proof through production start(track), with only acquireAudio supplied by the test.
Physical devices and OS-wide network isolation remain unverified.

The additional file-backed synthetic-device route started local recognition but
produced no transcript before its45-second observation timeout. It is not a
passing device test; the generated-stream proof remains the accepted evidence.
Logs: jett-owned-voice-real.log, jett-owned-voice-unit.log and
jett-owned-voice-device.log in the parent workspace.

Fresh full gate passes138 tests in jett-owned-voice-full-test.log. Independent
capture lifecycle review and browser verification completed; no production
release or physical-device acceptance is claimed.

## PDF form fill, local recovery and export

Added AcroForm inspection/editing with immutable source bytes. Text, multiline,
checkbox, radio and scalar choice fields have local drafts and explicit filled
copy download. Shared widgets use one answer; form JavaScript is disabled and
unsupported/signature-protected/dynamic forms are not silently approximated.
The original preview is labelled; local/server annotations are not part of this
form-only export. Draft writes survive navigation/reopen; failed saves can retry;
fields are frozen while the export snapshot is prepared.

Browser proof passes six answers across reload, exact original-byte preservation,
filled-copy download and narrow-screen layout. Independent pypdf inspection of
canonical field values, all eight widget values/AP/ancestry and source checksum
passes. Poppler renders of both exported pages were visually inspected: correct
text, checkbox/radio states, dropdown, multiline notes and repeated reference.
Evidence: parent jett-form-ui-proof.log and runtime/form-proof/ui-inspection.json,
ui-filled-{1,2}.png. See docs/architecture/PDF_FORMS.md for exact supported scope.

Final full gate:151 tests pass in jett-form-full-test.log. The final UI export
also passes independent ui-final-inspection.json; both ui-final-{1,2}.png pages
were visually inspected. Core covers12 focused real-PDF cases including saved
readback failure, canonical duplicate-name rejection, permissions/signatures,
unsupported field actions and required-value guards. The production-panel
lifecycle browser test passes delayed save, failed save/retry and stale-object
reopen. Frontend-local verification only; no account/server synchronization of
form drafts or production release was performed.

## Review the filled PDF before downloading

Added a modal rendered from the exact filled export bytes, with a download that
uses the same immutable snapshot. Original reader state remains intact. Download
waits until every preview page renders; interrupted renders, Escape and document
switching clear the snapshot. A late close event cannot invalidate a newer open.

Browser proof checks the real two-page preview, latest answers in downloaded
PDF.js-parsed output, close during rendering, Escape, source custody and return
after document switching. The end-to-end form proof now downloads through this
review; independent pypdf field-tree, widget and appearance checks pass. Visual
preview inspected, with responsive layout and controls using the app theme.
Evidence: parent jett-form-preview-proof.log, runtime/form-proof/preview-inspection.json
and filled-review-ui.png. This is form review/export, not printing or signing.

The first full run caught an Escape-close timing gap: native dialog closure
became observable before its queued close handler cleared preview pages.
Escape now invokes the same synchronous cleanup path as Close. The affected
browser regression passes against the corrected build; the first failed run
is retained in jett-form-preview-full-test.log and the focused correction in
jett-form-preview-focused.log. Final output independent inspection is in
runtime/form-proof/preview-final-inspection.json; both final rendered pages
were visually inspected with correct field values and appearances.

Final fresh gate:152 tests pass in jett-form-preview-final-full-test.log. Review
and output checks are local evidence only; richer modal accessibility, large-PDF
performance, annotation embedding and print workflows remain open.

## Portable local annotations

Local highlights, importance marks and notes now export as standard PDF
annotations through an exact-copy review. Source SHA256, anchor digest, raw page
tokens, exact word spans and physical page locators are checked before placement.
MuPDF character quads become smooth compatible line bands; note icons occupy
clear margins, avoiding text and existing notes. Serialization is reopened and
verified. Undo excludes marks, and stale or approximate marks fail visibly.

The shared form/annotation review reserves ownership before preparation; document
switches and newer requests invalidate older work. An independent lifecycle test
caught a queued-close event cancelling a replacement reservation; the fix consumes
already-handled close events. Close/download remain visible during page scrolling.
Plain PDFs without AcroForm now inspect safely. Linked checkboxes with differing
export states are explicitly unsupported instead of being treated as equivalent.

Final full gate: **170 tests pass**, parent `jett-annotations-verified-full-test.log`.
Browser proof includes actual saved acts, reload, all-page review, standard PDF.js
annotation readback, undo, source preservation and phone-width controls. Live
proof script: `scripts/verify-annotation-ui.mjs`; parent log
`jett-annotations-ui-proof.log`. The exact UI download was independently checked
with pypdf and rendered with Poppler: four IDs, contents, subtypes, page placements,
appearances and bounded quads match; repeated, multiline and rotated targets are
correct, with no text obscured. Evidence lives in parent
`runtime/annotation-proof/1788827609149/INDEPENDENT-REVIEW.md`.
Downloaded PDF SHA256:
`d9d2b932482ee96f989cd013aa180ce751f1e1f79f2bbbe736843adb5d595feb`.

This is local annotation export, not full annotation/editor parity. Form drafts
and server work remain separate scopes. Canvas review displays note icons but
does not open note popups. Physical-device interoperability, printing, signatures,
complex-script corpora and large-document performance retain separate gates.

## Read saved PDF notes inside review

Review now provides expandable, keyboard-accessible note sections on each page,
reading Text/FreeText contents from the exact PDF snapshot. Unicode, newlines and
HTML-like strings remain literal text. The native engine releases annotation
wrappers and returns independently owned plain data; it disables PDF JavaScript
before exposing pages. Repeated reads and reads after page cleanup are tested.

Browser regression covers serialized notes on pages 2/3, no notes on blank page 1,
keyboard expansion, whitespace, no HTML execution, unchanged input/snapshot,
close/Escape and replacement with an unannotated PDF. The live UI proof verified
displayed notes against the saved records and downloaded the reviewed file, with
desktop and phone captures inspected in
`runtime/annotation-proof/1788827924393/` under the parent project directory.
Final full gate: **173 tests pass**, parent `jett-review-notes-full-test.log`.
Live proof: parent `jett-review-notes-ui-proof.log`.

This closes the icon-only note-reading gap from the previous checkpoint. Clicking
canvas note icons remains noninteractive; the expandable text is the current
review interaction. Combined form/local-mark exports and exact spoken ranges
remain distinct unfinished workflows. Local evidence only; no deployment.

## Exact spoken range highlights

New ranges retain both complete endpoint phrases and their original token spans.
Repeated phrases require a contextual choice; reversed or missing endpoints do
not create a mark. Offered alternatives and selected endpoints are retained.
Same-block ranges clip precisely; cross-block ranges save one source-bound entry,
replay first/last clipped segments and complete middle text, and undo atomically.
Changing documents clears pending endpoint choices.

PDF export uses physical page locators and native quads for each derived segment,
with stable per-page annotation identities and reopened verification. Skipped
pages must be verified empty in the original PDF; text/drawing gaps fail visibly.
Legacy approximate ranges remain unexportable. A wrong digest prevents even a
normalized same-block range from repainting after reload. Ordinary highlights
still refind after an explicit revision advance, reporting refound rather than
exact when their source changed.

The first full run exposed older desktop/phone tests expecting nonexistent
endpoint phrases to be silently shortened. Those journeys now assert no guessed
mark and then issue a complete valid spoken command. A later gate caught ordinary
revision-refinding compatibility; that behavior was restored without relaxing
range integrity. Both failure logs remain in the parent project directory.

Actual local UI range download independently inspected and rendered on all three
pages: `runtime/range-proof/1788828446823/INDEPENDENT-REVIEW.md` under the parent
directory. Three annotation identities, contents, page locations, appearances and
quads match. Unselected first/last lines stay unmarked; the middle text is marked.
Output SHA256 `8284ddf0923964b1209aa624fcb1e8fe32dd8891426b8dfd8cd70b96f623152d`.
Original SHA256 `8a7dab95d681d0c7cbcc025a3bcb19150e1bd1a261eeb9cd16fb4e1d78847a83` unchanged.
Reusable proof: `scripts/verify-range-ui.mjs`. Controlled command input and browser
evidence only; physical microphone accuracy remains a separate gate.

Final full gate: **189 tests pass**, parent
`jett-exact-ranges-final-verified-test.log`. This includes desktop and phone
grammar recovery, exact endpoint choices, clipped rendering, failed-save rollback,
source mismatch on replay, three-page PDF export, reload and durable one-step undo.

## Combined saved answers and local marks

The form panel now offers an explicit, initially unchecked **Include saved local
highlights and notes** option for reviewed or direct downloads. It snapshots the
latest successfully saved draft and committed marks, annotates original bytes
first, then fills the derived PDF. Field schema/group membership and original
values are checked across the intermediate save; final values and annotation
metadata/geometry/style are reopened and verified. Existing annotations must
survive too. Undone marks stay excluded, including when all marks are undone.

Note placement now avoids form widgets. Changed fields overlapping annotations,
stale drafts, conflicting shared values, dropped annotations and changed field
schemas fail visibly. The inclusion option and exports stay disabled while a save
is pending or failed. Reopening a stale document uses the latest durable draft;
document switches and newer review ownership fence delayed record reads/exports.

Independent browser readback found a stale scalar-choice `/I` selection index:
`/V` and appearance held Research while PDF.js reported General. The form exporter
now synchronizes both widget and canonical-field indexes, including separate
display/export option values. The pypdf inspector also checks index/value agreement.
The regression retained its original failing artifact rather than weakening the
independent reader assertion.

Actual reviewed and direct combined downloads, form-only default and post-undo
download all passed PDF.js field/annotation checks. Independent pypdf and Poppler
verification of the reviewed copy is retained in parent
`runtime/combined-proof/1788829563697/INDEPENDENT-REVIEW.md`. All six canonical
answers, shared reference widgets, multiline text and both local marks are correct.
Output SHA256 `acfbec1cc5cd7e5276f8474e7e9eec31b345dd7255af09c0767aee9430e4016e`;
original form fixture hash remains unchanged. Root also inspected the rendered form.
Scope remains local browser/PDF verification, not production, physical printing,
universal editor interoperability or signing. Server work remains separate.

Final full gate: **200 tests pass**, parent `jett-combined-pdf-final-full-test.log`.
This includes the stale-document/delayed-review lifecycle test and independent
dropdown selection readback. The earlier full run passed 199 before the new
lifecycle regression was added.

## Exact PDF print handoff — 8 September

`Review original` opens preserved PDF bytes in the shared review. Filled,
annotated and combined reviews expose the same `Open for printing` action after
all pages render. It opens an immutable PDF Blob in the browser's native viewer,
where the person chooses Print. Closing/replacing the review does not invalidate
an open viewer; closing that viewer releases its URL. Blocked tabs retain the
copy for download/retry. Invalid PDFs cannot use the handoff.

Private headed Chrome proof verifies a native PDF viewer, exact combined and
original byte identity, detached opener, URL lifetime, blocked popup recovery,
render-failure disablement and actual application entry point. The 390px review
keeps Close, Download and Open for printing in view. Root inspected retained
native-viewer and phone screenshots under ../runtime/print-proof/native-viewer/.
No native print action, physical output, margins or other platform proof implied.

Final gate: 201 tests passed, none failed/skipped, plus production build; log
../jett-pdf-print-final-full-test.log. The earlier full run was interrupted while
the browser evidence assertion was finalized; it is not a completed gate.
See ../architecture/PDF_PRINT.md for behavior and practical limits.

## Voice restart budget and microphone disclosure — 8 September

Reproduced a retry-budget bypass: empty events, whitespace finals and never-final
interim hypotheses reset the failure counter and could sustain endless restarts.
Recovery now requires a newly finalized nonblank transcript to replenish the
budget. Interim text still drives the live cursor. Synchronous cancellation from
a state callback cannot leave a scheduled restart behind.

Capture separately reports actual owned-track state. The header and settings
now disclose that the microphone is on during acquisition and remains on during
local recognition recovery. They continue to show recognition as interrupted;
no continuous-capture claim is inferred for browser-managed remote mode. Pause
and terminal errors release the track before clearing its held-state disclosure.

Focused core gate: 23 tests pass; actual browser regression covers held input
before recognizer start, reconnection, restart and pause. Full gate: 205 tests
pass, none failed/skipped, with production build; ../jett-voice-continuity-full-test.log.

Real Chrome local ASR also accepted two generated spoken commands separated by
a deliberate recognizer stop: one acquisition, same live track, one saved voice
highlight per spoken command and no restart-created act. Pause ended the track.
The dedicated proof script blocks all acquisition before its generated source
is ready and rejects native starts with any other track. It installs no packs.
Evidence: ../runtime/local-speech-proof/continuity-result.json. This does not
prove physical microphone/OS indicator behavior, natural device interruption,
or lossless speech during the recognition restart interval.

## Local library recovery — 8 September

Settings now downloads a versioned library backup and previews a selected backup
before explicit restoration. The backup covers saved documents, original bytes,
form answers, local records and reading positions. A coherent readonly snapshot
and add-only atomic restore preserve destination data; any ID collision aborts
all incoming additions. Server links/pending requests, settings, microphone
preferences and sharing memberships are excluded. Complete raw JSON export is
still separate. Both encoding and decoding enforce a 100 MiB limit.

Core validation checks bytes/digests, shapes, relationships, duplicate/undo IDs
and bounded indices, and recomputes cached anchor resolution without modifying
historical receipts. Independent review found and fixed loss of form fields
whose names resembled configuration keys, a malformed math history crash, and
premature failure reporting before IndexedDB rollback finished. Legacy text and
approximate migration retain their uncertainty.

Full gate: 216 tests passed, no failures/skips, plus build;
../jett-library-backup-full-test.log. After copy polish, the final build and
expanded browser test passed (../jett-library-backup-final-build.log and
../jett-library-backup-final-browser.log). That test restores PDF, text, PNG and
Markdown into a separate context with an existing document, verifies exact source
bytes, decoded image dimensions, saved form answer, highlight, unchanged receipt
and reading position after reload, and rejects duplicate/malformed files without
mutation. Dedicated database tests force later record/position conflicts to
prove earlier queued additions roll back. Root inspected the final 390px preview.
Artifacts: ../runtime/library-backup-proof/library.json, result.json and
phone-preview.png. This is local recovery proof, not account/cloud synchronization
or authentication of a backup's author. See ../architecture/LIBRARY_BACKUP.md.

## Native PDF page rotation — 8 September

Reviewed originals, filled and annotated/combined PDFs now offer per-page left
and right rotation. The operation changes only native leaf-page orientation on
an owned prepared copy, verifies reopened data and renders the exact output for
download/print. Stored originals and local drafts/records remain unchanged.
Inherited angles and full-turn normalization are checked; protected/dynamic
inputs are refused. Assembly permission is required.

Preservation verification compares the dereferenced catalog/info graph and
decoded streams, excluding leaf page rotation rather than wrongly treating
transformed displayed widget bounds as fixed. Independent review caught a
preview-failure path that discarded the old usable copy. It now restores old
DOM/bytes/name and controls only while that same review still owns the operation.
Closing or preparing another review cannot resurrect stale content.

Full gate: 227 tests passed, no failures/skips, with build;
../jett-pdf-rotation-full-test.log. Core checks include damaged-save rejection.
Browser tests cover real combined-copy downloads, four-turn normalization,
original custody and closing/replacement. Three fault-injection scenarios use
real MuPDF with a delayed failing rotated render to verify exact previous-copy
recovery and stale ownership guards.

Retained independent proof: ../runtime/pdf-rotation-proof/1788841756846/.
Rotated PDF SHA256 50d6e15f788450815d900cc462915e60bc6cf08d62013e2fd173c872b9890fda.
PDF.js confirms rotations90/0 then0/0; pypdf confirms fields/appearances and native
annotations/contents/quads. Both Poppler pages were independently inspected;
root also viewed the first rotated page. This is local fixture evidence, not
physical printing, editing arbitrary PDFs or full page-operation parity.
See ../architecture/PDF_ROTATION.md.

## Document names — 8 September

The reader now offers Rename with a focused, responsive dialog. An atomic
IndexedDB update changes only title and titleRevision. Ordinary stale document
saves preserve the renamed title, and queued opens refresh newer name metadata.
Source bytes, form answers, records and reading positions remain intact. Backup
roundtrips retain naming revisions. Math notebooks use stable source identity
and keep their chosen name when another expression is appended.

Full gate: 231 tests passed, no failures/skips, with build;
../jett-document-rename-full-test.log. After final CSS polish, build and the
actual browser journey passed again (../jett-document-rename-final-build.log and
../jett-document-rename-final-browser.log). Real IndexedDB tests exercise both
stale-write orderings. Browser checks cover cancel/invalid input, search/reload,
exact original PDF download, saved work, stale opens, continued math and switching
documents during a pending save. Root visually inspected the final 390px dialog
at ../runtime/document-rename-proof/phone-rename.png. This changes a local library
name; it does not rename an external file or implement cloud synchronization.
See ../architecture/DOCUMENT_NAMES.md.
