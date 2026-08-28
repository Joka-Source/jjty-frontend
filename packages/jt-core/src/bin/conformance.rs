//! Rust conformance runner: executes conformance/cases.json against the
//! jt-core matcher and prints results as JSON to stdout, in the same shape
//! as conformance/run_js.mjs so the two outputs can be diffed directly.
//! NaN is encoded as the string "NaN".
//!
//! Usage: cargo run --bin conformance [path/to/cases.json]

use std::collections::HashMap;

use jt_core::r#match::{find_match, match_transcript, normalize, token_similarity, tokenize, MatchOpts};
use serde_json::{json, Map, Value};

fn num(x: f64) -> Value {
    if x.is_nan() {
        Value::String("NaN".to_owned())
    } else {
        json!(x)
    }
}

fn match_out(m: Option<jt_core::r#match::MatchResult>) -> Value {
    match m {
        None => Value::Null,
        Some(m) => json!({"start": m.start, "end": m.end, "score": num(m.score)}),
    }
}

fn opts_from(v: Option<&Value>) -> MatchOpts {
    let mut o = MatchOpts::default();
    if let Some(Value::Object(map)) = v {
        if let Some(x) = map.get("minScore").and_then(Value::as_f64) {
            o.min_score = x;
        }
        if let Some(x) = map.get("anchorWeight").and_then(Value::as_f64) {
            o.anchor_weight = x;
        }
        if let Some(x) = map.get("proximityBonus").and_then(Value::as_f64) {
            o.proximity_bonus = x;
        }
        if let Some(x) = map.get("lastIndex").and_then(Value::as_i64) {
            o.last_index = Some(x);
        }
        if let Some(x) = map.get("windowSize").and_then(Value::as_u64) {
            o.window_size = x as usize;
        }
    }
    o
}

fn main() {
    let default_path = format!("{}/conformance/cases.json", env!("CARGO_MANIFEST_DIR"));
    let path = std::env::args().nth(1).unwrap_or(default_path);
    let spec: Value = serde_json::from_str(&std::fs::read_to_string(&path).expect("read cases"))
        .expect("parse cases");

    let mut doc_tokens: HashMap<String, Vec<String>> = HashMap::new();
    for (name, blocks) in spec["docs"].as_object().expect("docs") {
        let mut toks = Vec::new();
        for b in blocks.as_array().expect("blocks") {
            toks.extend(tokenize(b.as_str().expect("block string")));
        }
        doc_tokens.insert(name.clone(), toks);
    }

    let empty = Map::new();
    let mut results = Vec::new();
    for c in spec["cases"].as_array().expect("cases") {
        let c = c.as_object().unwrap_or(&empty);
        let kind = c.get("kind").and_then(Value::as_str).expect("kind");
        let out = match kind {
            "normalize" => json!(normalize(c["text"].as_str().expect("text"))),
            "tokenize" => json!(tokenize(c["text"].as_str().expect("text"))),
            "similarity" => num(token_similarity(
                c["a"].as_str().expect("a"),
                c["b"].as_str().expect("b"),
            )),
            "findMatch" => {
                let doc = &doc_tokens[c["doc"].as_str().expect("doc")];
                let spoken = tokenize(c["spoken"].as_str().expect("spoken"));
                match_out(find_match(doc, &spoken, &opts_from(c.get("opts"))))
            }
            "matchTranscript" => {
                let doc = &doc_tokens[c["doc"].as_str().expect("doc")];
                match_out(match_transcript(
                    doc,
                    c["transcript"].as_str().expect("transcript"),
                    &opts_from(c.get("opts")),
                ))
            }
            other => panic!("unknown kind {other}"),
        };
        results.push(out);
    }

    println!("{}", serde_json::to_string_pretty(&results).expect("serialize"));
}
