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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TargetingRule {
    pub attribute: String, // e.g. "email"
    pub operator: Operator,
    pub values: Vec<String>, // e.g. ["@google.com", "@microsoft.com"]
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Flag {
    pub key: String,
    pub is_enabled: bool,
    pub rollout_percentage: Option<u32>, // 0 to 100
    pub description: Option<String>,
    #[serde(default)]
    pub rules: Vec<TargetingRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserContext {
    pub key: String, // User identifier strictly for hashing
    pub attributes: HashMap<String, String>,
}

pub fn evaluate(flag: &Flag, user_context: &UserContext) -> bool {
    // If centrally disabled, return false immediately.
    if !flag.is_enabled {
        return false;
    }

    // Evaluate advanced targeting rules first
    for rule in &flag.rules {
        let user_attr = match user_context.attributes.get(&rule.attribute) {
            Some(v) => v,
            None => {
                // For NotEquals, a missing attribute is not equal to any listed value → rule matches.
                // All other operators require the attribute to be present to match.
                if rule.operator == Operator::NotEquals && !rule.values.is_empty() {
                    return true;
                }
                continue;
            }
        };

        let matches = match rule.operator {
            Operator::Equals => rule.values.iter().any(|v| v == user_attr),
            Operator::NotEquals => !rule.values.iter().any(|v| v == user_attr),
            Operator::Contains => rule.values.iter().any(|v| user_attr.contains(v)),
            Operator::StartsWith => rule.values.iter().any(|v| user_attr.starts_with(v)),
            Operator::EndsWith => rule.values.iter().any(|v| user_attr.ends_with(v)),
        };

        // If rule matches, the flag is enabled for this user regardless of rollout percentage
        if matches {
            return true;
        }
    }

    // If rollout is defined, use deterministic hashing
    if let Some(percentage) = flag.rollout_percentage {
        if percentage == 0 {
            return false;
        }
        if percentage >= 100 {
            return true;
        }

        // Combine flag_key + user_key to generate a unique scalar for this user & flag
        let hash_key = format!("{}:{}", flag.key, user_context.key);
        let hash_val = murmurhash3_x86_32(hash_key.as_bytes(), 0);

        // Hash value modulo 100 gives 0-99
        let bucket = hash_val % 100;

        return bucket < percentage; // Zero-allocation stable bucket routing
    }

    true // Enabled with no rollout restrictions
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_flag_disabled() {
        let flag = Flag {
            key: "new_ui".into(),
            is_enabled: false,
            rollout_percentage: None,
            description: None,
            rules: vec![],
        };
        let ctx = UserContext {
            key: "user123".into(),
            attributes: HashMap::new(),
        };
        assert!(!evaluate(&flag, &ctx));
    }

    #[test]
    fn test_flag_rollout() {
        let flag = Flag {
            key: "new_ui".into(),
            is_enabled: true,
            rollout_percentage: Some(50), // 50% rollout
            description: None,
            rules: vec![],
        };

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
        // A user without the targeted attribute satisfies "not equal to X".
        let flag = Flag {
            key: "org_gate".into(),
            is_enabled: true,
            rollout_percentage: Some(0), // would block without rule match
            description: None,
            rules: vec![TargetingRule {
                attribute: "org".into(),
                operator: Operator::NotEquals,
                values: vec!["evil_corp".into()],
            }],
        };
        let ctx = UserContext {
            key: "anon".into(),
            attributes: HashMap::new(), // no "org" attribute
        };
        assert!(evaluate(&flag, &ctx));
    }

    #[test]
    fn test_not_equals_present_and_matching_value_does_not_match() {
        let flag = Flag {
            key: "org_gate".into(),
            is_enabled: true,
            rollout_percentage: Some(0),
            description: None,
            rules: vec![TargetingRule {
                attribute: "org".into(),
                operator: Operator::NotEquals,
                values: vec!["evil_corp".into()],
            }],
        };
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
        let flag = Flag {
            key: "bad_pct".into(),
            is_enabled: true,
            rollout_percentage: Some(150),
            description: None,
            rules: vec![],
        };
        let ctx = UserContext {
            key: "anyone".into(),
            attributes: HashMap::new(),
        };
        assert!(evaluate(&flag, &ctx));
    }

    #[test]
    fn test_flag_rules_match() {
        let flag = Flag {
            key: "beta_feature".into(),
            is_enabled: true,
            rollout_percentage: Some(0), // 0% global rollout
            description: None,
            rules: vec![TargetingRule {
                attribute: "email".into(),
                operator: Operator::EndsWith,
                values: vec!["@sidekick.com".into()],
            }],
        };

        let mut attrs = HashMap::new();
        attrs.insert("email".into(), "test@sidekick.com".into());
        let ctx = UserContext {
            key: "employee".into(),
            attributes: attrs,
        };

        // This user is in the 0% rollout, BUT they match the rule bypass
        assert!(evaluate(&flag, &ctx));
    }
}
