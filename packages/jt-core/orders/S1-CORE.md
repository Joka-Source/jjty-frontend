# Order S1-CORE

Sprint: 1.5 h. Mission: create the jt Rust core — the deterministic portable
kernel (founder-approved Rust framing). Compiles to WASM for web and exposes
a JNI-friendly C ABI for Android.

Scope shipped in this order:

1. **Fuzzy two-anchor matching engine** — semantics-faithful port of
   `jt-demo-voice-highlight/src/match.js` as `jt_core::match`
   (normalize / tokenize / token_similarity / find_match /
   match_transcript), plus a stateful `engine::MatchEngine` returning
   best block index + confidence for a rolling transcript.
   Conformance harness runs both implementations on shared JSON vectors
   (`conformance/cases.json`) and diffs outputs for exact f64 equality.
2. **Record lifecycle state machine** — `cursor::CursorState` with the ten
   wire states from `jt-contracts/schemas/cursor.schema.json` and an explicit
   legal-transition table; serde types `CursorRecord` / `ReceiptRecord`
   round-tripping the golden fixtures byte-semantically and rejecting the
   invalid fixtures (fixtures vendored under `tests/fixtures/`).
3. **Build targets** — (a) native `cargo test` green; (b)
   wasm32-unknown-unknown build with a JS-callable `wasm-bindgen` API
   (`Engine.match_update`, cursor lifecycle functions); (c) `#[no_mangle]
   extern "C"` cdylib surface documented in `src/ffi.rs`.
4. **Bench** — manual timing bench (`cargo bench`) on a 200-block document;
   target well under 1 ms per `match_update`.

Rules honoured: no invented product vocabulary in user-facing strings or
README; schema wire names only inside code and record formats. No remote
push — judge merges.

Proof of work: see `receipts/S1-CORE.md` for verbatim verify output.
