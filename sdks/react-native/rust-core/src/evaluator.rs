use crate::hashing::murmurhash3_x86_32;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Operator {
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
    pub attribute: String,
    pub operator: Operator,
    pub values: Vec<String>,
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
    pub key: String,
    pub attributes: HashMap<String, String>,
}

fn rule_matches(rule: &TargetingRule, user_context: &UserContext) -> bool {
    let user_attr = match user_context.attributes.get(&rule.attribute) {
        Some(v) => v,
        None => {
            return rule.operator == Operator::NotEquals && !rule.values.is_empty();
        }
    };

    match rule.operator {
        Operator::Equals => rule.values.iter().any(|v| v == user_attr),
        Operator::NotEquals => !rule.values.iter().any(|v| v == user_attr),
        Operator::Contains => rule.values.iter().any(|v| user_attr.contains(v.as_str())),
        Operator::StartsWith => rule.values.iter().any(|v| user_attr.starts_with(v.as_str())),
        Operator::EndsWith => rule.values.iter().any(|v| user_attr.ends_with(v.as_str())),
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

pub fn evaluate_variant(flag: &Flag, user_context: &UserContext) -> EvalResult {
    if !flag.is_enabled {
        return disabled_result(flag);
    }

    for rule in &flag.rules {
        if rule_matches(rule, user_context) {
            let value = rule
                .variant
                .clone()
                .or_else(|| flag.default_value.clone())
                .unwrap_or(FlagValue::Bool(true));
            return EvalResult {
                enabled: true,
                value,
            };
        }
    }

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
            .unwrap_or(FlagValue::Bool(true)),
    }
}

pub fn evaluate(flag: &Flag, user_context: &UserContext) -> bool {
    evaluate_variant(flag, user_context).enabled
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn bool_flag(key: &str, enabled: bool, rollout: Option<u32>, rules: Vec<TargetingRule>) -> Flag {
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
        let ctx = UserContext { key: "user123".into(), attributes: HashMap::new() };
        assert!(!evaluate(&flag, &ctx));
    }

    #[test]
    fn test_flag_rollout() {
        let flag = bool_flag("new_ui", true, Some(50), vec![]);
        let mut trues = 0;
        for i in 0..1000 {
            let ctx = UserContext { key: format!("user{}", i), attributes: HashMap::new() };
            if evaluate(&flag, &ctx) { trues += 1; }
        }
        assert!(trues > 450 && trues < 550);
    }

    #[test]
    fn test_not_equals_missing_attribute_matches() {
        let flag = bool_flag("org_gate", true, Some(0), vec![TargetingRule {
            attribute: "org".into(), operator: Operator::NotEquals,
            values: vec!["evil_corp".into()], variant: None,
        }]);
        let ctx = UserContext { key: "anon".into(), attributes: HashMap::new() };
        assert!(evaluate(&flag, &ctx));
    }

    #[test]
    fn test_flag_rules_match() {
        let flag = bool_flag("beta", true, Some(0), vec![TargetingRule {
            attribute: "email".into(), operator: Operator::EndsWith,
            values: vec!["@checkgate.com".into()], variant: None,
        }]);
        let mut attrs = HashMap::new();
        attrs.insert("email".into(), "test@checkgate.com".into());
        let ctx = UserContext { key: "employee".into(), attributes: attrs };
        assert!(evaluate(&flag, &ctx));
    }

    #[test]
    fn test_evaluate_variant_string_flag() {
        let flag = Flag {
            key: "theme".into(), is_enabled: true, rollout_percentage: None,
            description: None, rules: vec![], flag_type: FlagType::String,
            default_value: Some(FlagValue::Str("dark".into())),
            disabled_value: Some(FlagValue::Str("light".into())),
        };
        let ctx = UserContext { key: "u1".into(), attributes: HashMap::new() };
        let result = evaluate_variant(&flag, &ctx);
        assert!(result.enabled);
        assert_eq!(result.value, FlagValue::Str("dark".into()));
    }
}
