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
