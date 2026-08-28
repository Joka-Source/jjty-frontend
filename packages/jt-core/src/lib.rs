//! jt-core: the deterministic portable kernel for jt.
//!
//! Modules:
//! - [`r#match`] — fuzzy two-anchor transcript-to-document matching
//!   (a faithful port of the reference JavaScript implementation).
//! - [`engine`] — stateful engine mapping a rolling transcript onto
//!   document blocks (block index + confidence).
//! - [`cursor`] — the record lifecycle state machine and serde types for
//!   the CursorRecord / ReceiptRecord wire formats defined in jt-contracts.
//! - [`ffi`] — C ABI surface (cdylib) suitable for Android JNI.
//! - [`wasm`] — wasm-bindgen surface for the web (wasm32 targets only).
//!
//! Determinism: all arithmetic is f64 with a fixed operation order, so the
//! same inputs produce bit-identical outputs on native, wasm32, and Android.

pub mod cursor;
pub mod engine;
pub mod r#match;

#[cfg(not(target_arch = "wasm32"))]
pub mod ffi;

#[cfg(target_arch = "wasm32")]
pub mod wasm;
