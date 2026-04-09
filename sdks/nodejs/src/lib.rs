#![deny(clippy::all)]

#[macro_use]
extern crate napi_derive;

use launchgate_core::evaluator::{Flag, TargetingRule, UserContext, evaluate};
use launchgate_core::store::FlagStore;
use std::collections::HashMap;
use std::sync::Arc;

#[napi]
pub struct LaunchgateCore {
    store: Arc<FlagStore>,
}

impl Default for LaunchgateCore {
    fn default() -> Self {
        Self::new()
    }
}

#[napi]
impl LaunchgateCore {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            store: Arc::new(FlagStore::new()),
        }
    }

    /// Load a flag directly into the in-memory cache.
    /// `rules_json` is a JSON string representation of the rules array.
    #[napi]
    pub fn upsert_flag(
        &self,
        key: String,
        is_enabled: bool,
        rollout_percentage: Option<u32>,
        description: Option<String>,
        rules_json: Option<String>,
    ) {
        let rules: Vec<TargetingRule> = rules_json
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        let flag = Flag {
            key,
            is_enabled,
            rollout_percentage,
            description,
            rules,
        };
        self.store.upsert_flag(flag);
    }

    /// Remove a flag from the local cache.
    #[napi]
    pub fn delete_flag(&self, key: String) {
        self.store.delete_flag(&key);
    }

    /// Clear the entire local cache (called on SSE reconnect before re-bootstrap).
    #[napi]
    pub fn clear_store(&self) {
        self.store.clear();
    }

    /// Evaluate a flag for a specific user.
    #[napi]
    pub fn is_enabled(
        &self,
        flag_key: String,
        user_key: String,
        user_attributes: HashMap<String, String>,
    ) -> bool {
        let flag = match self.store.get_flag(&flag_key) {
            Some(f) => f,
            None => return false,
        };

        let ctx = UserContext {
            key: user_key,
            attributes: user_attributes,
        };

        evaluate(flag.as_ref(), &ctx)
    }
}
