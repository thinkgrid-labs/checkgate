import init, { SidekickCoreWasm } from './dist/sidekick.js';

export class SidekickBrowserClient {
    constructor(serverUrl, sdkKey) {
        this.serverUrl = serverUrl;
        this.sdkKey = sdkKey;
        this.core = null;
        this.initialized = false;
        this.sse = null;
    }

    /**
     * Initializes the WebAssembly module and opens the SSE stream.
     * The server sends the full flag state on connect, so no separate
     * REST bootstrap fetch is needed.
     */
    async init() {
        if (this.initialized) return;

        try {
            await init();
            this.core = new SidekickCoreWasm();
            this._connectDeltas();
            this.initialized = true;
        } catch (error) {
            console.error('[Sidekick Wasm] Initialization failed:', error);
            throw error;
        }
    }

    _connectDeltas() {
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
            console.log('[Sidekick Wasm] Stream connected — cache cleared, rebuilding from server state.');
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
                    // Properly remove the flag rather than zombie-upserting it.
                    this.core.delete_flag(event.key);
                }
            } catch (err) {
                console.error('[Sidekick Wasm] Failed to parse update:', err);
            }
        });

        this.sse.onerror = () => {
            // EventSource reconnects automatically; no action needed here.
            console.warn('[Sidekick Wasm] Stream disconnected — EventSource will reconnect automatically.');
        };
    }

    /**
     * Evaluate a flag locally in the browser via WebAssembly (< 1 microsecond).
     */
    isEnabled(flagKey, userKey, userAttributes = {}) {
        if (!this.initialized || !this.core) {
            console.warn('[Sidekick Wasm] Evaluated flag before init! Returning false.');
            return false;
        }
        return this.core.is_enabled(flagKey, userKey, userAttributes);
    }

    close() {
        if (this.sse) {
            this.sse.close();
            this.sse = null;
        }
    }
}
