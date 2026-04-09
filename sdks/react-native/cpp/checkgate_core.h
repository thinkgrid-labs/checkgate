/**
 * checkgate_core.h
 *
 * C interface to the Checkgate Rust library (libcheckgate_rn).
 * Generated manually — matches the #[no_mangle] extern "C" functions in
 * sdks/react-native/src/lib.rs.
 *
 * Link against:
 *   Android: libcheckgate_rn.so
 *   iOS:     libcheckgate_rn.a
 */

#pragma once

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Upsert a flag into the in-process cache.
 *
 * @param key                Null-terminated flag key.
 * @param is_enabled         Global kill-switch. false → always disabled.
 * @param rollout_percentage 0-100 inclusive. Pass -1 for "no rollout cap" (100%).
 * @param rules_json         Null-terminated JSON array of targeting rules.
 *                           Pass NULL or "[]" when there are no rules.
 *                           Example: "[{\"attribute\":\"email\",\"operator\":\"ends_with\",
 *                                       \"values\":[\"@acme.com\"]}]"
 */
void checkgate_upsert_flag(
    const char *key,
    bool        is_enabled,
    int         rollout_percentage,
    const char *rules_json
);

/**
 * Remove a flag from the in-process cache.
 *
 * @param key Null-terminated flag key.
 */
void checkgate_delete_flag(const char *key);

/**
 * Clear all flags from the cache (call before re-bootstrapping on SSE reconnect).
 */
void checkgate_clear_store(void);

/**
 * Evaluate a flag for a specific user synchronously.
 *
 * @param flag_key        Null-terminated flag key.
 * @param user_key        Null-terminated stable user identifier (used for rollout hashing).
 * @param attributes_json Null-terminated JSON object of string→string user attributes.
 *                        Pass NULL or "{}" when there are no attributes.
 *                        Example: "{\"email\":\"u@acme.com\",\"country\":\"US\"}"
 * @return 1 if the flag is enabled for this user, 0 otherwise.
 */
int checkgate_is_enabled(
    const char *flag_key,
    const char *user_key,
    const char *attributes_json
);

#ifdef __cplusplus
}
#endif
