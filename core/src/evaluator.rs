use crate::hashing::murmurhash3_x86_32;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Operator {
    #[default]
    Equals,
    NotEquals,
    Contains,
    StartsWith,
    EndsWith,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum FlagType {
    #[default]
    Boolean,
    String,
    Integer,
    Json,
}

/// The value returned from a flag evaluation. Stored as untagged JSON so it
/// round-trips through the JSONB column and SSE stream without a type wrapper.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(untagged)]
pub enum FlagValue {
    Bool(bool),
    Str(String),
    Int(i64),
    Json(serde_json::Value),
    #[default]
    Null,
}

/// Full evaluation result — includes both the on/off decision and the resolved value.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EvalResult {
    pub enabled: bool,
    pub value: FlagValue,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TargetingRule {
    /// Concrete rule fields. Defaults allow omitting them when `segment_key` is set.
    #[serde(default)]
    pub attribute: String,
    #[serde(default)]
    pub operator: Operator,
    #[serde(default)]
    pub values: Vec<String>,
    /// When set, this rule references a named segment. The server expands the segment's
    /// rules inline before broadcasting to SDK clients, so the evaluator never sees this
    /// field in production. It is preserved here for DB round-trips and dashboard display.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub segment_key: Option<String>,
    /// Optional value returned when this rule matches (non-boolean flags).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variant: Option<FlagValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Flag {
    pub key: String,
    pub is_enabled: bool,
    pub rollout_percentage: Option<u32>, // 0 to 100
    pub description: Option<String>,
    #[serde(default)]
    pub rules: Vec<TargetingRule>,
    /// Variant type — defaults to Boolean for backward compatibility.
    #[serde(default)]
    pub flag_type: FlagType,
    /// Value returned when the flag is enabled and no targeting rule overrides it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_value: Option<FlagValue>,
    /// Value returned when `is_enabled` is false or the user is outside the rollout.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disabled_value: Option<FlagValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserContext {
    pub key: String, // User identifier strictly for hashing
    pub attributes: HashMap<String, String>,
}

fn rule_matches(rule: &TargetingRule, user_context: &UserContext) -> bool {
    let user_attr = match user_context.attributes.get(&rule.attribute) {
        Some(v) => v,
        None => {
            // A missing attribute satisfies NotEquals ("the user is definitely not X")
            // but fails all other operators which require the value to be present.
            //
            // NOTE: This means users without a targeted attribute will pass a NotEquals
            // rule, which can be surprising. For example, a rule "org not_equals evil_corp"
            // will admit anonymous users who have no "org" attribute at all. Add a
            // separate Equals rule for the expected attribute values if you want to
            // restrict access to known-good values only.
            return rule.operator == Operator::NotEquals && !rule.values.is_empty();
        }
    };

    match rule.operator {
        Operator::Equals => rule.values.iter().any(|v| v == user_attr),
        Operator::NotEquals => !rule.values.iter().any(|v| v == user_attr),
        Operator::Contains => rule.values.iter().any(|v| user_attr.contains(v.as_str())),
        Operator::StartsWith => rule
            .values
            .iter()
            .any(|v| user_attr.starts_with(v.as_str())),
        Operator::EndsWith => rule.values.iter().any(|v| user_attr.ends_with(v.as_str())),
    }
}

/// Returns the value to use when the flag is on but has no explicit default.
/// Boolean flags fall back to `true` for backward compatibility with flags that
/// predate `default_value`. Non-boolean flags fall back to `Null` to avoid
/// returning a value of the wrong type.
fn enabled_default(flag: &Flag) -> FlagValue {
    match flag.flag_type {
        FlagType::Boolean => FlagValue::Bool(true),
        _ => FlagValue::Null,
    }
}

fn disabled_result(flag: &Flag) -> EvalResult {
    EvalResult {
        enabled: false,
        value: flag
            .disabled_value
            .clone()
            .unwrap_or(FlagValue::Bool(false)),
    }
}

/// Evaluate a flag and return both the on/off result and the resolved variant value.
/// Use this for non-boolean flags (string / integer / JSON variants).
pub fn evaluate_variant(flag: &Flag, user_context: &UserContext) -> EvalResult {
    if !flag.is_enabled {
        return disabled_result(flag);
    }

    // Targeting rules — first match wins; per-rule variant overrides the flag default.
    for rule in &flag.rules {
        if rule_matches(rule, user_context) {
            let value = rule
                .variant
                .clone()
                .or_else(|| flag.default_value.clone())
                .unwrap_or_else(|| enabled_default(flag));
            return EvalResult {
                enabled: true,
                value,
            };
        }
    }

    // Rollout bucket check
    if let Some(percentage) = flag.rollout_percentage {
        if percentage == 0 {
            return disabled_result(flag);
        }
        if percentage < 100 {
            let hash_key = format!("{}:{}", flag.key, user_context.key);
            let hash_val = murmurhash3_x86_32(hash_key.as_bytes(), 0);
            if hash_val % 100 >= percentage {
                return disabled_result(flag);
            }
        }
    }

    EvalResult {
        enabled: true,
        value: flag
            .default_value
            .clone()
            .unwrap_or_else(|| enabled_default(flag)),
    }
}

/// Evaluate a flag and return a simple boolean. Delegates to `evaluate_variant`.
/// Existing callers are unaffected.
pub fn evaluate(flag: &Flag, user_context: &UserContext) -> bool {
    evaluate_variant(flag, user_context).enabled
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn bool_flag(
        key: &str,
        enabled: bool,
        rollout: Option<u32>,
        rules: Vec<TargetingRule>,
    ) -> Flag {
        Flag {
            key: key.into(),
            is_enabled: enabled,
            rollout_percentage: rollout,
            description: None,
            rules,
            flag_type: FlagType::Boolean,
            default_value: None,
            disabled_value: None,
        }
    }

    #[test]
    fn test_flag_disabled() {
        let flag = bool_flag("new_ui", false, None, vec![]);
        let ctx = UserContext {
            key: "user123".into(),
            attributes: HashMap::new(),
        };
        assert!(!evaluate(&flag, &ctx));
    }

    #[test]
    fn test_flag_rollout() {
        let flag = bool_flag("new_ui", true, Some(50), vec![]);

        let mut trues = 0;
        let mut falses = 0;

        for i in 0..1000 {
            let ctx = UserContext {
                key: format!("user{}", i),
                attributes: HashMap::new(),
            };
            if evaluate(&flag, &ctx) {
                trues += 1;
            } else {
                falses += 1;
            }
        }

        // With 1000 users and 50% rollout via hashing, it should be approximately 50-50
        assert!(trues > 450 && trues < 550);
        assert!(falses > 450 && falses < 550);
    }

    #[test]
    fn test_not_equals_missing_attribute_matches() {
        let flag = bool_flag(
            "org_gate",
            true,
            Some(0),
            vec![TargetingRule {
                attribute: "org".into(),
                operator: Operator::NotEquals,
                values: vec!["evil_corp".into()],
                variant: None,
                segment_key: None,
            }],
        );
        let ctx = UserContext {
            key: "anon".into(),
            attributes: HashMap::new(),
        };
        assert!(evaluate(&flag, &ctx));
    }

    #[test]
    fn test_not_equals_present_and_matching_value_does_not_match() {
        let flag = bool_flag(
            "org_gate",
            true,
            Some(0),
            vec![TargetingRule {
                attribute: "org".into(),
                operator: Operator::NotEquals,
                values: vec!["evil_corp".into()],
                variant: None,
                segment_key: None,
            }],
        );
        let mut attrs = HashMap::new();
        attrs.insert("org".into(), "evil_corp".into());
        let ctx = UserContext {
            key: "villain".into(),
            attributes: attrs,
        };
        assert!(!evaluate(&flag, &ctx));
    }

    #[test]
    fn test_rollout_percentage_above_100_treated_as_full_rollout() {
        let flag = bool_flag("bad_pct", true, Some(150), vec![]);
        let ctx = UserContext {
            key: "anyone".into(),
            attributes: HashMap::new(),
        };
        assert!(evaluate(&flag, &ctx));
    }

    #[test]
    fn test_flag_rules_match() {
        let flag = bool_flag(
            "beta_feature",
            true,
            Some(0),
            vec![TargetingRule {
                attribute: "email".into(),
                operator: Operator::EndsWith,
                values: vec!["@checkgate.com".into()],
                variant: None,
                segment_key: None,
            }],
        );
        let mut attrs = HashMap::new();
        attrs.insert("email".into(), "test@checkgate.com".into());
        let ctx = UserContext {
            key: "employee".into(),
            attributes: attrs,
        };
        assert!(evaluate(&flag, &ctx));
    }

    #[test]
    fn test_evaluate_variant_string_flag() {
        let flag = Flag {
            key: "theme".into(),
            is_enabled: true,
            rollout_percentage: None,
            description: None,
            rules: vec![],
            flag_type: FlagType::String,
            default_value: Some(FlagValue::Str("dark".into())),
            disabled_value: Some(FlagValue::Str("light".into())),
        };
        let ctx = UserContext {
            key: "user1".into(),
            attributes: HashMap::new(),
        };
        let result = evaluate_variant(&flag, &ctx);
        assert!(result.enabled);
        assert_eq!(result.value, FlagValue::Str("dark".into()));
    }

    #[test]
    fn test_evaluate_variant_disabled_returns_disabled_value() {
        let flag = Flag {
            key: "theme".into(),
            is_enabled: false,
            rollout_percentage: None,
            description: None,
            rules: vec![],
            flag_type: FlagType::String,
            default_value: Some(FlagValue::Str("dark".into())),
            disabled_value: Some(FlagValue::Str("light".into())),
        };
        let ctx = UserContext {
            key: "user1".into(),
            attributes: HashMap::new(),
        };
        let result = evaluate_variant(&flag, &ctx);
        assert!(!result.enabled);
        assert_eq!(result.value, FlagValue::Str("light".into()));
    }

    #[test]
    fn test_evaluate_variant_per_rule_variant() {
        let flag = Flag {
            key: "checkout".into(),
            is_enabled: true,
            rollout_percentage: None,
            description: None,
            rules: vec![TargetingRule {
                attribute: "plan".into(),
                operator: Operator::Equals,
                values: vec!["enterprise".into()],
                variant: Some(FlagValue::Str("v3".into())),
                segment_key: None,
            }],
            flag_type: FlagType::String,
            default_value: Some(FlagValue::Str("v2".into())),
            disabled_value: None,
        };

        let mut attrs = HashMap::new();
        attrs.insert("plan".into(), "enterprise".into());
        let ctx = UserContext {
            key: "bigcorp".into(),
            attributes: attrs,
        };
        let result = evaluate_variant(&flag, &ctx);
        assert!(result.enabled);
        assert_eq!(result.value, FlagValue::Str("v3".into()));

        // Non-enterprise user gets default value
        let ctx2 = UserContext {
            key: "regular".into(),
            attributes: HashMap::new(),
        };
        let result2 = evaluate_variant(&flag, &ctx2);
        assert!(result2.enabled);
        assert_eq!(result2.value, FlagValue::Str("v2".into()));
    }

    #[test]
    fn test_old_boolean_flags_deserialize_without_new_fields() {
        let json = r#"{"key":"legacy","is_enabled":true,"rollout_percentage":null,"description":null,"rules":[]}"#;
        let flag: Flag = serde_json::from_str(json).unwrap();
        assert_eq!(flag.flag_type, FlagType::Boolean);
        assert!(flag.default_value.is_none());
        assert!(flag.disabled_value.is_none());
        assert!(evaluate(
            &flag,
            &UserContext {
                key: "u".into(),
                attributes: HashMap::new()
            }
        ));
    }
}
