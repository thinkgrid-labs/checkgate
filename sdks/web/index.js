import init, { CheckgateCoreWasm } from './dist/checkgate.js';

export class CheckgateWeb {
    /**
     * @param {Object} options
     * @param {string} options.serverUrl - Base URL of your Checkgate server
     * @param {string} [options.sdkKey] - SDK key (sent as Authorization: Bearer)
     * @param {number} [options.reconnectDelayMs=3000] - Reconnect delay on SSE disconnect
     */
    constructor({ serverUrl, sdkKey, reconnectDelayMs = 3000 } = {}) {
        this.serverUrl = serverUrl;
        this.sdkKey = sdkKey;
        this.reconnectDelayMs = reconnectDelayMs;
        this.core = null;
        this._initialized = false;
        this.sse = null;
    }

    /**
     * Initializes the WebAssembly module and opens the SSE stream.
     * Resolves when the initial bootstrap is complete.
     * The server sends the full flag state on connect, so no separate
     * REST bootstrap fetch is needed.
     *
     * @returns {Promise<void>}
     */
    async connect() {
        if (this._initialized) return;

        await init();
        this.core = new CheckgateCoreWasm();

        await new Promise((resolve) => {
            this._connectDeltas(resolve);
        });
    }

    _connectDeltas(onBootstrapped) {
        if (this.sse) {
            this.sse.close();
        }

        // Browser EventSource doesn't support custom headers; use sdkKey as a
        // query param when auth is required.
        const url = this.sdkKey
            ? `${this.serverUrl}/stream?sdk_key=${encodeURIComponent(this.sdkKey)}`
            : `${this.serverUrl}/stream`;

        this.sse = new EventSource(url);

        // Server sends "connected" before the full-state dump on every (re)connect.
        // Clear the Wasm cache so stale/deleted flags are evicted before re-bootstrap.
        this.sse.addEventListener('connected', () => {
            this.core.clear_store();
            console.log('[Checkgate] Stream connected — cache cleared, rebuilding from server state.');

            if (!this._initialized) {
                this._initialized = true;
                // Yield to the event loop so bootstrap update events that immediately
                // follow "connected" can be processed before the Promise resolves.
                setTimeout(() => { if (onBootstrapped) onBootstrapped(); }, 0);
            }
        });

        this.sse.addEventListener('update', (e) => {
            try {
                const event = JSON.parse(e.data);
                if (event.type === 'UPSERT') {
                    const f = event.flag;
                    this.core.upsert_flag(
                        f.key,
                        f.is_enabled,
                        f.rollout_percentage ?? null,
                        f.description ?? null,
                        f.rules || []
                    );
                } else if (event.type === 'DELETE') {
                    this.core.delete_flag(event.key);
                }
            } catch (err) {
                console.error('[Checkgate] Failed to parse update:', err);
            }
        });

        this.sse.onerror = () => {
            // EventSource reconnects automatically; no action needed here.
            console.warn('[Checkgate] Stream disconnected — EventSource will reconnect automatically.');
        };
    }

    /**
     * Evaluate a flag locally in the browser via WebAssembly (< 1 microsecond).
     *
     * @param {string} flagKey
     * @param {string} userKey - Stable user identifier
     * @param {Record<string, string>} [userAttributes={}]
     * @returns {boolean}
     */
    isEnabled(flagKey, userKey, userAttributes = {}) {
        if (!this._initialized || !this.core) {
            console.warn('[Checkgate] isEnabled() called before connect() resolved. Returning false.');
            return false;
        }
        return this.core.is_enabled(flagKey, userKey, userAttributes);
    }

    /**
     * Closes the SSE connection.
     */
    disconnect() {
        if (this.sse) {
            this.sse.close();
            this.sse = null;
        }
    }
}
