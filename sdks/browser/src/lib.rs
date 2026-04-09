use launchgate_core::evaluator::{Flag, UserContext, evaluate};
use launchgate_core::store::FlagStore;
use std::collections::HashMap;
use std::sync::Arc;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct LaunchgateCoreWasm {
    store: Arc<FlagStore>,
}

impl Default for LaunchgateCoreWasm {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl LaunchgateCoreWasm {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        console_error_panic_hook::set_once();
        Self {
            store: Arc::new(FlagStore::new()),
        }
    }

    /// Load a flag directly into the browser's Wasm memory
    #[wasm_bindgen]
    pub fn upsert_flag(
        &self,
        key: String,
        is_enabled: bool,
        rollout_percentage: Option<u32>,
        description: Option<String>,
        rules_js: JsValue,
    ) {
        let rules = serde_wasm_bindgen::from_value(rules_js).unwrap_or_default();

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
    #[wasm_bindgen]
    pub fn delete_flag(&self, key: String) {
        self.store.delete_flag(&key);
    }

    /// Clear the entire local cache (called on SSE reconnect before re-bootstrap).
    #[wasm_bindgen]
    pub fn clear_store(&self) {
        self.store.clear();
    }

    /// Evaluate a flag for a specific user.
    #[wasm_bindgen]
    pub fn is_enabled(
        &self,
        flag_key: String,
        user_key: String,
        user_attributes_js: JsValue,
    ) -> bool {
        let flag = match self.store.get_flag(&flag_key) {
            Some(f) => f,
            None => return false,
        };

        let attributes: HashMap<String, String> =
            serde_wasm_bindgen::from_value(user_attributes_js).unwrap_or_default();

        let ctx = UserContext {
            key: user_key,
            attributes,
        };

        evaluate(flag.as_ref(), &ctx)
    }
}
