# I-01 — integrate F-03 (CI) onto F-02 (real dependencies)

Repo/worktree: `/Users/apple/projects/wo/I-01-integrate`
Branch: `wo/i-01-integrate`  (base: `main` @ `5afc305`)

## Context
Two accepted orders touched dependency wiring from the same base and now conflict:

- **F-02** (already merged, `main` @ `5afc305`) replaced the copy-pasted `vendor/jt-connectors`,
  `vendor/jt-core`, `vendor/jt-sync` and `vendor/jt-water` with **real local dependencies**.
  `vendor/jt-speech` was deliberately kept vendored because it carries 3 genuinely diverged files
  that were never ported upstream. `vendor/katex` is untouched. Judge-verified at 75/75 including
  browser e2e against real Chrome.
- **F-03** (branch `wo/f-03-web-ci`, head `324b711`) added the project's first CI workflow, a
  `scripts/check-vocabulary.mjs` banned-vocabulary gate, and the devDependencies its hosted lanes
  need. Judge-verified: GitHub Actions run 31979169951 succeeded with 61 unit + 2 parity + 14 browser
  e2e + 1 sync e2e, and the gate was proven to fail on injected banned words and pass when restored.

`git merge wo/f-03-web-ci` into `main` conflicts in **`package.json`** and **`package-lock.json`**.
Both changes are wanted. Neither may be dropped.

## Steps
1. Merge `wo/f-03-web-ci` into this branch and resolve the conflicts so that **both** intents survive:
   F-02's real local dependency wiring **and** F-03's CI devDependencies and scripts.
2. Regenerate `package-lock.json` properly from the resolved `package.json` rather than hand-editing
   the lockfile. The lockfile must be internally consistent and installable from clean.
3. Confirm `vendor/jt-speech` and `vendor/katex` are still present and unchanged, and that the four
   de-vendored packages are still resolved as real dependencies — not silently restored to copies.
4. Confirm the CI workflow and the vocabulary gate both survive the merge intact.

## Verify
From clean, paste every line verbatim:
```
cd /Users/apple/projects/wo/I-01-integrate
rm -rf node_modules && npm ci; echo CI_EXIT=$?
npm test; echo TEST_EXIT=$?
node scripts/check-vocabulary.mjs; echo GATE_EXIT=$?
npx vite build; echo BUILD_EXIT=$?
```
The full suite must be green at **no fewer than 75 tests**. Then prove the gate still bites: inject a
banned term into a user-facing string, show `check-vocabulary.mjs` exiting 1 with file and line,
revert it, and show it exiting 0 again. Paste both.

Chrome is at `/Applications/Google Chrome.app`. If Chrome will not launch in your sandbox, run the
non-browser suite and state plainly which cases you could not execute — do not claim them.

## Done means
One branch carrying both changes, installing from clean, full suite green at ≥75, vocabulary gate
proven to both fail and pass, and production build succeeding.

## Forbidden
- Do not drop either side of the conflict to make it easy.
- Do not re-vendor any of the four de-vendored packages.
- Do not delete or modify `vendor/jt-speech` or `vendor/katex`.
- Do not hand-edit `package-lock.json`; regenerate it.
- Do not weaken, skip or delete a test to get green.
- Do not push. Do not touch `main`.

## Receipt
`receipts/I-01.md`: exactly how each conflicting hunk was resolved and why; the verbatim clean-install,
test, gate and build output; the gate failing then passing; confirmation that jt-speech and katex are
intact; commit SHA; open questions.

---

## Standing rules
1. One order, one worktree, one branch. Never work on `main`.
2. A receipt with pasted verify output is the only proof that counts. Red gate before green gate.
3. Record failures verbatim; never claim a tier of evidence you did not reach.
4. Never stop early. Self-resolve blockers to depth 2, then record under "Open questions" and finish
   everything else.
5. Invent nothing.
6. Commit the order file and the receipt alongside the work. Do not push. The judge merges.
