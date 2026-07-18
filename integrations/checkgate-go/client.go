// Package checkgate is a Go client for the Checkgate REST API.
//
// It backs the Terraform/OpenTofu provider and the Kubernetes operator, but is
// usable on its own for any infrastructure-as-code or automation that manages
// Checkgate flags and segments. Authentication is a personal access token (or an
// SDK key) sent as a Bearer credential; a read_write token is required for
// mutations.
package checkgate

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// DefaultTimeout is the per-request timeout when the caller does not supply an
// HTTP client of their own.
const DefaultTimeout = 30 * time.Second

// Client talks to a Checkgate server. Construct it with NewClient.
type Client struct {
	baseURL    string
	token      string
	httpClient *http.Client
	userAgent  string
}

// Option customises a Client.
type Option func(*Client)

// WithHTTPClient supplies a custom *http.Client (timeouts, transport, proxies).
func WithHTTPClient(hc *http.Client) Option {
	return func(c *Client) { c.httpClient = hc }
}

// WithUserAgent sets the User-Agent header sent on every request.
func WithUserAgent(ua string) Option {
	return func(c *Client) { c.userAgent = ua }
}

// NewClient returns a Client for baseURL (e.g. "https://flags.example.com")
// authenticating with token (a personal access token or SDK key).
func NewClient(baseURL, token string, opts ...Option) (*Client, error) {
	if baseURL == "" {
		return nil, errors.New("checkgate: baseURL is required")
	}
	if token == "" {
		return nil, errors.New("checkgate: token is required")
	}
	c := &Client{
		baseURL:   strings.TrimRight(baseURL, "/"),
		token:     token,
		userAgent: "checkgate-go",
	}
	for _, o := range opts {
		o(c)
	}
	if c.httpClient == nil {
		c.httpClient = &http.Client{Timeout: DefaultTimeout}
	}
	return c, nil
}

// APIError is returned for any non-2xx response. It carries the HTTP status so
// callers (e.g. the Terraform provider) can special-case 404.
type APIError struct {
	StatusCode int
	Method     string
	Path       string
	Body       string
}

func (e *APIError) Error() string {
	msg := e.Body
	if msg == "" {
		msg = http.StatusText(e.StatusCode)
	}
	return fmt.Sprintf("checkgate: %s %s → HTTP %d: %s", e.Method, e.Path, e.StatusCode, msg)
}

// NotFound reports whether err is an APIError with a 404 status.
func NotFound(err error) bool {
	var apiErr *APIError
	return errors.As(err, &apiErr) && apiErr.StatusCode == http.StatusNotFound
}

// do performs a request against path (relative to baseURL). If body is non-nil
// it is JSON-encoded. If out is non-nil, a 2xx response body is decoded into it.
// It returns the HTTP status code so callers can distinguish e.g. 200 from 202.
func (c *Client) do(ctx context.Context, method, path string, body, out any) (int, error) {
	var reqBody io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return 0, fmt.Errorf("checkgate: encoding request: %w", err)
		}
		reqBody = bytes.NewReader(buf)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reqBody)
	if err != nil {
		return 0, fmt.Errorf("checkgate: building request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", c.userAgent)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	// Bearer-authenticated requests are exempt from CSRF, but we send the header
	// anyway so the client also works with a session cookie behind a proxy.
	req.Header.Set("X-Checkgate-Request", "true")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("checkgate: %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return resp.StatusCode, &APIError{
			StatusCode: resp.StatusCode,
			Method:     method,
			Path:       path,
			Body:       strings.TrimSpace(string(b)),
		}
	}

	if out != nil && resp.StatusCode != http.StatusNoContent {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return resp.StatusCode, fmt.Errorf("checkgate: decoding response: %w", err)
		}
	}
	return resp.StatusCode, nil
}
