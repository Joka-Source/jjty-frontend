//! Manual timing bench: match_update latency on a 200-block document.
//! Target: well under 1 ms per update.
//!
//! Run: cargo bench   (or: cargo run --release --bin ... not needed; this
//! is a cargo bench target with harness = false)

use std::time::Instant;

use jt_core::engine::MatchEngine;

/// Deterministic pseudo-word generator (no RNG deps).
fn word(seed: usize) -> String {
    const SYL: [&str; 16] = [
        "ta", "ri", "mon", "vel", "dor", "shi", "ka", "lun", "pre", "os", "gan", "ber", "il", "tor",
        "ne", "sa",
    ];
    let a = SYL[seed % 16];
    let b = SYL[(seed / 16) % 16];
    let c = SYL[(seed / 256) % 16];
    format!("{a}{b}{c}")
}

fn main() {
    // 200 blocks x 40 words = 8000 doc tokens.
    let blocks: Vec<String> = (0..200)
        .map(|b| {
            (0..40)
                .map(|w| word(b * 40 + w * 7 + 3))
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect();
    let mut engine = MatchEngine::new(&blocks);
    println!(
        "document: {} blocks, {} tokens",
        blocks.len(),
        engine.doc_token_count()
    );

    // Rolling transcripts sampled from different blocks, with a mutated
    // word to defeat the exact-match fast path now and then.
    let transcripts: Vec<String> = (0..50)
        .map(|i| {
            let b = (i * 37) % 200;
            let mut words: Vec<String> = (5..13).map(|w| word(b * 40 + w * 7 + 3)).collect();
            if i % 3 == 0 {
                let n = words.len();
                words[n / 2] = format!("{}x", words[n / 2]);
            }
            words.join(" ")
        })
        .collect();

    // Warm-up.
    let mut hits = 0usize;
    for t in &transcripts {
        if engine.update(t).is_some() {
            hits += 1;
        }
    }

    let iterations = 200usize;
    let mut total_ns: u128 = 0;
    let mut worst_ns: u128 = 0;
    let mut calls = 0usize;
    for _ in 0..iterations {
        for t in &transcripts {
            let start = Instant::now();
            let r = engine.update(t);
            let ns = start.elapsed().as_nanos();
            total_ns += ns;
            if ns > worst_ns {
                worst_ns = ns;
            }
            calls += 1;
            std::hint::black_box(r);
        }
    }

    let mean_us = total_ns as f64 / calls as f64 / 1000.0;
    println!("match_update: {calls} calls, {hits}/50 warm-up hits");
    println!("mean latency: {mean_us:.1} us/call");
    println!("worst latency: {:.1} us/call", worst_ns as f64 / 1000.0);
    println!(
        "target <1000 us: {}",
        if mean_us < 1000.0 { "PASS" } else { "FAIL" }
    );
}
