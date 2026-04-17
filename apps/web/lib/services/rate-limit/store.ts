/**
 * Storage contract and shared types for rate-limit backends.
 *
 * The service layer constructs opaque keys per window and delegates
 * persistence to a backend-specific store implementation.
 *
 * @module
 * @category Services
 */

/**
 * Result of checking and incrementing a single rate-limit window.
 */
export interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  blocked: boolean;
}

/**
 * Current status for a single rate-limit key without incrementing.
 */
export interface RateLimitStatus {
  count: number;
  resetTime: number;
  blocked: boolean;
}

/**
 * Aggregate statistics for the underlying rate-limit store.
 */
export interface RateLimitStats {
  totalEntries: number;
  blockedEntries: number;
  activeEntries: number;
}

/**
 * Backend contract for rate-limit storage.
 */
export interface RateLimitStore {
  checkAndIncrement(key: string, limit: number, windowMs: number): Promise<RateLimitCheckResult>;
  peek(key: string): Promise<RateLimitStatus | null>;
  reset(key: string): Promise<void>;
  block(key: string, durationMs: number): Promise<void>;
  cleanup?(): Promise<number>;
  getStats?(): Promise<RateLimitStats>;
  destroy?(): void;
}
