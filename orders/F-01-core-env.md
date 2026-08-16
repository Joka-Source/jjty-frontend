# F-01 — jt-core builds from a fresh login shell

Repo/worktree: `/Users/apple/projects/wo/F-01-core-env`
Branch: `wo/f-01-core-env`  (base: `main` @ `96cb9b0`)

## Context
`jt-core` is the Rust matching kernel (rlib + cdylib + wasm32), already built and passing 30 tests
with 34/34 JS conformance. But **`cargo` and `rustc` are not on PATH in a fresh login shell** on this
Mac — the toolchain lives at `~/.rustup/toolchains/stable-aarch64-apple-darwin/bin/` and `~/.cargo/bin`
does not exist. Every documented build command in this repo therefore fails for a new session or CI
runner. This order makes the repo self-bootstrapping. It changes no Rust source.

## Steps
1. Add `scripts/env.sh` — POSIX-sh, safe to `source` repeatedly, no side effects beyond exports.
   It must locate the Rust toolchain robustly: prefer `rustup which cargo` if `rustup` is on PATH,
   else fall back to `$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin`, else `$HOME/.cargo/bin`.
   Export `PATH` accordingly. Print nothing on success. Exit non-zero with a clear message if no
   toolchain can be found.
2. Add `scripts/verify.sh` that sources `scripts/env.sh`, then runs the repo's real verification:
   `cargo test`, the wasm build, and the JS-conformance runner exactly as the repo already defines
   them. Read `README.md`, `Cargo.toml`, and any existing scripts to find the true commands — do not
   invent commands that do not exist.
3. Document both in `README.md` under a short "Build from a fresh shell" heading.

## Verify
Run each of these from a **fresh login shell** and paste the output verbatim:
```
zsh -lc 'cd /Users/apple/projects/wo/F-01-core-env && ./scripts/verify.sh; echo EXIT=$?'
```
The exit code must be `0` and the cargo test summary must show the tests actually running.

## Done means
`scripts/verify.sh` exits 0 from a fresh login shell with no manually pre-set environment, and the
receipt contains the verbatim output including the test counts.

## Forbidden
- Do not modify any `.rs` source, `Cargo.toml` dependencies, or the conformance fixtures.
- Do not `rustup install`, `rustup default`, or otherwise mutate the global toolchain.
- Do not add new dependencies.
- Do not touch `main`. Commit only on this branch.

## Receipt
Write `receipts/F-01.md` containing: what changed; the **failing** output first (run
`env -i zsh -lc 'cd <worktree> && cargo test'` or equivalent to demonstrate the problem this order
fixes — the red gate); then the verbatim passing output; the commit SHA; and any open questions.
Commit the order file and the receipt together with the work.

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
7. **Commit the order file and the receipt alongside the work.** Do not push. The judge merges.
