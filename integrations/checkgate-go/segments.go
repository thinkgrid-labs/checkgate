package checkgate

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
)

// Segment is a reusable named set of targeting rules.
type Segment struct {
	ID          string          `json:"id,omitempty"`
	Key         string          `json:"key"`
	Name        string          `json:"name"`
	Description *string         `json:"description,omitempty"`
	Rules       []TargetingRule `json:"rules,omitempty"`
	CreatedAt   string          `json:"created_at,omitempty"`
}

func segmentsPath(envID string) string {
	return fmt.Sprintf("/api/environments/%s/segments", url.PathEscape(envID))
}

func segmentPath(envID, key string) string {
	return fmt.Sprintf("/api/environments/%s/segments/%s", url.PathEscape(envID), url.PathEscape(key))
}

// GetSegment fetches a segment by key. Use NotFound(err) to detect absence.
func (c *Client) GetSegment(ctx context.Context, envID, key string) (*Segment, error) {
	var s Segment
	if _, err := c.do(ctx, http.MethodGet, segmentPath(envID, key), nil, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// CreateSegment creates a segment and returns the stored result.
func (c *Client) CreateSegment(ctx context.Context, envID string, seg *Segment) (*Segment, error) {
	var out Segment
	if _, err := c.do(ctx, http.MethodPost, segmentsPath(envID), seg, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// segmentPatch is the mutable subset of a segment (key is immutable).
type segmentPatch struct {
	Name        *string         `json:"name,omitempty"`
	Description *string         `json:"description,omitempty"`
	Rules       []TargetingRule `json:"rules,omitempty"`
}

// UpdateSegment applies a partial update to a segment.
func (c *Client) UpdateSegment(ctx context.Context, envID, key string, seg *Segment) (*Segment, error) {
	patch := segmentPatch{Name: &seg.Name, Description: seg.Description, Rules: seg.Rules}
	var out Segment
	if _, err := c.do(ctx, http.MethodPatch, segmentPath(envID, key), patch, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// DeleteSegment removes a segment.
func (c *Client) DeleteSegment(ctx context.Context, envID, key string) error {
	_, err := c.do(ctx, http.MethodDelete, segmentPath(envID, key), nil, nil)
	return err
}
