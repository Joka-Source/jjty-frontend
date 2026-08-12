# Receipt S1-CORE

Order: orders/S1-CORE.md. All commands below were run on this machine and
the output is pasted verbatim (build noise lines trimmed where marked).

Summary:
- cargo test: 30/30 green (23 unit + 7 fixture round-trip/rejection)
- conformance vs reference JS matcher: 34/34 cases bit-identical
  (exact f64 equality after JSON parse; diff tool exits non-zero on any drift)
- wasm: wasm-pack build --target web succeeded; pkg/ smoke-tested in Node
  (Engine.match_update, cursor lifecycle, fixture validation — output below)
- C ABI: cdylib builds; 9 jt_* symbols exported (nm output below)
- bench: mean 877 us/call on a 200-block / 8000-token document — under the
  1 ms target (initial naive port measured 8.6 ms; fixed by precomputed
  sorted bigrams + conservative anchor-bound pruning, output-identical,
  verified by the 500-case fuzz cross-check test and the conformance diff)

Blockers hit and self-resolved (depth <= 2):
1. No Rust toolchain on the machine -> brew install rustup + rustup
   toolchain install stable (one corrupted install from a timed-out
   background download; clean reinstall fixed it).
2. The reference bigrams() pads tokens with invisible U+0002/U+0003
   boundary markers (not visible when reading the file). Caught by the
   conformance diff; port corrected to match.

## Verbatim output

```
$ cargo --version && rustc --version
cargo 1.97.1 (c980f4866 2026-06-30)
rustc 1.97.1 (8bab26f4f 2026-07-14)

$ cargo test
     Running unittests src/lib.rs (target/debug/deps/jt_core-e50352a26e046915)

running 23 tests
test cursor::tests::transition_matrix_is_exactly_the_documented_one ... ok
test cursor::tests::ambiguity_repair_loop ... ok
test cursor::tests::illegal_transitions_rejected_without_mutation ... ok
test cursor::tests::full_forward_walk_is_legal ... ok
test cursor::tests::validate_rejects_bad_fields ... ok
test cursor::tests::wire_names_round_trip ... ok
test cursor::tests::receipt_digest_pattern ... ok
test ffi::tests::cursor_lifecycle_through_c_abi ... ok
test r#match::tests::find_match_finds_exact_phrase ... ok
test r#match::tests::find_match_respects_min_score ... ok
test ffi::tests::engine_round_trip_through_c_abi ... ok
test r#match::tests::find_match_absorbs_mishearing ... ok
test r#match::tests::match_transcript_windows_and_short_input ... ok
test engine::tests::majority_block_wins_on_straddle ... ok
test r#match::tests::normalize_apostrophe_scan_matches_js_global_regex ... ok
test engine::tests::tolerates_mishearing ... ok
test engine::tests::rejects_unrelated_speech ... ok
test engine::tests::follows_speech_through_blocks ... ok
test r#match::tests::similarity_edges ... ok
test r#match::tests::proximity_bonus_prefers_nearby_repeat ... ok
test r#match::tests::tokenize_empty ... ok
test r#match::tests::normalize_basics ... ok
test r#match::tests::pruned_search_identical_to_reference_scan ... ok

test result: ok. 23 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.06s

     Running unittests src/bin/conformance.rs (target/debug/deps/conformance-5b6513ca5fca7ee4)

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

     Running tests/fixture_roundtrip.rs (target/debug/deps/fixture_roundtrip-8413ce418f4ee5d9)

running 7 tests
test invalid_receipt_rejected ... ok
test unknown_fields_rejected ... ok
test cursor_minimal_roundtrip ... ok
test invalid_cursor_rejected ... ok
test receipt_minimal_roundtrip ... ok
test cursor_full_roundtrip ... ok
test receipt_full_roundtrip ... ok

test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

   Doc-tests jt_core

running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s


$ node conformance/run_js.mjs > conformance/js_out.json
$ cargo run --release --bin conformance > conformance/rs_out.json
$ node conformance/diff.mjs conformance/js_out.json conformance/rs_out.json
CONFORMANCE OK: 34/34 cases identical

$ cargo bench
document: 200 blocks, 8000 tokens
match_update: 10000 calls, 50/50 warm-up hits
mean latency: 876.8 us/call
worst latency: 3756.9 us/call
target <1000 us: PASS

$ wasm-pack build --target web  (already built; artifact check)
-rw-r--r--@ 1 apple  staff   13740 Aug 12 16:34 pkg/jt_core.js
-rw-r--r--@ 1 apple  staff  333170 Aug 12 16:35 pkg/jt_core_bg.wasm

$ cargo build --release && nm -gU target/release/libjt_core.dylib | grep jt_
    Finished `release` profile [optimized] target(s) in 0.02s
0000000000014f90 T _jt_cursor_new
00000000000150e8 T _jt_cursor_transition
000000000001529c T _jt_cursor_validate
0000000000015360 T _jt_engine_free
0000000000015394 T _jt_engine_new
0000000000015560 T _jt_engine_reset_position
000000000001556c T _jt_engine_update
00000000000157d0 T _jt_receipt_validate
0000000000015a48 T _jt_string_free
```

## wasm smoke test (Node, pkg/ from wasm-pack build --target web)

```
$ node --input-type=module -e "... initSync + Engine + cursor fns ..."
match: {"blockIndex":1,"confidence":1,"tokenStart":9,"tokenEnd":14}
no-match: null
cursor state ok: true valid: true
legal from candidate: ["settlement","ambiguity","acquisition","rest"]
illegal rejected: illegal transition invitation -> durable-result
receipt fixture valid: true
```

## Vocabulary check

```
$ grep -inE "margin|locus|\bQR\b|\bsea\b|drops|shells" README.md orders/S1-CORE.md || echo VOCAB CLEAN
VOCAB CLEAN
```
