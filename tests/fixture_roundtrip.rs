//! Round-trips the golden fixtures from jt-contracts byte-semantically:
//! fixture JSON -> typed record -> JSON must be semantically identical to
//! the original (same fields, same values; key order is not significant in
//! JSON). Invalid fixtures must be rejected.
//!
//! Fixtures are vendored verbatim from jt-contracts/fixtures/ (v0.1.0).

use jt_core::cursor::{CursorRecord, ReceiptRecord};
use serde_json::Value;

fn fixture(rel: &str) -> String {
    let path = format!("{}/tests/fixtures/{rel}", env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {path}: {e}"))
}

fn assert_semantic_roundtrip_cursor(rel: &str) {
    let raw = fixture(rel);
    let rec = CursorRecord::from_json(&raw).unwrap_or_else(|e| panic!("{rel} should parse: {e}"));
    let back: Value = serde_json::from_str(&rec.to_json()).unwrap();
    let original: Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(back, original, "{rel} round-trip drifted");
}

fn assert_semantic_roundtrip_receipt(rel: &str) {
    let raw = fixture(rel);
    let rec = ReceiptRecord::from_json(&raw).unwrap_or_else(|e| panic!("{rel} should parse: {e}"));
    let back: Value = serde_json::from_str(&rec.to_json()).unwrap();
    let original: Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(back, original, "{rel} round-trip drifted");
}

#[test]
fn cursor_full_roundtrip() {
    assert_semantic_roundtrip_cursor("cursor/full.json");
}

#[test]
fn cursor_minimal_roundtrip() {
    assert_semantic_roundtrip_cursor("cursor/minimal.json");
}

#[test]
fn receipt_full_roundtrip() {
    assert_semantic_roundtrip_receipt("receipt/full.json");
}

#[test]
fn receipt_minimal_roundtrip() {
    assert_semantic_roundtrip_receipt("receipt/minimal.json");
}

#[test]
fn invalid_cursor_rejected() {
    let raw = fixture("invalid/cursor.json");
    assert!(
        CursorRecord::from_json(&raw).is_err(),
        "invalid/cursor.json (state \"floating\") must be rejected"
    );
}

#[test]
fn invalid_receipt_rejected() {
    let raw = fixture("invalid/receipt.json");
    assert!(
        ReceiptRecord::from_json(&raw).is_err(),
        "invalid/receipt.json (arrival \"probably-fine\") must be rejected"
    );
}

#[test]
fn unknown_fields_rejected() {
    // additionalProperties: false in both schemas.
    let raw = fixture("cursor/minimal.json").replace(
        "\"state\": \"rest\"",
        "\"state\": \"rest\", \"surprise\": true",
    );
    assert!(CursorRecord::from_json(&raw).is_err());
}
