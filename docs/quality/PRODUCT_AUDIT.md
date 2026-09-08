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
| PDF import and output parity | UNTESTED | Existing MuPDF adapter; capability matrix and real files required. |
| Markdown structure/source | PASS_LOCAL | Heading, quote and fenced code render; CRLF/BOM reading normalization; downloaded source bytes exactly match after reload. |
| Images | UNTESTED | Image intake/storage and source-preserving rendering remain to implement. |
| Accounts / self-hosted sync | UNTESTED | Existing relay prototype is not production identity or durable sync. |
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
