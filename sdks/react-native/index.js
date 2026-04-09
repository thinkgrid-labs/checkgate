/**
 * Checkgate React Native SDK
 *
 * Bridges the JS layer to the Rust evaluation engine via the C++ JSI host
 * installed as `global.__CheckgateInternal` by `installCheckgateJSI()`.
 *
 * The server sends the full flag state on every SSE (re)connect, so:
 *   1. Open SSE stream.
 *   2. On "connected" → clear the Rust cache.
 *   3. Incoming UPSERT events rebuild the cache.
 *   4. isEnabled() evaluates synchronously — zero network IO, sub-microsecond.
 */

export class CheckgateNativeClient {
    /**
     * @param {Object} options
     * @param {string} options.serverUrl - Base URL of your Checkgate server
     * @param {string} [options.sdkKey] - SDK key for authentication
     * @param {number} [options.reconnectDelayMs=5000] - SSE reconnect delay in ms
     */
    constructor({ serverUrl, sdkKey, reconnectDelayMs = 5000 } = {}) {
        this.serverUrl = serverUrl;
        this.sdkKey = sdkKey;
        this.reconnectDelayMs = reconnectDelayMs;
        this._initialized = false;
        this.sse = null;
        // The internal module exposed by the C++ JSI installation
        this.bridge = global.__CheckgateInternal;
    }

    /**
     * Initiates the SSE connection and starts streaming flags.
     * Unlike the web SDK, connect() fires and does not return a Promise —
     * consistent with React Native's event-driven model.
     * Flags are loaded as they arrive; isEnabled() returns false during bootstrap.
     */
    connect() {
        if (this._initialized) return;

        if (!this.bridge) {
            throw new Error(
                '[Checkgate] JSI module not found. Ensure installCheckgateJSI() was called ' +
                'in your native module before JS starts.'
            );
        }

        this._connectDeltas();
        this._initialized = true;
    }

    _connectDeltas() {
        if (this.sse) {
            this.sse.close();
        }

        // React Native's built-in fetch-based EventSource (or the `event-source`
        // package) supports headers, so we send auth via Authorization header.
        this.sse = new EventSource(`${this.serverUrl}/stream`, {
            headers: this.sdkKey ? { 'Authorization': `Bearer ${this.sdkKey}` } : {}
        });

        // Server sends "connected" before the full-state dump on every (re)connect.
        // Clear the Rust cache so stale / deleted flags are evicted first.
        this.sse.addEventListener('connected', () => {
            this.bridge.clearStore();
            console.log('[Checkgate] Stream connected — cache cleared, rebuilding from server state.');
        });

        this.sse.addEventListener('update', (e) => {
            try {
                const event = JSON.parse(e.data);

                if (event.type === 'UPSERT') {
                    const f = event.flag;
                    // Pass rules as a JS array — the JSI layer JSON.stringifies it before
                    // crossing into Rust, so all targeting rules are preserved.
                    this.bridge.upsertFlag(
                        f.key,
                        f.is_enabled,
                        f.rollout_percentage ?? -1,
                        f.rules || []
                    );
                } else if (event.type === 'DELETE') {
                    this.bridge.deleteFlag(event.key);
                }
            } catch (err) {
                console.error('[Checkgate] Failed to parse delta update:', err);
            }
        });

        this.sse.onerror = () => {
            console.warn('[Checkgate] Stream disconnected — EventSource will reconnect automatically.');
        };
    }

    /**
     * Evaluates a feature flag synchronously.
     * The call crosses JS → C++ JSI → Rust and returns in sub-microsecond time.
     *
     * @param {string} flagKey
     * @param {string} userKey        Stable user identifier used for rollout hashing.
     * @param {Object} [attributes]   Flat key→value map of user attributes for targeting rules.
     * @returns {boolean}
     */
    isEnabled(flagKey, userKey, attributes = {}) {
        if (!this._initialized || !this.bridge) return false;
        return this.bridge.isEnabled(flagKey, userKey, attributes);
    }

    /**
     * Tears down the SSE connection. Call in your cleanup effect.
     */
    disconnect() {
        if (this.sse) {
            this.sse.close();
            this.sse = null;
        }
    }
}
