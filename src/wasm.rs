//! wasm-bindgen surface for the web build (wasm32-unknown-unknown).
//!
//! JS-callable API:
//! ```js
//! const engine = new Engine(JSON.stringify(["block one ...", "block two ..."]));
//! const hit = engine.match_update("rolling transcript so far");
//! // hit: {blockIndex, confidence, tokenStart, tokenEnd} or null
//!
//! let cur = cursor_new("cur-1", "anc-1", "src-1");        // JSON string
//! cur = cursor_transition(cur, "invitation", "2026-08-11T00:00:00Z");
//! cursor_validate(cur);   // boolean
//! receipt_validate(json); // boolean
//! cursor_states();        // JSON array of wire names
//! cursor_legal_transitions("candidate"); // JSON array of wire names
//! ```

use wasm_bindgen::prelude::*;

use crate::cursor::{CursorRecord, CursorState, ReceiptRecord};
use crate::engine::MatchEngine;

#[wasm_bindgen]
pub struct Engine {
    inner: MatchEngine,
}

#[wasm_bindgen]
impl Engine {
    /// `blocks_json`: JSON array of document block strings, in order.
    #[wasm_bindgen(constructor)]
    pub fn new(blocks_json: &str) -> Result<Engine, JsError> {
        let blocks: Vec<String> =
            serde_json::from_str(blocks_json).map_err(|e| JsError::new(&format!("blocks_json: {e}")))?;
        Ok(Engine {
            inner: MatchEngine::new(&blocks),
        })
    }

    /// Feed the rolling transcript; returns
    /// `{blockIndex, confidence, tokenStart, tokenEnd}` or `null`.
    pub fn match_update(&mut self, transcript: &str) -> JsValue {
        match self.inner.update(transcript) {
            Some(m) => {
                let obj = js_sys::Object::new();
                let _ = js_sys::Reflect::set(&obj, &"blockIndex".into(), &(m.block_index as u32).into());
                let _ = js_sys::Reflect::set(&obj, &"confidence".into(), &m.confidence.into());
                let _ = js_sys::Reflect::set(&obj, &"tokenStart".into(), &(m.token_start as u32).into());
                let _ = js_sys::Reflect::set(&obj, &"tokenEnd".into(), &(m.token_end as u32).into());
                obj.into()
            }
            None => JsValue::NULL,
        }
    }

    /// Forget the previous match position (e.g. the reader jumped).
    pub fn reset_position(&mut self) {
        self.inner.reset_position();
    }

    pub fn doc_token_count(&self) -> u32 {
        self.inner.doc_token_count() as u32
    }
}

/// A fresh CursorRecord as JSON, in state "rest".
#[wasm_bindgen]
pub fn cursor_new(id: &str, anchor_id: &str, source_id: &str) -> Result<String, JsError> {
    let rec = CursorRecord::new(id, anchor_id, source_id);
    rec.validate().map_err(|e| JsError::new(&e.to_string()))?;
    Ok(rec.to_json())
}

/// Apply one legal state change; returns the updated record as JSON.
#[wasm_bindgen]
pub fn cursor_transition(cursor_json: &str, next_state: &str, at: Option<String>) -> Result<String, JsError> {
    let next =
        CursorState::from_wire_name(next_state).ok_or_else(|| JsError::new(&format!("unknown state {next_state:?}")))?;
    let mut rec = CursorRecord::from_json(cursor_json).map_err(|e| JsError::new(&e.to_string()))?;
    rec.transition(next, at.as_deref())
        .map_err(|e| JsError::new(&e.to_string()))?;
    Ok(rec.to_json())
}

#[wasm_bindgen]
pub fn cursor_validate(cursor_json: &str) -> bool {
    CursorRecord::from_json(cursor_json).is_ok()
}

#[wasm_bindgen]
pub fn receipt_validate(receipt_json: &str) -> bool {
    ReceiptRecord::from_json(receipt_json).is_ok()
}

/// All lifecycle wire names, as a JSON array.
#[wasm_bindgen]
pub fn cursor_states() -> String {
    let names: Vec<&str> = CursorState::ALL.iter().map(|s| s.wire_name()).collect();
    serde_json::to_string(&names).expect("serializes")
}

/// Legal next states for `state`, as a JSON array of wire names.
#[wasm_bindgen]
pub fn cursor_legal_transitions(state: &str) -> Result<String, JsError> {
    let s = CursorState::from_wire_name(state).ok_or_else(|| JsError::new(&format!("unknown state {state:?}")))?;
    let names: Vec<&str> = s.legal_transitions().iter().map(|s| s.wire_name()).collect();
    Ok(serde_json::to_string(&names).expect("serializes"))
}
