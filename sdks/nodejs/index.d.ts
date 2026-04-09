export interface CheckgateClientOptions {
  /** Base URL of your Checkgate server. */
  serverUrl: string;
  /** SDK key for authentication. Leave unset for open (dev-only) mode. */
  sdkKey?: string;
  /** SSE reconnect delay in milliseconds. Default: 3000. */
  reconnectDelayMs?: number;
}

/**
 * Checkgate Node.js SDK client.
 *
 * Connects once to the server via SSE, downloads all flags, and evaluates
 * them locally in <1 µs with zero network IO on every isEnabled() call.
 */
export declare class CheckgateClient {
  constructor(options: CheckgateClientOptions);

  /**
   * Connects to the server's SSE stream and downloads the current flag set.
   * Resolves when the initial bootstrap is complete.
   * Sets up automatic reconnection with exponential backoff on connection loss.
   */
  connect(): Promise<void>;

  /**
   * Evaluates a flag for a user synchronously (no await, no network).
   *
   * @param flagKey      The flag key to evaluate.
   * @param userKey      Stable user identifier (used for rollout hashing).
   * @param userAttributes  User attributes for targeting rule matching.
   * @returns `true` if the flag is enabled for this user, `false` otherwise.
   *          Returns `false` if the flag does not exist.
   */
  isEnabled(
    flagKey: string,
    userKey: string,
    userAttributes?: Record<string, string>
  ): boolean;

  /**
   * Closes the SSE connection and cleans up resources.
   * Call on graceful shutdown.
   */
  disconnect(): void;
}
