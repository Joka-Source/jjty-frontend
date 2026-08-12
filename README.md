# jt-core

The deterministic portable kernel for jt. Pure Rust, no I/O, no clocks, no
randomness: the same inputs produce bit-identical outputs on every platform.
It compiles three ways from one codebase:

- **native** (`rlib`) — used by tests, benches, and future desktop hosts
- **wasm32** via `wasm-bindgen` — the web build
- **cdylib with a C ABI** — ready for Android JNI bridging

## What's inside

| Module | Purpose |
|---|---|
| `match` | Fuzzy two-anchor matcher: maps a window of spoken words onto a document's token stream. Port of the reference JS implementation with bit-identical f64 results. |
| `engine` | Stateful engine over a block list: feed a rolling transcript, get back the best-matching block index and a confidence score. |
| `cursor` | Record lifecycle state machine and serde types for the CursorRecord / ReceiptRecord wire formats defined in [jt-contracts]. State names are internal wire names, never shown to people. |
| `ffi` | `#[no_mangle] extern "C"` surface; the ABI contract is documented at the top of `src/ffi.rs`. |
| `wasm` | `wasm-bindgen` surface: `Engine.match_update(transcript)`, cursor lifecycle functions. |

[jt-contracts]: /Users/apple/projects/jt-contracts

## The matcher, in one paragraph

The first and last words of the latest speech window are weighted as anchors;
interior words tolerate speech-recognition slips through character-bigram
similarity (Sorensen-Dice). Every window of document tokens is scored, a
small proximity bonus resolves repeated phrases to the occurrence nearest the
reader's last position, and nothing below the score floor is reported at all.

## Verify

```sh
cargo test                       # unit + fixture round-trip tests
cargo bench                      # 200-block latency check (<1 ms target)

# Conformance against the reference JS matcher (identical outputs):
node conformance/run_js.mjs > /tmp/js_out.json
cargo run --release --bin conformance > /tmp/rs_out.json
node conformance/diff.mjs /tmp/js_out.json /tmp/rs_out.json

# Web build:
wasm-pack build --target web     # or: cargo build --target wasm32-unknown-unknown
```

The golden record fixtures in `tests/fixtures/` are vendored verbatim from
`jt-contracts/fixtures/` (v0.1.0); valid ones must round-trip semantically
unchanged, invalid ones must be rejected.

## Determinism notes

- All scoring is `f64` with a fixed operation order, matching the reference
  JS implementation exactly (boundary-padded character bigrams included).
- The kernel never reads time, environment, or randomness; timestamps in
  records are supplied by the caller.
