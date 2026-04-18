-- Migration 0007: Multivariate flag support
-- No schema change required: flags.data is a JSONB column that already accepts
-- arbitrary JSON. New fields (flag_type, default_value, disabled_value,
-- rules[*].variant) are additive and backward-compatible — old rows without
-- these keys deserialize with serde #[serde(default)] values in the Rust core.
SELECT 1;
