use crate::evaluator::Flag;
use dashmap::DashMap;
use std::sync::Arc;

/// The central in-memory store for feature flags.
/// Flags are stored behind Arc so get_flag is a single atomic increment (no heap allocation).
#[derive(Clone, Default)]
pub struct FlagStore {
    flags: Arc<DashMap<String, Arc<Flag>>>,
}

impl FlagStore {
    pub fn new() -> Self {
        Self {
            flags: Arc::new(DashMap::new()),
        }
    }

    pub fn upsert_flag(&self, flag: Flag) {
        self.flags.insert(flag.key.clone(), Arc::new(flag));
    }

    /// Returns a cheap Arc clone — no Flag data is copied.
    pub fn get_flag(&self, key: &str) -> Option<Arc<Flag>> {
        self.flags.get(key).map(|r| Arc::clone(r.value()))
    }

    pub fn delete_flag(&self, key: &str) {
        self.flags.remove(key);
    }

    /// Returns Arc clones of all flags — individual Flag data is not copied.
    pub fn list_flags(&self) -> Vec<Arc<Flag>> {
        self.flags.iter().map(|r| Arc::clone(r.value())).collect()
    }

    pub fn clear(&self) {
        self.flags.clear();
    }
}
