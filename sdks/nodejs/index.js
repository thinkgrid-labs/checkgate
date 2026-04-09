const { CheckgateCore } = require('./index.node');
const EventSource = require('eventsource');

class CheckgateClient {
    /**
     * @param {Object} options
     * @param {string} options.serverUrl - Base URL of your Checkgate server
     * @param {string} [options.sdkKey] - SDK key for authentication
     * @param {number} [options.reconnectDelayMs=3000] - SSE reconnect delay in ms
     */
    constructor({ serverUrl, sdkKey, reconnectDelayMs = 3000 } = {}) {
        this.serverUrl = serverUrl;
        this.sdkKey = sdkKey;
        this.reconnectDelayMs = reconnectDelayMs;
        this.core = new CheckgateCore();
        this._initialized = false;
        this.sse = null;
    }

    /**
     * Connects to the server's SSE stream and downloads the current flag set.
     * Resolves when the initial bootstrap is complete (after the first "connected"
     * event and all bootstrap "update" events have been received).
     *
     * Sets up automatic reconnection on connection loss.
     *
     * @returns {Promise<void>}
     */
    connect() {
        if (this._initialized) return Promise.resolve();

        return new Promise((resolve) => {
            this._connectDeltas(resolve);
        });
    }

    _connectDeltas(onBootstrapped) {
        if (this.sse) {
            this.sse.close();
        }

        this.sse = new EventSource(`${this.serverUrl}/stream`, {
            headers: this.sdkKey ? { 'Authorization': `Bearer ${this.sdkKey}` } : {}
        });

        // Server sends "connected" before the full-state dump on every (re)connect.
        // Clear the cache so stale/deleted flags from the previous session are evicted.
        this.sse.addEventListener('connected', () => {
            this.core.clearStore();
            console.log('[Checkgate] Stream connected — cache cleared, rebuilding from server state.');

            // Mark as initialized on the first successful connection so connect() resolves.
            if (!this._initialized) {
                this._initialized = true;
                // call onBootstrapped on next tick to allow the bootstrap update events
                // that immediately follow "connected" to be processed first.
                setImmediate(() => { if (onBootstrapped) onBootstrapped(); });
            }
        });

        this.sse.addEventListener('update', (e) => {
            try {
                const event = JSON.parse(e.data);

                if (event.type === 'UPSERT') {
                    const f = event.flag;
                    this.core.upsertFlag(
                        f.key,
                        f.is_enabled,
                        f.rollout_percentage ?? null,
                        f.description ?? null,
                        // Rust expects a JSON string, not a JS Array
                        JSON.stringify(f.rules || [])
                    );
                } else if (event.type === 'DELETE') {
                    this.core.deleteFlag(event.key);
                }
            } catch (err) {
                console.error('[Checkgate] Failed to parse delta update:', err);
            }
        });

        this.sse.onerror = () => {
            // EventSource reconnects automatically; no action needed here.
            console.warn('[Checkgate] Stream disconnected — EventSource will reconnect automatically.');
        };
    }

    /**
     * Evaluates a feature flag synchronously in <1 microsecond with 0 network IO.
     *
     * @param {string} flagKey
     * @param {string} userKey - Stable user identifier used for rollout hashing
     * @param {Record<string, string>} [userAttributes={}] - User attributes for targeting rules
     * @returns {boolean}
     */
    isEnabled(flagKey, userKey, userAttributes = {}) {
        if (!this._initialized) {
            console.warn('[Checkgate] isEnabled() called before connect() resolved. Returning false.');
            return false;
        }
        return this.core.isEnabled(flagKey, userKey, userAttributes);
    }

    /**
     * Closes the SSE connection and cleans up resources.
     */
    disconnect() {
        if (this.sse) {
            this.sse.close();
            this.sse = null;
        }
    }
}

module.exports = { CheckgateClient };
