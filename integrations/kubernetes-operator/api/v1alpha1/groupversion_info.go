// Package v1alpha1 contains the FeatureFlag CRD API for the Checkgate operator.
// +kubebuilder:object:generate=true
// +groupName=flags.checkgate.io
package v1alpha1

import (
	"k8s.io/apimachinery/pkg/runtime/schema"
	"sigs.k8s.io/controller-runtime/pkg/scheme"
)

var (
	// GroupVersion is the group/version for the FeatureFlag API.
	GroupVersion = schema.GroupVersion{Group: "flags.checkgate.io", Version: "v1alpha1"}

	// SchemeBuilder registers the API types with a runtime scheme.
	SchemeBuilder = &scheme.Builder{GroupVersion: GroupVersion}

	// AddToScheme adds the API types to a scheme.
	AddToScheme = SchemeBuilder.AddToScheme
)
