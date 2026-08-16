# F-02 — end the `vendor/` copy-paste drift in jt-web

Repo/worktree: `/Users/apple/projects/wo/F-02-web-vendor`
Branch: `wo/f-02-web-vendor`  (base: `main` @ `35ac7dc`)

## Context
`jt-web/vendor/` contains ~57,600 LOC that are **copy-pasted clones** of five sibling repositories:
`jt-connectors`, `jt-core`, `jt-speech`, `jt-sync`, `jt-water` (plus `katex`, which is a genuine
third-party vendored dependency and is **out of scope**). Because they are copies, a fix in a sibling
repo never propagates, and nothing detects the drift. Meanwhile `jt-glass` is already wired correctly
as a real `file:../jt-glass` dependency — that is the pattern to follow.

The sibling repos live at `/Users/apple/projects/jt-connectors`, `/Users/apple/projects/jt-core`,
`/Users/apple/projects/jt-speech`, `/Users/apple/projects/jt-sync`, `/Users/apple/projects/jt-water`.

## Steps
1. For each of the five, compare `vendor/<name>` against the sibling repo's current `main` and
   **record the drift** — files added, removed, or modified in the vendored copy. This is the most
   important output of this order: if the vendored copy contains changes that never made it back
   upstream, they must be surfaced, not silently discarded.
2. Where the vendored copy is identical or trivially behind, replace it with a real dependency
   (`file:../..` style, matching the existing `jt-glass` wiring) and update imports.
3. Where the vendored copy has **diverged with real changes**, do NOT delete it and do NOT guess.
   Port the change into the sibling repo only if it is unambiguously a fix; otherwise leave that one
   package vendored, and list it in the receipt under "Open questions" with the exact diff summary.
4. `jt-core` is Rust→wasm. Its consumed artifact is a built `pkg/`. Keep whatever mechanism currently
   produces that artifact working; the goal is a single source of truth, not a rewrite of the build.
5. Leave `vendor/katex` exactly as it is.

## Verify
```
cd /Users/apple/projects/wo/F-02-web-vendor && npm ci && npm test; echo EXIT=$?
```
plus the wasm↔js parity suite specifically:
```
cd /Users/apple/projects/wo/F-02-web-vendor && npx vitest run test/parity.test.mjs; echo EXIT=$?
```
Read `package.json` for the true script names before running — use what exists, do not invent.
Every test that passed before this change must still pass. Paste the full summary lines.

## Done means
The full jt-web suite is green at the same or higher test count than before the change, the parity
suite is green, and the receipt names precisely which of the five packages became real dependencies
and which (if any) stayed vendored and why.

## Forbidden
- Do not change product behaviour. This is a dependency-wiring change only.
- Do not delete a diverged vendored file without recording its diff in the receipt.
- Do not touch `vendor/katex`.
- Do not modify tests to make them pass.
- Do not touch `main`. Commit only on this branch.

## Receipt
Write `receipts/F-02.md`: the drift table (package → identical / behind / diverged, with counts);
the test summary **before** your change (red/baseline gate, run it first and paste it); the test
summary after; commit SHA; open questions.

---

## Standing rules (inherited by every JT order)
1. **One order, one worktree, one branch.** Never work on `main` or any `agent/*` branch.
2. **A receipt with pasted verify output is the only proof that counts.** Show the baseline before
   the after. Paste real terminal output, never a summary of it. Include exit codes.
3. **Record failures verbatim.** If something does not work, the receipt says so with the exact
   error. Never smooth it over, never claim a tier of evidence you did not reach.
4. **Never stop early.** Self-resolve blockers to depth 2; if still blocked, write it in the receipt
   under "Open questions" and finish everything else in the order.
5. **Invent nothing.** No brand words, no taglines, no place names, no market claims, no invented
   commands or file paths. If a document or command does not exist, say so.
6. **Banned in anything user-facing:** `locus`, `settle`, `recede`, `receipt` (as a UI noun),
   `Margin` (as a product name), `QR`, and sea/drop/shell/bubble/island product nouns. The brand is
   lowercase `jt`. Internal code identifiers that already exist may stay; new UI copy must not use them.
7. **Commit the order file and the receipt alongside the work.** Do not push. The judge merges.
