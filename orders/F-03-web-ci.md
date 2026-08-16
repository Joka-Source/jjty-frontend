# F-03 — real CI for jt-web, plus the banned-vocabulary gate

Repo/worktree: `/Users/apple/projects/wo/F-03-web-ci`
Branch: `wo/f-03-web-ci`  (base: `main` @ `35ac7dc`)

## Context
`jt-web` has 23 test files including 7 real-Chrome e2e suites — and **no CI whatsoever** (`.github/`
does not exist). Every "tests green" claim in this project's history is a claim about somebody's
laptop on some day. This order makes green mean something.

The e2e suites drive headless Chrome through `puppeteer-core` against the local Chrome install. On a
GitHub runner there is no `/Applications/Google Chrome.app`, so the workflow must supply a browser
(`browser-actions/setup-chrome` or puppeteer's own download) and point the suites at it via whatever
env var the repo already reads. **Read `test/` and `package.json` first to find the real mechanism.**

The repo also ships a `?sim=1` micless scripted-replay path specifically so voice can be tested
without a microphone — that is what CI should exercise, not live speech.

## Steps
1. Add `.github/workflows/ci.yml` running on pull requests and pushes to `main`:
   - Node 24 (match the local `v24.13.1`), `npm ci`
   - the unit suite
   - the headless-Chrome e2e suites, with a browser provisioned on the runner
   - the wasm↔js parity suite
   - the vocabulary gate (below)
   - a production `vite build`
2. Add `scripts/check-vocabulary.mjs` — a grep gate over **user-facing strings only** (UI copy,
   HTML, page text, the marketing surface), failing the build on: `locus`, `settle`, `recede`,
   `receipt` used as a user-visible noun, `Margin` as a product name, `QR`, and the product nouns
   `sea`, `drop`, `shell`, `bubble`, `island`. It must NOT flag internal identifiers, existing module
   names, test fixtures, or documentation that discusses the ban. Provide an explicit allowlist file
   with a comment for each entry. Wire it as an npm script.
3. If the e2e suites cannot be made to run on a hosted runner within this order, still land the
   unit + parity + vocabulary + build lanes, and record the e2e blocker precisely in the receipt.
   A partial CI that actually runs beats a complete CI that does not.

## Verify
Locally, every lane the workflow runs must pass:
```
cd /Users/apple/projects/wo/F-03-web-ci && npm ci && npm test && node scripts/check-vocabulary.mjs && npx vite build; echo EXIT=$?
```
Then prove the gate can fail — temporarily introduce a banned word in a user-facing string, show
`check-vocabulary.mjs` exiting non-zero with the offending file and line, then revert it. **This red
gate is mandatory; a gate never seen to fail is not a gate.**

Then prove CI actually runs: push this branch and open a draft PR with `gh` (the CLI is authenticated
as `TrueKrishna` with `workflow` scope), and paste `gh run list` / `gh run view` output showing the
workflow's real conclusion. If a lane fails on the runner, fix it or record it — do not disable it
silently.

## Done means
A workflow file exists, the vocabulary gate has been demonstrated both failing and passing, and the
receipt contains a real GitHub Actions run conclusion for this branch.

## Forbidden
- Do not modify product source in `src/` except where CI provably requires it (and say so).
- Do not weaken, skip, or delete an existing test to get green.
- Do not merge the PR. Leave it as a draft for the judge.
- Do not touch `main` directly.

## Receipt
Write `receipts/F-03.md`: the local lane output; the vocabulary gate failing (verbatim) then passing;
the PR URL and the `gh run view` conclusion; commit SHA; open questions.

---

## Standing rules (inherited by every JT order)
1. **One order, one worktree, one branch.** Never work on `main` or any `agent/*` branch.
2. **A receipt with pasted verify output is the only proof that counts.** Show the red gate before
   the green one. Paste real terminal output, never a summary of it. Include exit codes.
3. **Record failures verbatim.** If something does not work, the receipt says so with the exact
   error. Never smooth it over, never claim a tier of evidence you did not reach.
4. **Never stop early.** Self-resolve blockers to depth 2; if still blocked, write it in the receipt
   under "Open questions" and finish everything else in the order.
5. **Invent nothing.** No brand words, no taglines, no place names, no market claims, no invented
   commands or file paths. If a document or command does not exist, say so.
6. **Banned in anything user-facing:** `locus`, `settle`, `recede`, `receipt` (as a UI noun),
   `Margin` (as a product name), `QR`, and sea/drop/shell/bubble/island product nouns. The brand is
   lowercase `jt`. Internal code identifiers that already exist may stay; new UI copy must not use them.
7. **Commit the order file and the receipt alongside the work.** The judge merges.
