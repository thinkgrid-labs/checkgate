//! Single fan-out point for outbound event notifications.
//!
//! There are two sinks — raw webhooks ([`crate::webhook_fire`]) and chat
//! integrations ([`crate::integrations`]) — and every event should reach both.
//! Call sites go through here rather than invoking each sink directly, so
//! adding an event (or a third sink) can't silently miss one.

use crate::state::AppState;
use serde_json::Value;

/// Fan an event out to every configured sink for `env_id`. Non-blocking: each
/// sink spawns its own delivery task.
pub fn notify(state: AppState, env_id: String, payload: Value) {
    crate::webhook_fire::fire_webhooks(state.clone(), env_id.clone(), payload.clone());
    crate::integrations::fire_integrations(state, env_id, payload);
}
