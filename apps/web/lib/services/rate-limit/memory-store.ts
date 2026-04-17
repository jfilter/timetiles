/**
 * In-memory rate-limit backend.
 *
 * Preserves the existing single-process Map behavior so local development
 * and tests keep the same semantics unless `RATE_LIMIT_BACKEND=pg`.
 *
 * @module
 * @category Services
 */

import type { RateLimitCheckResult, RateLimitStats, RateLimitStatus, RateLimitStore } from "./store";

interface MemoryRateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly cache = new Map<string, MemoryRateLimitEntry>();

  checkAndIncrement(key: string, limit: number, windowMs: number): Promise<RateLimitCheckResult> {
    const now = Date.now();
    const entry = this.cache.get(key);

    if (!entry || now >= entry.resetTime) {
      const newEntry: MemoryRateLimitEntry = { count: 1, resetTime: now + windowMs, blocked: false };
      this.cache.set(key, newEntry);

      return Promise.resolve({ allowed: true, remaining: limit - 1, resetTime: newEntry.resetTime, blocked: false });
    }

    if (entry.blocked) {
      return Promise.resolve({ allowed: false, remaining: 0, resetTime: entry.resetTime, blocked: true });
    }

    entry.count++;

    if (entry.count > limit) {
      entry.blocked = true;
      return Promise.resolve({ allowed: false, remaining: 0, resetTime: entry.resetTime, blocked: true });
    }

    return Promise.resolve({
      allowed: true,
      remaining: limit - entry.count,
      resetTime: entry.resetTime,
      blocked: false,
    });
  }

  peek(key: string): Promise<RateLimitStatus | null> {
    const entry = this.cache.get(key);
    if (!entry || Date.now() >= entry.resetTime) {
      return Promise.resolve(null);
    }

    return Promise.resolve({ ...entry });
  }

  reset(key: string): Promise<void> {
    this.cache.delete(key);
    return Promise.resolve();
  }

  block(key: string, durationMs: number): Promise<void> {
    this.cache.set(key, { count: 999999, resetTime: Date.now() + durationMs, blocked: true });
    return Promise.resolve();
  }

  cleanup(): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now >= entry.resetTime) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    return Promise.resolve(cleanedCount);
  }

  getStats(): Promise<RateLimitStats> {
    const now = Date.now();
    let blockedEntries = 0;
    let activeEntries = 0;

    for (const entry of this.cache.values()) {
      if (now < entry.resetTime) {
        activeEntries++;
        if (entry.blocked) {
          blockedEntries++;
        }
      }
    }

    return Promise.resolve({ totalEntries: this.cache.size, blockedEntries, activeEntries });
  }

  destroy(): void {
    this.cache.clear();
  }
}
