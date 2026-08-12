//! C ABI surface for jt-core (cdylib), suitable for Android JNI bridging.
//!
//! =========================== ABI CONTRACT ===========================
//! Conventions
//! - All strings are NUL-terminated UTF-8 (`const char *` in C).
//! - Any `char *` RETURNED by this library is owned by the caller and MUST
//!   be released with `jt_string_free`. Never free it with `free()`.
//! - NULL return means "no result" or "error"; functions never abort.
//! - Handles (`JtEngine *`) are opaque; release with `jt_engine_free`.
//!   Handles are not thread-safe; confine each to one thread or lock.
//!
//! Functions
//! - JtEngine *jt_engine_new(const char *blocks_json);
//!       blocks_json: JSON array of document block strings, in order.
//!       Returns NULL on parse failure.
//! - char *jt_engine_update(JtEngine *, const char *transcript);
//!       Feed the rolling transcript. Returns JSON
//!       {"blockIndex":u32,"confidence":f64,"tokenStart":u32,"tokenEnd":u32}
//!       or NULL when no window clears the score floor.
//! - void jt_engine_reset_position(JtEngine *);
//! - void jt_engine_free(JtEngine *);
//! - char *jt_cursor_new(const char *id, const char *anchor_id,
//!                       const char *source_id);
//!       Returns a fresh CursorRecord as JSON (state "rest").
//! - char *jt_cursor_transition(const char *cursor_json,
//!                              const char *next_state,
//!                              const char *at_iso8601_or_null);
//!       Applies one legal state change; returns the updated record as
//!       JSON, or NULL if the record is invalid or the move is illegal.
//! - int jt_cursor_validate(const char *cursor_json);   // 1 valid, 0 not
//! - int jt_receipt_validate(const char *receipt_json); // 1 valid, 0 not
//! - void jt_string_free(char *);
//! ====================================================================

use std::ffi::{c_char, CStr, CString};

use crate::cursor::{CursorRecord, CursorState, ReceiptRecord};
use crate::engine::MatchEngine;

/// Opaque engine handle for C callers.
pub struct JtEngine(MatchEngine);

unsafe fn cstr<'a>(p: *const c_char) -> Option<&'a str> {
    if p.is_null() {
        return None;
    }
    CStr::from_ptr(p).to_str().ok()
}

fn out_string(s: String) -> *mut c_char {
    match CString::new(s) {
        Ok(c) => c.into_raw(),
        Err(_) => std::ptr::null_mut(),
    }
}

/// # Safety
/// `blocks_json` must be a valid NUL-terminated UTF-8 string or NULL.
#[no_mangle]
pub unsafe extern "C" fn jt_engine_new(blocks_json: *const c_char) -> *mut JtEngine {
    let Some(s) = cstr(blocks_json) else {
        return std::ptr::null_mut();
    };
    let Ok(blocks) = serde_json::from_str::<Vec<String>>(s) else {
        return std::ptr::null_mut();
    };
    Box::into_raw(Box::new(JtEngine(MatchEngine::new(&blocks))))
}

/// # Safety
/// `engine` must come from `jt_engine_new`; `transcript` as in `jt_engine_new`.
#[no_mangle]
pub unsafe extern "C" fn jt_engine_update(engine: *mut JtEngine, transcript: *const c_char) -> *mut c_char {
    if engine.is_null() {
        return std::ptr::null_mut();
    }
    let Some(text) = cstr(transcript) else {
        return std::ptr::null_mut();
    };
    match (*engine).0.update(text) {
        Some(m) => out_string(format!(
            "{{\"blockIndex\":{},\"confidence\":{},\"tokenStart\":{},\"tokenEnd\":{}}}",
            m.block_index,
            serde_json::to_string(&m.confidence).unwrap_or_else(|_| "null".into()),
            m.token_start,
            m.token_end
        )),
        None => std::ptr::null_mut(),
    }
}

/// # Safety
/// `engine` must come from `jt_engine_new` or be NULL.
#[no_mangle]
pub unsafe extern "C" fn jt_engine_reset_position(engine: *mut JtEngine) {
    if !engine.is_null() {
        (*engine).0.reset_position();
    }
}

/// # Safety
/// `engine` must come from `jt_engine_new` and not be used afterwards.
#[no_mangle]
pub unsafe extern "C" fn jt_engine_free(engine: *mut JtEngine) {
    if !engine.is_null() {
        drop(Box::from_raw(engine));
    }
}

/// # Safety
/// All pointers must be valid NUL-terminated UTF-8 strings.
#[no_mangle]
pub unsafe extern "C" fn jt_cursor_new(
    id: *const c_char,
    anchor_id: *const c_char,
    source_id: *const c_char,
) -> *mut c_char {
    let (Some(id), Some(anchor), Some(source)) = (cstr(id), cstr(anchor_id), cstr(source_id)) else {
        return std::ptr::null_mut();
    };
    let rec = CursorRecord::new(id, anchor, source);
    if rec.validate().is_err() {
        return std::ptr::null_mut();
    }
    out_string(rec.to_json())
}

/// # Safety
/// `cursor_json` and `next_state` must be valid strings; `at` may be NULL.
#[no_mangle]
pub unsafe extern "C" fn jt_cursor_transition(
    cursor_json: *const c_char,
    next_state: *const c_char,
    at: *const c_char,
) -> *mut c_char {
    let (Some(json), Some(next)) = (cstr(cursor_json), cstr(next_state)) else {
        return std::ptr::null_mut();
    };
    let Some(next) = CursorState::from_wire_name(next) else {
        return std::ptr::null_mut();
    };
    let Ok(mut rec) = CursorRecord::from_json(json) else {
        return std::ptr::null_mut();
    };
    if rec.transition(next, cstr(at)).is_err() {
        return std::ptr::null_mut();
    }
    out_string(rec.to_json())
}

/// # Safety
/// `cursor_json` must be a valid NUL-terminated UTF-8 string or NULL.
#[no_mangle]
pub unsafe extern "C" fn jt_cursor_validate(cursor_json: *const c_char) -> i32 {
    match cstr(cursor_json) {
        Some(s) => CursorRecord::from_json(s).is_ok() as i32,
        None => 0,
    }
}

/// # Safety
/// `receipt_json` must be a valid NUL-terminated UTF-8 string or NULL.
#[no_mangle]
pub unsafe extern "C" fn jt_receipt_validate(receipt_json: *const c_char) -> i32 {
    match cstr(receipt_json) {
        Some(s) => ReceiptRecord::from_json(s).is_ok() as i32,
        None => 0,
    }
}

/// # Safety
/// `s` must be a pointer previously returned by this library, or NULL.
#[no_mangle]
pub unsafe extern "C" fn jt_string_free(s: *mut c_char) {
    if !s.is_null() {
        drop(CString::from_raw(s));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::CString;

    fn c(s: &str) -> CString {
        CString::new(s).unwrap()
    }

    #[test]
    fn engine_round_trip_through_c_abi() {
        unsafe {
            let blocks = c(r#"["the quick brown fox jumps over the lazy dog","pack my box with five dozen liquor jugs"]"#);
            let e = jt_engine_new(blocks.as_ptr());
            assert!(!e.is_null());
            let t = c("pack my box with five dozen");
            let out = jt_engine_update(e, t.as_ptr());
            assert!(!out.is_null());
            let s = CStr::from_ptr(out).to_str().unwrap().to_owned();
            assert!(s.contains("\"blockIndex\":1"), "{s}");
            jt_string_free(out);
            let bad = c("zzz");
            assert!(jt_engine_update(e, bad.as_ptr()).is_null());
            jt_engine_free(e);
        }
    }

    #[test]
    fn cursor_lifecycle_through_c_abi() {
        unsafe {
            let out = jt_cursor_new(c("cur-1").as_ptr(), c("anc-1").as_ptr(), c("src-1").as_ptr());
            assert!(!out.is_null());
            let json = CStr::from_ptr(out).to_str().unwrap().to_owned();
            jt_string_free(out);
            assert_eq!(jt_cursor_validate(c(&json).as_ptr()), 1);
            let stepped = jt_cursor_transition(
                c(&json).as_ptr(),
                c("invitation").as_ptr(),
                c("2026-08-11T00:00:00Z").as_ptr(),
            );
            assert!(!stepped.is_null());
            let stepped_json = CStr::from_ptr(stepped).to_str().unwrap().to_owned();
            jt_string_free(stepped);
            assert!(stepped_json.contains("\"state\":\"invitation\""));
            // Illegal jump refused.
            assert!(jt_cursor_transition(
                c(&json).as_ptr(),
                c("durable-result").as_ptr(),
                std::ptr::null()
            )
            .is_null());
        }
    }
}
