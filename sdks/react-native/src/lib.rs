//! React Native JSI — C FFI layer for Checkgate.
//!
//! These `extern "C"` functions are the Rust side of the JSI bridge.
//! The C++ JSI host (`SidekickJSI.cpp`) calls them synchronously
//! via the generated `checkgate_core.h` header.
//!
//! A global `FlagStore` singleton is used because C FFI functions are
//! stateless — the JS side holds no Rust handles.
//!
//! ## Performance API
//!
//! For hot paths (evaluating multiple flags for the same user), use the context
//! API to parse user attributes **once** and reuse the handle across calls:
//!
//! ```c
//! CheckgateContext* ctx = checkgate_make_context("user-123", "{\"plan\":\"pro\"}");
//! int flag_a = checkgate_is_enabled_ctx("feature-a", ctx);
//! int flag_b = checkgate_is_enabled_ctx("feature-b", ctx);
//! checkgate_free_context(ctx);
//! ```

use checkgate_core::evaluator::{evaluate, Flag, TargetingRule, UserContext};
use checkgate_core::store::FlagStore;
use std::collections::HashMap;
use std::ffi::{c_char, CStr};
use std::sync::LazyLock;

static STORE: LazyLock<FlagStore> = LazyLock::new(FlagStore::new);

/// Opaque handle holding a pre-parsed user context.
/// Obtain via `checkgate_make_context`, release via `checkgate_free_context`.
pub struct CheckgateContext {
    inner: UserContext,
}

/// Upsert a flag into the in-memory store.
///
/// # Arguments
/// - `key` — null-terminated flag key
/// - `is_enabled` — global kill-switch
/// - `rollout_percentage` — 0-100, or -1 to mean "no rollout limit" (100%)
/// - `rules_json` — null-terminated JSON array of targeting rules.
///   Pass `"[]"` or NULL when there are no rules.
///
/// # Safety
/// All pointer arguments must be valid, non-dangling, null-terminated C strings.
#[no_mangle]
pub unsafe extern "C" fn checkgate_upsert_flag(
    key: *const c_char,
    is_enabled: bool,
    rollout_percentage: i32,
    rules_json: *const c_char,
) {
    let key = unsafe { CStr::from_ptr(key) }
        .to_string_lossy()
        .into_owned();

    let rules: Vec<TargetingRule> = if !rules_json.is_null() {
        let json = unsafe { CStr::from_ptr(rules_json) }.to_string_lossy();
        serde_json::from_str(&json).unwrap_or_default()
    } else {
        vec![]
    };

    let rollout = if rollout_percentage < 0 {
        None
    } else {
        Some(rollout_percentage.min(100) as u32)
    };

    STORE.upsert_flag(Flag {
        key,
        is_enabled,
        rollout_percentage: rollout,
        description: None,
        rules,
    });
}

/// Remove a flag from the in-memory store.
///
/// # Safety
/// `key` must be a valid, non-dangling, null-terminated C string.
#[no_mangle]
pub unsafe extern "C" fn checkgate_delete_flag(key: *const c_char) {
    let key = unsafe { CStr::from_ptr(key) }.to_string_lossy();
    STORE.delete_flag(&key);
}

/// Clear all flags from the in-memory store (called on SSE reconnect).
#[no_mangle]
pub extern "C" fn checkgate_clear_store() {
    STORE.clear();
}

// ---------------------------------------------------------------------------
// Context-based API — parse attributes once, evaluate many flags cheaply
// ---------------------------------------------------------------------------

/// Parse a user key and attributes JSON into an opaque context handle.
///
/// Returns a heap-allocated pointer the caller owns.
/// Must be released with `checkgate_free_context`.
///
/// # Safety
/// All pointer arguments must be valid, non-dangling, null-terminated C strings.
#[no_mangle]
pub unsafe extern "C" fn checkgate_make_context(
    user_key: *const c_char,
    attributes_json: *const c_char,
) -> *mut CheckgateContext {
    let user_key = unsafe { CStr::from_ptr(user_key) }
        .to_string_lossy()
        .into_owned();

    let attributes: HashMap<String, String> = if !attributes_json.is_null() {
        let json = unsafe { CStr::from_ptr(attributes_json) }.to_string_lossy();
        serde_json::from_str(&json).unwrap_or_default()
    } else {
        HashMap::new()
    };

    Box::into_raw(Box::new(CheckgateContext {
        inner: UserContext {
            key: user_key,
            attributes,
        },
    }))
}

/// Evaluate a flag using a pre-parsed context handle. Returns `1` if enabled, `0` otherwise.
///
/// # Safety
/// - `flag_key` must be a valid, non-dangling, null-terminated C string.
/// - `ctx` must be a non-null pointer from `checkgate_make_context` that has not been freed.
#[no_mangle]
pub unsafe extern "C" fn checkgate_is_enabled_ctx(
    flag_key: *const c_char,
    ctx: *const CheckgateContext,
) -> i32 {
    let flag_key = unsafe { CStr::from_ptr(flag_key) }.to_string_lossy();
    let flag = match STORE.get_flag(&flag_key) {
        Some(f) => f,
        None => return 0,
    };
    let ctx = unsafe { &*ctx };
    if evaluate(flag.as_ref(), &ctx.inner) {
        1
    } else {
        0
    }
}

/// Release a context handle. Passing NULL is safe and is a no-op.
///
/// # Safety
/// `ctx` must be a pointer from `checkgate_make_context` that has not already been freed.
#[no_mangle]
pub unsafe extern "C" fn checkgate_free_context(ctx: *mut CheckgateContext) {
    if !ctx.is_null() {
        drop(unsafe { Box::from_raw(ctx) });
    }
}

// ---------------------------------------------------------------------------
// Legacy single-call API (parses attributes JSON on every invocation)
// ---------------------------------------------------------------------------

/// Evaluate a flag for a given user. Parses `attributes_json` on every call.
///
/// Prefer `checkgate_make_context` + `checkgate_is_enabled_ctx` when evaluating
/// multiple flags for the same user.
///
/// # Returns `1` if enabled, `0` otherwise.
///
/// # Safety
/// All pointer arguments must be valid, non-dangling, null-terminated C strings.
#[no_mangle]
pub unsafe extern "C" fn checkgate_is_enabled(
    flag_key: *const c_char,
    user_key: *const c_char,
    attributes_json: *const c_char,
) -> i32 {
    let flag_key = unsafe { CStr::from_ptr(flag_key) }.to_string_lossy();
    let user_key = unsafe { CStr::from_ptr(user_key) }
        .to_string_lossy()
        .into_owned();

    let flag = match STORE.get_flag(&flag_key) {
        Some(f) => f,
        None => return 0,
    };

    let attributes: HashMap<String, String> = if !attributes_json.is_null() {
        let json = unsafe { CStr::from_ptr(attributes_json) }.to_string_lossy();
        serde_json::from_str(&json).unwrap_or_default()
    } else {
        HashMap::new()
    };

    let ctx = UserContext {
        key: user_key,
        attributes,
    };

    if evaluate(flag.as_ref(), &ctx) {
        1
    } else {
        0
    }
}
