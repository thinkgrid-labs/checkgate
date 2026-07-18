package v1alpha1

import (
	apiextensionsv1 "k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// SecretKeyRef points at a key in a Kubernetes Secret holding the Checkgate
// access token.
type SecretKeyRef struct {
	// Name of the Secret.
	Name string `json:"name"`
	// Key within the Secret. Defaults to "token".
	// +optional
	// +kubebuilder:default=token
	Key string `json:"key,omitempty"`
	// Namespace of the Secret. Defaults to the FeatureFlag's namespace.
	// +optional
	Namespace string `json:"namespace,omitempty"`
}

// ServerRef describes how to reach the Checkgate server and authenticate.
type ServerRef struct {
	// URL is the Checkgate server base URL, e.g. https://flags.example.com.
	// +kubebuilder:validation:MinLength=1
	URL string `json:"url"`
	// TokenSecretRef references a read_write personal access token.
	TokenSecretRef SecretKeyRef `json:"tokenSecretRef"`
}

// FeatureFlagSpec is the desired state of a Checkgate flag.
type FeatureFlagSpec struct {
	// Server tells the operator which Checkgate instance to reconcile against.
	Server ServerRef `json:"server"`
	// EnvironmentID the flag belongs to.
	// +kubebuilder:validation:MinLength=1
	EnvironmentID string `json:"environmentId"`
	// Key is the flag's unique key within the environment. Immutable.
	// +kubebuilder:validation:MinLength=1
	// +kubebuilder:validation:XValidation:rule="self == oldSelf",message="key is immutable"
	Key string `json:"key"`
	// Enabled turns the flag on or off. Defaults to true.
	// +optional
	// +kubebuilder:default=true
	Enabled bool `json:"enabled"`
	// RolloutPercentage is a sticky percentage rollout (0–100).
	// +optional
	// +kubebuilder:validation:Minimum=0
	// +kubebuilder:validation:Maximum=100
	RolloutPercentage *int `json:"rolloutPercentage,omitempty"`
	// Description is a human-readable note.
	// +optional
	Description string `json:"description,omitempty"`
	// FlagType is one of boolean, string, integer, json. Defaults to boolean.
	// +optional
	// +kubebuilder:validation:Enum=boolean;string;integer;json
	// +kubebuilder:default=boolean
	FlagType string `json:"flagType,omitempty"`
	// DefaultValue returned when enabled and no rule matches (raw JSON).
	// +optional
	DefaultValue *apiextensionsv1.JSON `json:"defaultValue,omitempty"`
	// Tags are dashboard-only labels.
	// +optional
	Tags []string `json:"tags,omitempty"`
	// Rules is a raw-JSON array of targeting rules.
	// +optional
	Rules *apiextensionsv1.JSON `json:"rules,omitempty"`
	// Variants is a raw-JSON array of weighted variants.
	// +optional
	Variants *apiextensionsv1.JSON `json:"variants,omitempty"`
}

// FeatureFlagStatus is the observed state of the flag.
type FeatureFlagStatus struct {
	// Synced is true when the flag in Checkgate matches this spec.
	// +optional
	Synced bool `json:"synced,omitempty"`
	// ObservedGeneration is the spec generation last reconciled.
	// +optional
	ObservedGeneration int64 `json:"observedGeneration,omitempty"`
	// Conditions follow the standard Kubernetes condition convention.
	// +optional
	// +listType=map
	// +listMapKey=type
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:resource:shortName=ff
// +kubebuilder:printcolumn:name="Key",type=string,JSONPath=`.spec.key`
// +kubebuilder:printcolumn:name="Enabled",type=boolean,JSONPath=`.spec.enabled`
// +kubebuilder:printcolumn:name="Synced",type=boolean,JSONPath=`.status.synced`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// FeatureFlag is a Checkgate feature flag managed declaratively.
type FeatureFlag struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   FeatureFlagSpec   `json:"spec,omitempty"`
	Status FeatureFlagStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// FeatureFlagList contains a list of FeatureFlag.
type FeatureFlagList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []FeatureFlag `json:"items"`
}

func init() {
	SchemeBuilder.Register(&FeatureFlag{}, &FeatureFlagList{})
}
