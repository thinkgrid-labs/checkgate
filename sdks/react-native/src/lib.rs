//! React Native JSI — C FFI layer for Checkgate.
//!
//! These `extern "C"` functions are the Rust side of the JSI bridge.
//! The C++ JSI host (`checkgate_jsi.cpp`) calls them synchronously
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

use checkgate_core::evaluator::{evaluate, evaluate_variant, EvalResult, Flag, UserContext};
use checkgate_core::store::FlagStore;
use std::collections::HashMap;
use std::ffi::{c_char, CStr, CString};
use std::sync::LazyLock;

static STORE: LazyLock<FlagStore> = LazyLock::new(FlagStore::new);

/// Opaque handle holding a pre-parsed user context.
/// Obtain via `checkgate_make_context`, release via `checkgate_free_context`.
pub struct CheckgateContext {
    inner: UserContext,
}

/// Upsert a flag from a full JSON string into the in-memory store.
///
/// Accepts all flag fields including `flag_type`, `default_value`, `disabled_value`,
/// and per-rule `variant` values. Prefer this over `checkgate_upsert_flag` for
/// non-boolean flags.
///
/// # Safety
/// `flag_json` must be a valid, non-dangling, null-terminated C string.
#[no_mangle]
pub unsafe extern "C" fn checkgate_upsert_flag_v2(flag_json: *const c_char) {
    if flag_json.is_null() {
        return;
    }
    let json = unsafe { CStr::from_ptr(flag_json) }.to_string_lossy();
    if let Ok(flag) = serde_json::from_str::<Flag>(&json) {
        STORE.upsert_flag(flag);
    }
}

/// Upsert a flag into the in-memory store (legacy positional API).
///
/// New callers should prefer `checkgate_upsert_flag_v2`.
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

    let rules: serde_json::Value = if !rules_json.is_null() {
        let json = unsafe { CStr::from_ptr(rules_json) }.to_string_lossy();
        serde_json::from_str(&json).unwrap_or(serde_json::Value::Array(vec![]))
    } else {
        serde_json::Value::Array(vec![])
    };

    let rollout = if rollout_percentage < 0 {
        serde_json::Value::Null
    } else {
        serde_json::json!(rollout_percentage.min(100))
    };

    let flag_json = serde_json::json!({
        "key": key,
        "is_enabled": is_enabled,
        "rollout_percentage": rollout,
        "description": null,
        "rules": rules,
    });
    if let Ok(flag) = serde_json::from_value::<Flag>(flag_json) {
        STORE.upsert_flag(flag);
    }
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
// Variant API — returns value alongside enabled/disabled result
// ---------------------------------------------------------------------------

fn alloc_cstring(s: String) -> *mut c_char {
    CString::new(s)
        .unwrap_or_else(|_| CString::new("null").unwrap())
        .into_raw()
}

fn eval_result_to_json(result: EvalResult) -> String {
    serde_json::to_string(&result).unwrap_or_else(|_| "null".to_string())
}

fn value_to_json(result: EvalResult) -> String {
    serde_json::to_string(&result.value).unwrap_or_else(|_| "null".to_string())
}

/// Evaluate a flag and return a heap-allocated JSON string `{"enabled":bool,"value":...}`.
/// Returns `"null"` if the flag is not found.
///
/// The caller must free the returned pointer with `checkgate_free_string`.
///
/// # Safety
/// All pointer arguments must be valid, non-dangling, null-terminated C strings.
#[no_mangle]
pub unsafe extern "C" fn checkgate_get_variant(
    flag_key: *const c_char,
    user_key: *const c_char,
    attributes_json: *const c_char,
) -> *mut c_char {
    let flag_key = unsafe { CStr::from_ptr(flag_key) }.to_string_lossy();
    let flag = match STORE.get_flag(&flag_key) {
        Some(f) => f,
        None => return alloc_cstring("null".to_string()),
    };
    let user_key = unsafe { CStr::from_ptr(user_key) }
        .to_string_lossy()
        .into_owned();
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
    alloc_cstring(eval_result_to_json(evaluate_variant(flag.as_ref(), &ctx)))
}

/// Evaluate a flag and return a heap-allocated JSON string of just the variant value.
/// Returns `"null"` if the flag is not found.
///
/// The caller must free the returned pointer with `checkgate_free_string`.
///
/// # Safety
/// All pointer arguments must be valid, non-dangling, null-terminated C strings.
#[no_mangle]
pub unsafe extern "C" fn checkgate_get_value(
    flag_key: *const c_char,
    user_key: *const c_char,
    attributes_json: *const c_char,
) -> *mut c_char {
    let flag_key = unsafe { CStr::from_ptr(flag_key) }.to_string_lossy();
    let flag = match STORE.get_flag(&flag_key) {
        Some(f) => f,
        None => return alloc_cstring("null".to_string()),
    };
    let user_key = unsafe { CStr::from_ptr(user_key) }
        .to_string_lossy()
        .into_owned();
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
    alloc_cstring(value_to_json(evaluate_variant(flag.as_ref(), &ctx)))
}

/// Free a string returned by `checkgate_get_variant` or `checkgate_get_value`.
/// Passing NULL is safe and is a no-op.
///
/// # Safety
/// `s` must be a pointer from `checkgate_get_variant` or `checkgate_get_value`
/// that has not already been freed.
#[no_mangle]
pub unsafe extern "C" fn checkgate_free_string(s: *mut c_char) {
    if !s.is_null() {
        drop(unsafe { CString::from_raw(s) });
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
