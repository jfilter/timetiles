/**
 * PostgreSQL-backed rate-limit store.
 *
 * Uses one opaque key per window and a single atomic UPSERT per check so
 * multi-replica deployments share counters without changing route logic.
 *
 * @module
 * @category Services
 */

import { sql } from "@payloadcms/db-postgres/drizzle";
import type { Payload } from "payload";

import type { RateLimitCheckResult, RateLimitStats, RateLimitStatus, RateLimitStore } from "./store";

const toNumber = (value: unknown, fieldName: string): number => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  throw new TypeError(`Expected numeric field "${fieldName}" but received ${typeof value}`);
};

const toBoolean = (value: unknown, fieldName: string): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  throw new TypeError(`Expected boolean field "${fieldName}" but received ${typeof value}`);
};

export class PgRateLimitStore implements RateLimitStore {
  private readonly payload: Payload;

  constructor(payload: Payload) {
    this.payload = payload;
  }

  async checkAndIncrement(key: string, limit: number, windowMs: number): Promise<RateLimitCheckResult> {
    const result = await this.payload.db.drizzle.execute(sql`
      INSERT INTO payload.rate_limit_counters ("key", count, blocked, expires_at, updated_at)
      VALUES (${key}, 1, false, NOW() + ${windowMs} * INTERVAL '1 millisecond', NOW())
      ON CONFLICT ("key") DO UPDATE
      SET
        count = CASE
          WHEN payload.rate_limit_counters.expires_at <= NOW() THEN 1
          WHEN payload.rate_limit_counters.blocked THEN payload.rate_limit_counters.count
          ELSE payload.rate_limit_counters.count + 1
        END,
        blocked = CASE
          WHEN payload.rate_limit_counters.expires_at <= NOW() THEN false
          WHEN payload.rate_limit_counters.blocked THEN true
          ELSE payload.rate_limit_counters.count + 1 > ${limit}
        END,
        expires_at = CASE
          WHEN payload.rate_limit_counters.expires_at <= NOW() THEN NOW() + ${windowMs} * INTERVAL '1 millisecond'
          ELSE payload.rate_limit_counters.expires_at
        END,
        updated_at = NOW()
      RETURNING
        count,
        blocked,
        EXTRACT(EPOCH FROM expires_at) * 1000 AS "resetTime"
    `);

    const row = result.rows[0];

    if (!row) {
      throw new Error(`Failed to update rate limit counter for key ${key}`);
    }

    const count = toNumber(row["count"], "count");
    const blocked = toBoolean(row["blocked"], "blocked");
    const resetTime = toNumber(row["resetTime"], "resetTime");

    return { allowed: !blocked, remaining: blocked ? 0 : Math.max(0, limit - count), resetTime, blocked };
  }

  async peek(key: string): Promise<RateLimitStatus | null> {
    const result = await this.payload.db.drizzle.execute(sql`
      SELECT
        count,
        blocked,
        EXTRACT(EPOCH FROM expires_at) * 1000 AS "resetTime"
      FROM payload.rate_limit_counters
      WHERE "key" = ${key}
        AND expires_at > NOW()
      LIMIT 1
    `);

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      count: toNumber(row["count"], "count"),
      blocked: toBoolean(row["blocked"], "blocked"),
      resetTime: toNumber(row["resetTime"], "resetTime"),
    };
  }

  async reset(key: string): Promise<void> {
    await this.payload.db.drizzle.execute(sql`
      DELETE FROM payload.rate_limit_counters
      WHERE "key" = ${key}
    `);
  }

  async block(key: string, durationMs: number): Promise<void> {
    await this.payload.db.drizzle.execute(sql`
      INSERT INTO payload.rate_limit_counters ("key", count, blocked, expires_at, updated_at)
      VALUES (${key}, 999999, true, NOW() + ${durationMs} * INTERVAL '1 millisecond', NOW())
      ON CONFLICT ("key") DO UPDATE
      SET
        count = 999999,
        blocked = true,
        expires_at = NOW() + ${durationMs} * INTERVAL '1 millisecond',
        updated_at = NOW()
    `);
  }

  async cleanup(): Promise<number> {
    const result = await this.payload.db.drizzle.execute(sql`
      WITH deleted AS (
        DELETE FROM payload.rate_limit_counters
        WHERE expires_at <= NOW()
        RETURNING 1
      )
      SELECT COUNT(*)::int AS "deletedCount"
      FROM deleted
    `);

    const row = result.rows[0];
    return row ? toNumber(row["deletedCount"], "deletedCount") : 0;
  }

  async getStats(): Promise<RateLimitStats> {
    const result = await this.payload.db.drizzle.execute(sql`
      SELECT
        COUNT(*)::int AS "totalEntries",
        COUNT(*) FILTER (WHERE blocked = true AND expires_at > NOW())::int AS "blockedEntries",
        COUNT(*) FILTER (WHERE expires_at > NOW())::int AS "activeEntries"
      FROM payload.rate_limit_counters
    `);

    const row = result.rows[0];

    if (!row) {
      return { totalEntries: 0, blockedEntries: 0, activeEntries: 0 };
    }

    return {
      totalEntries: toNumber(row["totalEntries"], "totalEntries"),
      blockedEntries: toNumber(row["blockedEntries"], "blockedEntries"),
      activeEntries: toNumber(row["activeEntries"], "activeEntries"),
    };
  }
}
