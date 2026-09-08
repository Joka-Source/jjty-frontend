# JETT functional audit

- Product: full JETT; this ledger covers the web work application.
- Branch: codex/jett-experience, base 10acc0e.
- Runtime: Node 22, Vite, browser IndexedDB; localhost:5174.
- Start: npm run dev -- --port 5174 --strictPort.
- Focused test: npm run build && node --test test/shell.e2e.test.mjs.
- Full local gate: npm test.
- Stop: terminate only the owned Vite process.
- Test data: synthetic text and bundled sample; no private uploads; separately authorized physical microphone trials use the bundled sample.
- Authority: IndexedDB documents/positions/records plus rendered UI.
- Evidence: local test logs and screenshots. No production proof implied.

| Journey | Result | Evidence / next action |
|---|---|---|
| First-run text intake | PASS_LOCAL | Independent paste composer; real click with installation hint present, save and reopen. test/shell.e2e.test.mjs. |
| Find saved work | PASS_LOCAL | Title/content search, empty result, reload and open; synthetic persisted content inspected. |
| Desktop and phone shell | PASS_LOCAL | Desktop/mobile shell gate, 390px rendered phone with no horizontal overflow; current JETT style. |
| Voice cursor and downstream actions | PASS_LOCAL | Controlled transcript journey covers in-paragraph movement, exact highlight/restart/undo and pointer precedence. A bounded on-device physical-microphone sample now covers staged range, reload and spoken undo; accent/noise reliability and remote application remain unverified. |
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

## Research baseline explorer — 8 September

Founder clarification changes the first target to current PDF Expert iPad/iPhone
feature and interaction parity, with BentoPDF implementation reuse. Physical
iPad observation is deferred while online research proceeds. The old Mac copy
is excluded as a current iPad reference.

Tracked docs/research/pdf-expert-ipad now contains ten qualitative observations
from eleven public threads, 24 documented interactions from nine official pages,
and ten Bento source adoption contracts at upstream
d69566ebefb9cc3ea2d8db4f845596356998a882 (2.8.8). These are not representative
sentiment statistics or completed feature counts. Source/code existence checks
passed; no upstream install or execution. A separate teacher account in the
ontology is not included in the eleven-thread sample.

PASS_LOCAL for the research artifact: self-contained explorer browser checks
verify 44 entries, filters 10/24/10, search/combined filters, empty recovery,
clear/focus, native keyboard disclosure, HTTPS source links, 390px layout, zero
external requests and zero page errors. Root inspected final mobile rendering.
Evidence ../runtime/research-explorer-proof/result.json, desktop.png, mobile.png.
Regenerate with node scripts/build-research-view.mjs. No product-runtime code
changed, so no repeated full product gate; previous 231-test tour gate remains
the current runtime evidence. This is research delivery, not iPad parity proof.

Bounded local and history searches including the founder's IIIT Nagpur clue did
not locate the reported Reddit mirror/lab; no broad archive access or collection
claim. Public research continued independently.

## Live Chrome diagnosis and silent-recognition recovery — 8 September

In the user's Chrome profile, browser-service mode had microphone permission and
emitted audio/speech-start events, but zero recognition results during the
observed attempt. The same profile initially reported the local English pack as
downloadable. Installing it through the app and selecting on-device mode yielded
391 result events in one recognizer session, with an owned live microphone.
A generated sentence played through the Mac speaker reached the physical mic,
moved the cursor to the rent paragraph, and a subsequent spoken highlight
created a voice act after explicit ambiguity confirmation. That act survived
reload. Pause reported audioHeld=false; local mode persisted. No fake transcript
or generated MediaStream supplied this live check. The result does not establish
unattended exact selection, all accents/noise or native Android voice.

Evidence: ../runtime/live-voice-diagnosis/2026-09-08.json. The temporary event-only
instrumentation was removed by reload. No raw audio or full conversation saved.

A new capture deadline handles the observed failure class: detected speech with
no nonblank result for twenty seconds ends capture and gives a specific retry/
settings message. Three regression tests failed before the patch and passed
after it (26 focused tests total). A separately mocked browser journey verified
the rendered failure, retry button and one abort with an accelerated clock.
This mocked failure test is separate from the real-audio configuration recovery.

Full local gate passed: build plus 234 tests, zero failures/skips; log
../runtime/live-voice-diagnosis/watchdog-full.log. The reason-code assertion was
also rerun in the focused 26-test suite. Product change is local only.

## Responsive spoken jumps — 8 September

The founder reported that reading a deposit phrase then jumping to “failures”
left the cursor behind. A negative-first browser test reproduced that exact
failure (block0 retained rather than block1). The eight-word fuzzy window could
mix old and new speech; fewer than three words also produced no raw match.

The shared application adapter now permits conservative exact, unique suffix
recovery across both engines. Six focused tests cover cumulative/isolated jumps,
repeated/common/numeric rejection, preserved exact and fuzzy spans, and real WASM
wrapper behavior. Raw kernel parity tests still pass separately.

Browser proof passes for JS and WASM: controlled transcript input moves the marker
to the distinctive new passage, creates no act while merely reading, and saves
an exact anchored highlight only after an explicit instruction. Reload retains
the same act. This browser regression uses controlled transcript input and is
not a fresh physical-microphone accuracy claim. Earlier live audio proof remains
separately recorded. Evidence: ../runtime/live-voice-diagnosis/jumps-before.log,
jumps-after.log and test/voice-jumps.e2e.test.mjs.

Full local gate: build and 241 tests passed, zero failures or skips;
../runtime/live-voice-diagnosis/jumps-full.log. The focused browser test covers
both actual engine selections; no silent JS fallback is accepted for WASM proof.


## Conversational selection and visible recognition — 8 September

The formerly ignored staged start command now retains exact source-bound state.
Controlled browser proof covers start/read/end, current-cursor start, repeated
endpoint choices, unknown endpoint retry, batched recognizer finals, ordinary
“until” prose followed by a correct highlight, cancel by voice/button/Escape,
document and same-ID source replacement, desktop/mobile feedback visibility,
atomic save, reopening and one-step undo. The UI now displays what was actually
recognized and keeps the retained-start/cancel controls visible while reading.

Physical local-English trial on the bundled sample: start at “the deposit”, end
at “a sound roof”, reopen the two-block highlight, spoken undo, reopen the undone
record, and spoken cancellation all verified. Sample record
`evt-mtshgrov-9-nm8i4` remains undone; the earlier rent mark was preserved. Capture
was paused and released after testing. Recognition mistakes were observed and
reported: this is bounded functional proof, not a claim of fluent general voice.
Parent receipt: `runtime/live-voice-diagnosis/staged-physical-receipt.json`.

Independent review caught and helped resolve queue-generation and ordinary-prose
reading-evidence bugs. A separate print test race was corrected by checking its
initial disabled state in the same browser turn that starts rendering, then
checking enabled after rendering; product printing code was unchanged.

Final gate: Vite production build and **242 tests passed**, zero failures or skips.
Focused staged journey and independent review passed. Changes are local only.


## Stale-target refusal, capture batches and polite commands

Negative-first browser tests proved that unmatched reading could highlight an
old passage, and that a courtesy prefix could incorrectly reject a deliberately
selected passage. The application now distinguishes pending interim uncertainty
from finalized reading rejection, freezes command authority on arrival, preserves
partial command prefixes and removes standalone command courtesy from reading
classification. A visible guide is restored when an unfinished command becomes
a recognized instruction. Pointer recovery works for text and PDF block paths.

Production capture ordering is covered by an application bridge with controlled
recognizer events: each newly final reading gets matched before its following
command, even when Chrome batches the results. Optional local English hints have
32 focused capture tests covering setup, absence, failure, retry, stream ownership,
pause and batch ordering. The hints were accepted by actual local Chrome; observed
misrecognitions mean improved recognition accuracy remains unproven.

Physical sample proof covers finalized unrelated reading and refusal of a later
correctly recognized highlight instruction; ordinary “I like this” with hints
creates no act; deliberate selection followed by “Please highlight this” creates
the expected deposit mark. Sanitized receipt is in the parent runtime directory.
No private document or recording was added to the repository.

Final runtime checkpoint: `2283c3f`, with capture at `fe18da0`. Production build and **249 tests passed**, zero failures or skips. The physical recovery mark was removed by spoken undo; reopening preserved undo and only the original rent sample mark remained. Microphone released; feedback cleared. Frontend changes remain local.


## Bento-derived native page reordering — PASS_LOCAL

The prepared-copy review now accepts strict complete page orders such as `3,1-2`.
Actual pinned Bento helpers are adapted with attribution, source hashes and the
upstream license in `vendor/bentopdf/`. No source PDF is overwritten. MuPDF's
catalog-loss behavior was reproduced and fixed by retaining allowed metadata;
serialized readback checks content, geometry, annotations and form structures.
Independent PDF.js fixtures confirm order and filled/annotated page identity.

Rendered browser tests cover invalid-input recovery, exact download order,
preview failure restoring the previous copy, close abandoning a pending render,
and a newer review surviving an older failure. Existing rotation recovery,
printing, phone, offline and voice journeys remain green. Final gate:
`npm test` production build plus **264 tests passed**, zero failures or skips.
Raw gate log: parent `runtime/live-voice-diagnosis/reorder-full.log`.

Advanced navigation/tag/attachment structures, signatures, restricted forms,
deletion and duplication remain outside this bounded operation. Custom ordering
is implemented; full thumbnail organization and organizer undo remain unproven.
This is a local engineering checkpoint, not production deployment.


## Recoverable page-change undo — PASS_LOCAL

The review retains one prior immutable snapshot after a successful reorder or
rotation. Undo renders those exact bytes and restores the prior filename. Closing
or replacing the review clears this history. This is one-step in-preview undo,
not a persistent multi-step organizer history. Failed undo restores the current
copy and permits retry; interrupted or superseded undo cannot revive old content.

Exact download-byte assertions cover reorder and rotation undo. Browser failure
injection covers retry, close and new-review ownership. Final gate: production
build and **268 tests passed**, no failures or skips. Log: parent
`runtime/live-voice-diagnosis/review-undo-full.log`. Local only.


## Bookmark preservation and early availability — PASS_LOCAL

Complete reordering now rebuilds a bounded semantic snapshot of PDF bookmarks
before native rearrangement can mutate the original outline tree. Nested/collapsed
state, Unicode title bytes, style/color and local direct or GoTo destinations are
retained; numeric bookmark targets map to their original page identities. Native
reopen and independent PDF.js checks verify target content and coordinates.
Injected bookmark loss fails closed. Named destinations, external bookmark
actions, malformed/cyclic trees and oversized titles remain refused.

Native probes also removed numeric links outside outlines. Existing output
comparison already refused those exports; shared preflight now detects these
numeric links/page actions before editing. Direct-reference links remain verified.
The review disables only reordering for unsupported files, preserving rendering,
printing and exact downloads. Generation tests cover closed/replaced preflight;
failed review/undo restore their own availability state. A styled synthetic review
at 375px has no control overflow and 44px targets; screenshot inspected locally.
This is browser evidence, not physical mobile-device evidence.

Production build and **279 tests passed**, zero failures/skips. Log: parent
`runtime/live-voice-diagnosis/outlines-full.log`; screenshot: `reorder-narrow.png`.
Next reader gap: existing PDF bookmarks are preserved in output but there is no
reader contents/bookmark navigation surface in the current main/provider code.
Engineering remains local and the general product goal remains unfinished.


## Reader PDF contents navigation — PASS_LOCAL

Both native MuPDF and PDF.js readers expose a bounded contents tree. Local direct,
numeric and named destinations navigate to pages; external, remote, script and
invalid targets retain their titles but cannot navigate. Native entries are read
from their own raw nodes rather than associated by duplicate title or position.
Depth, node and title limits apply; source destruction invalidates pending reads.

The reader renders literal titles, nested expand/collapse controls and a one-step
return to the prior reading place. Source changes discard old rows and return
history. The actual app import/jump/return/reload journey passes for both engines;
marks and original bytes persist. An empty page cannot authorize a stale voice
highlight. This is page-level contents navigation, not exact destination-coordinate
navigation. Blank-page navigation does not add a new persistent text-block anchor.

A 32-level, 375px styled check reproduced horizontal overflow (305px viewport,
552px scroll width). Bounded visual indentation fixes it without flattening the
hierarchy: final viewport/scroll width both305px, deepest button remains visible,
expand targets44x44px. Final themed screenshots were inspected in the parent
`runtime/contents-depth-proof/` directory. These are synthetic browser checks,
not a physical mobile or microphone test.

Gate: production build and **293 tests passed**. A subsequent CSS-only theme
alignment and browser-driver readiness correction received a fresh production
build and **8/8 focused contents panel + actual-app tests**. No application JS
changed after the full gate. Logs in parent `runtime/live-voice-diagnosis/`:
`contents-full.log`, `contents-build.log`, `contents-styled.log`.
Next voice measurement remains a same-audio, local recognition comparison with
hints off versus boost2 and ordinary-speech controls; accuracy remains unproven.

## Controlled local recognition comparison — PASS_LOCAL

The reproducible [benchmark](VOICE_BENCHMARK.md) now feeds identical synthetic
Samantha audio to native Chrome 151 local recognition, with hints off and boost2.
The final run uses the application's continuous-recognition setting. Both
conditions returned finalized matching text for all eight samples, matched all
four expected command intents, and produced no commands from four ordinary
speech/reading controls. This small clean corpus shows no measured hint advantage;
it does not establish human speech, accent/noise, target selection or action
persistence reliability. Application recognition behavior was not changed.

The experiment initially exposed its own endpoint defect: waiting after an
AudioBufferSource ended did not supply useful silence to recognition. Short
commands could remain interim-only until forced stop. Adding explicit zero-valued
audio samples fixed that test condition; both single and continuous native runs
then returned 16/16 finalized transcripts. Earlier incomplete runs are retained,
not scored as successful recognition. The scorer rejects interim/error/no-data
success and uses the real application intent parser.

Chrome reported English available at JETT's existing origin but downloadable at
the isolated benchmark origin. The final run used a same-origin frame with
microphone access denied by Permissions Policy. It made zero physical microphone
requests, never connected to speaker output, installed no model, and attempted
no remote fallback. All sixteen generated tracks ended and the AudioContext
closed. The temporary frame source and benchmark server were removed/stopped.

Evidence: parent `runtime/voice-ab/results.json`, timestamped earlier receipts,
`score.json`, corpus hashes and `focused-tests.log`. Fourteen focused scorer and
actual generated-script lifecycle tests pass. No application code changed; the
earlier full application gate remains the latest full gate. Native Android voice
and real conversational recognition quality remain open.

## Selected PDF page extraction — PASS_LOCAL

The review can now extract a nonempty, unique selection of pages into one new
reviewed PDF, preserving the requested order. The Bento-derived parser shares
strict range validation with reordering while keeping the existing complete-order
invariant intact. The original reader document and its bytes remain unchanged.

The native core verifies serialized page content, resources, geometry, simple
Text/Highlight annotations and Popup/parent/page relationships against the source.
Independent PDF.js readback covers selected rotated/blank pages and annotations.
Protected PDFs, forms/widgets, navigation structures, links and page actions are
currently refused before editing. Extraction is not redaction or sanitization:
shared resources and incidental metadata may remain in an extracted copy.

The actual app's 375px import → review original → extract → undo journey passes;
the screenshot was inspected. Controls fit without horizontal overflow and retain
44px button targets. Exact downloaded-byte tests cover extraction and undo, while
injected preview failures cover restoration, close and newer-review ownership.
Both reordering and extraction availability are restored with the correct snapshot.

Focused evidence: seven extraction-core tests, six page parser tests, nineteen
extraction/reorder/undo recovery checks and the actual-app narrow journey pass.
The initial full gate passed 321/322 checks. An existing navigation test failed;
a separate deterministic test proved that a delayed position read overwrote a
newer selection. Selection versions now reject stale restoration, including a
new blank-page selection. Return animation ownership also stops old RAF loops
on user input, removed targets and newer returns. These verified defects are
fixed; causal attribution to the original intermittent test is not asserted.
The subsequent full integration gate passed 338/338 checks. Evidence remains in the parent
`runtime/live-voice-diagnosis/` folder: `extract-recovery-final.log`,
`extract-app-focused.log`, `extract-narrow.log`, `extract-narrow.png`, and
`extract-full.log`. No application release or complete Bento integration is claimed.

## GStack command feedback workbench and named highlights

The five-minute continuation heartbeat is paused per the founder's latest request;
this is independent of microphone ownership. GStack investigate activated in the
frontend task, and the human workbench passes 41 metadata/reference checks. These
checks are not product or production proof. Three bounded agent lanes handled the
journal core, named-phrase regression and return-animation lifecycle, with lead
integration and independent review.

The screenshot's recognized “Highlight a lead charge” exposed an unsupported
command shape as well as an ASR substitution. Even correct “Highlight a late
charge” previously became bare-highlight ambiguity followed by reading text.
The adapter now preserves the full named phrase. Exact unique source matches
apply to that span; repeated occurrences ask; absent words cannot mutate the old
cursor target. Four focused pre-fix failures now pass. The actual browser checks
confirm exact `a late charge` custody, refusal of `a lead charge`, and correlation
through duplicate-target confirmation. Automatic phonetic repair is not claimed.

Settings now includes a bounded command journal, Worked/Missed feedback, expected
command selection, optional local recognized-word retention, clear, and sanitized
analytics export. Final utterances and registered pointer verbs receive trace IDs.
A result is saved only after the durable engine returns a receipt. Real injected
IndexedDB failure never records a saved result. Math keep retains its utterance
trace; test-hook input is explicitly labeled sim. Raw words, corrections and
source text are excluded from export. No PostHog host, project or sender is
configured; no analytics transmission is claimed. Broader non-registry controls,
pre-transcript capture failures and generic prompt lineage remain outside this
first journal. See COMMAND_FEEDBACK_LOOP.md for fields and operating procedure.

The 375px Settings journey was captured and visually inspected. The browser test
covers feedback, expected intent, persistence/reload, raw-text removal, storage
failure, exact named-phrase behavior and an unheld microphone. This is a controlled
transcript test, not a new physical-mic accuracy claim. Original source custody
and extraction/undo remain independently tested. Detailed local receipts are in
`runtime/live-voice-diagnosis/` alongside the earlier failed runs; failed evidence
has not been overwritten or promoted to success.

Final verification: `npm test` built successfully and passed **339/339** tests,
zero failures/skips/cancellations (`workbench-feedback-final-gate.log`). The earlier
339-test run exposed a harness readiness race: contents existed before the reader
was visible, so locator scrolling could stall on the whole transparent page layer.
Named-step diagnostics reproduced that failure; the test now waits for the visible
reader and clicks actual text. Ten consecutive focused runs passed without a
longer timeout; all original selection/restore/source-preservation assertions
remain. The final combined gate includes that correction and the actual metadata
download/readback proof. Status: PASS_LOCAL. No deployment or general live-speech
reliability claim.


## Capture failures before a command

The local feedback loop now observes the existing capture onState callback. Each
start owns one capture-only trace through preparation and reconnects. A terminal
state ends that ownership. Failures before recognizer start still get a record;
no final transcript or successful command is invented. A final voice command
links to its retained capture trace. Errors are allowlisted, text-free metadata.
App-owned `audioHeld` is distinct from a browser-managed microphone.

The actual browser application with an injected fake recognizer verifies a
recognition-no-results failure, retry, linked exact highlight receipt, pause and
rejection of late callbacks. No physical microphone requests occurred. Four
adapter lifecycle tests and the journal checks pass. This is better diagnosis,
not a new capture algorithm or evidence that human speech reliability is fixed.
Shared CLAUDE.md routing and the Codex AGENTS.md entry point now make GStack
workflow selection explicit for future agents.

Final gate: build and **344/344** tests pass, zero failures/skips/cancellations
(`capture-journal-full.log`). Status: PASS_LOCAL for the diagnostic addition.
Application microphone acquisition, recognition algorithms and retry policy are
unchanged; the physical-user quality boundary remains open.


## Default-on feedback and PDF merge — 8 September 2026

Build plus **380/380 tests pass**, zero failures, cancellations or skips.
Final gate: `../runtime/live-voice-diagnosis/default-on-release-gate.log`.
Earlier failed/aborted logs are retained separately. The full suite exposed an
HTTP-origin startup UUID failure and a narrow-review layout regression; both have
focused reproduction and the final combined gate now passes.

Product analytics enrolls new command/capture/feedback metadata by default in all
builds, with persistent opt-out. Stable event UUIDs, append-only feedback and a
bounded outbox support correlated retries. A real-browser loopback HTTP receiver
verifies automatic sending, failed-request/reload retry identity, separate feedback,
two-tab opt-out and exclusion of off-window/history replay. Raw text/audio is
excluded. No real PostHog configuration or hosted receipt is available. See
[analytics architecture](../architecture/PRODUCT_ANALYTICS.md).

Controlled speech “a lead charge” offers exact source “a late charge” for explicit
confirmation. It does not auto-save a corrected guess or mutate the previous
passage. Exact unique phrases retain direct behavior; physical speech reliability
remains open.

PDF review now combines the current copy with multiple selected PDFs, preserves
original bytes, renders the output and supports exact one-step undo. Native and
independent PDF.js checks cover order, blank/rotated pages, ordinary annotations,
local links, supported bookmarks and first-source metadata. Operation/render
failure restores the previous usable copy; stale work cannot replace a newer one.
The merge control is expandable and the mobile tool area scrolls within a bounded
height, preserving visible preview space. Forms/signatures and advanced catalog
reconciliation remain explicit missing merge capabilities.

The current increment is local source and browser/native-library evidence only.
No engineering push, application deployment, new Android/iPad build or complete
Bento/PDF Expert parity is claimed. The founder's full parity target is unchanged.

### 9 September — direct annotation workspace

JETT now owns the visible annotation interaction: workspace navigation, Highlight, Note, Undo and reviewed Export PDF. These use the same durable action engine, with explicit mapped targets instead of a current-reading-position fallback. Repeated phrases, cross-page ranges, reload, native annotation readback, injected save failure, stale selection after document change and note retention during zoom are exercised. Independent review confirmed PDF item identities survive overlapping highlights and undo in either order.

Responsive evidence: `human/evidence/2026-09-09/direct-annotation/` in the sibling canonical human repo. These are synthetic browser fixtures, not native/device or full parity approval. Remaining professional UI gaps include direct page organization, Edit and Fill & Sign parity, annotation styles, thumbnail navigation and touch selection validation.

### 9 September — visual page organization

The JETT Organize workspace opens an explicitly scoped original copy in our review. Page overview supplies visual selection, move earlier/later, extraction, rotation and Undo; snapshot changes use the existing verified engines and recovery paths. Native buttons and checkboxes support keyboard use. The overview collapses advanced typed-page controls and preserves full-size inspection by toggling back. Independent review found and repaired an incremental-render closure bug; handlers now resolve the live page list when invoked.

A real JETT browser journey independently parses the downloaded reordered and extracted PDFs with PDF.js and verifies undo reproduces exact original bytes. This is original-copy organization, not yet saved-work composition or durable Library publication. Full parity remains open.

### 9 September — reviewed copies retained in Library

Save copy to Library ingests the exact verified review snapshot, with a deterministic identity based on parent identity and output digest. It reuses Bento return's atomic derived-document import. Annotated, filled and original review callers capture origin from their owned document; page edits retain that primary origin. No parent local records or form drafts are copied onto the derived file. Primary-source provenance is explicit and does not claim complete merged-input lineage.

The actual browser journey injects an IndexedDB quota failure, verifies the review remains usable, retries successfully, and compares saved/reloaded source bytes with the downloaded reviewed output. Review race coverage holds one save, replaces the review, then verifies late completion leaves the newer review usable; rename/kind changes do not change output identity. Independent review found a queued-activation race, repaired by ownership checks when the reader queue is acquired and after pending position/form saves. Persistence remains committed when opening is skipped or fails.

### 9 September — Organize includes saved work

Primary Organize now snapshots the latest persisted document after flushing form answers, reads committed annotation records, and composes both into the copy before page operations. A native modal reserves review ownership and blocks further form input during preparation. Cancelled work cannot reopen review; failures never silently substitute an original-only copy. Explicit original review remains available separately.

A real browser journey injects failed form persistence, observes Organize refusal, retries, creates Highlight and Note through the JETT toolbar, cancels a held composition, rotates a valid combined copy, saves it to Library and reloads. Independent PDF.js readback confirms the answer, highlight, note and rotation; original bytes are identical. Poppler renders the resulting PDF for inspection. Independent review is clean after tightening modal ownership to require that the dialog is still open.

### 9 September — numbered Reader navigation

Direct Reader controls show physical page/total and accept validated integer jumps, previous/next and a persisted first departure point. Return restores zoom mode and offset across tab/reload. Jumps clear selection and stale targeting; blank pages remain untargeted. Errors preserve the destination history for retry. Zoom rollback now restores the previous page DOM, blocks, view and model if post-render history loading fails, rebuilding search paint too.

Mouse/keyboard testing found global document scroll insets also affected sticky toolbar inputs. Chrome controls now omit those insets while focused, so invalid entry preserves scroll position. The 200-page synthetic fixture has 200×240pt pages, including blanks; it proves navigation and recovery, not full-size long-document performance. Desktop/phone renders are inspected. Numbered-page Return is currently separate from existing contents/search detours; unification and thumbnails remain next.

### 9 September — shared navigation history

Contents, deliberate search and numbered jumps now share the first departure point until successful Return. Search uses exact range geometry below the sticky toolbar, preserves search focus, and serializes rapid Next clicks. Restoration and zoom repaint do not create history; no-hit queries do not move the reader. Contents awaits navigation and ignores stale completions, with failure text and no false success. The older standalone contents controller retains compatibility; JETT hides its separate Back control.

Focused browser coverage exercises Contents/Return in both PDF engines, then mixes all three controls in PDF.js and checks exact hit placement, rapid Next, no-hit history, source bytes, marks and reopening. Async controller coverage includes navigation rejection and source replacement. Independent code review found no actionable defects. Full suite evidence is recorded in the canonical SSOT receipt after completion.

### 9 September — Reader page browser

Pages moves Contents into an out-of-flow panel, with independently scrolling source-page thumbnails. Desktop retains the panel during navigation; mobile uses a native modal drawer, closes after a successful shared jump, then focuses the destination. A dirty note refuses navigation and retains the drawer. Escape/cancel returns focus to Pages without moving the document. Opening and closing do not reserve document width, change zoom or enlarge the toolbar.

A 200-page browser fixture checks exact scroll/canvas-width/chrome-height stability, viewport bounds and bounded thumbnail canvas allocation at either end of the list. Offscreen previews are zero-sized and removed; source and zoom replacement clear old previews. The focused journey also checks mobile navigation/focus, note recovery and a rotated source page. Initial runtime testing caught intrinsic dialog height expanding to the full 200-page list; an explicit viewport-derived height fixes actual scrolling. Independent review also caught hardcoded light backgrounds paired with dark-theme text; controls now use JETT theme tokens. The page image remains white. Source thumbnails exclude DOM annotation overlays and do not imply a reviewed export. Full gate and rendered receipt are recorded in the canonical SSOT after completion.

### 9 September — desktop docking and recovery

Desktop Pages now reserves a left gutter rather than hiding document text. Main owns opening and closing as queued layout transactions: capture page/offset, suppress transitional scroll capture, fit only in Fit width mode, preserve custom scale, then restore the reading place. Return remains unchanged. Failed rendering restores the old gutter, canvases/blocks, zoom/view and horizontal position; successful retry clears only the owned error. Mobile remains modal.

The focused browser journey holds a fit after new canvases are installed, leaves the Reader, and verifies stale completion does not dock/reopen it. It also injects history failure to verify exact original DOM/geometry rollback, checks page150 offset continuity and custom scale, and exercises dirty-note close refusal plus desktop-to-mobile invalidation. Responsive invalidation closes the old surface and clears the dock without discarding the note; guarded Fit can remain deferred. Contents tests wait for asynchronous opening and select bookmarks during a held restore through an already-open panel. Final independent review is clean; canonical receipt records the full test and rendered gates after completion.
