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
| Voice cursor and downstream actions | UNTESTED | Recover original prototype and compare matching, exact target, operation and undo. |
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
