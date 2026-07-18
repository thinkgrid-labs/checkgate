# Checkgate integrations

Infrastructure-as-code and platform integrations for [Checkgate](../README.md),
all built on one shared Go API client.

| Module | What it is |
|---|---|
| [`checkgate-go`](checkgate-go) | The shared Go client for the Checkgate REST API (flags + segments). Zero third-party deps, fully unit-tested. |
| [`terraform-provider-checkgate`](terraform-provider-checkgate) | A Terraform / OpenTofu provider — manage flags and segments as code (`checkgate_flag`, `checkgate_segment`, data source). |
| [`kubernetes-operator`](kubernetes-operator) | A Kubernetes operator reconciling `FeatureFlag` custom resources into Checkgate. |

The provider and operator each consume `checkgate-go` via a local `replace`
directive, so a change to the API surface updates in one place.
