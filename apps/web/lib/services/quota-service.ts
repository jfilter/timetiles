/**
 * Service for managing user quotas and resource limits.
 *
 * Centralized control over long-term user resource limits, usage tracking, and
 * quota enforcement. Usage is stored in a separate `user-usage` collection to
 * keep versioning-sensitive auth data isolated from high-churn counters.
 *
 * For the quotas-vs-rate-limiting comparison and the canonical usage pattern
 * (rate-limit check -> quota check -> action), see
 * `docs/adr/0026-quota-system.md#quotas-vs-rate-limiting`.
 *
 * @see {@link RateLimitService} for short-term abuse prevention
 *
 * @module
 * @category Services
 */
import { eq, sql } from "@payloadcms/db-postgres/drizzle";
import type { Payload, PayloadRequest } from "payload";

import {
  DEFAULT_QUOTAS,
  normalizeTrustLevel,
  type QuotaKey,
  QUOTAS,
  TRUST_LEVELS,
  type UserQuotas,
  type UserUsage,
} from "@/lib/constants/quota-constants";
import { drizzleColumns } from "@/lib/database/drizzle-helpers";
import { createLogger } from "@/lib/logger";
import { AppError } from "@/lib/types/errors";
import { parseDateInput } from "@/lib/utils/date";
import { parseStrictInteger } from "@/lib/utils/event-params";
import { user_usage } from "@/payload-generated-schema";
import type { User, UserUsage as UserUsageRecord } from "@/payload-types";

const logger = createLogger("quota-service");

/**
 * Pre-cast Drizzle table for dynamic column access.
 * @see drizzleColumns in `@/lib/database/drizzle-helpers`
 */
const userUsageColumns = drizzleColumns(user_usage);

/** Collection slug for user usage tracking */
const USER_USAGE_COLLECTION = "user-usage";

/** All daily usage field names, derived from the QUOTAS registry at module load. */
const DAILY_USAGE_FIELDS: Array<keyof Omit<UserUsage, "lastResetDate">> = Object.values(QUOTAS)
  .filter((d) => d.daily && d.usageField != null)
  .map((d) => d.usageField);

/** Precomputed reset payload for daily counters (e.g. { urlFetchesToday: 0, ... }) */
const DAILY_RESET_DATA = Object.fromEntries(DAILY_USAGE_FIELDS.map((f) => [f, 0]));

import type { DrizzleInstance } from "@/lib/database/drizzle-transaction";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";

type UserIdentifier = number | string | Pick<User, "id"> | null | undefined;

const normalizeUserId = (userId: UserIdentifier): number => {
  const rawUserId = typeof userId === "object" && userId !== null ? userId.id : userId;

  if (rawUserId == null || rawUserId === "") {
    throw new Error("Invalid user ID for quota tracking: missing user ID");
  }

  const normalizedUserId = parseStrictInteger(rawUserId);

  if (normalizedUserId == null) {
    throw new Error(`Invalid user ID for quota tracking: ${String(rawUserId)}`);
  }

  return normalizedUserId;
};

/**
 * Custom error class for quota exceeded scenarios.
 *
 * Extends {@link AppError} so that the centralized `handleError` in
 * `lib/api/errors.ts` automatically returns a structured 429 response
 * without needing a manual conversion wrapper.
 */
export class QuotaExceededError extends AppError {
  public quotaKey: QuotaKey;
  public current: number;
  public limit: number;
  public resetTime?: Date;

  constructor(quotaKey: QuotaKey, current: number, limit: number, resetTime?: Date) {
    const message = QUOTAS[quotaKey].errorMessage(current, limit);
    super(429, message, "QUOTA_EXCEEDED");
    this.name = "QuotaExceededError";
    this.quotaKey = quotaKey;
    this.current = current;
    this.limit = limit;
    this.resetTime = resetTime;
  }
}

/**
 * Result of a quota check operation.
 */
export interface QuotaCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  resetTime?: Date;
  quotaKey: QuotaKey;
}

/**
 * Service for managing user quotas and resource limits.
 */
export class QuotaService {
  private readonly payload: Payload;

  constructor(payload: Payload) {
    this.payload = payload;
  }

  private getDrizzle(req?: Partial<PayloadRequest>): Promise<DrizzleInstance> {
    return getTransactionAwareDrizzle(this.payload, req);
  }

  /**
   * Get or create usage record for a user from the user-usage collection.
   *
   * Uses a single atomic INSERT ... ON CONFLICT DO NOTHING via Drizzle, then
   * SELECTs the row. This avoids the previous find-then-create pattern that
   * deadlocked under concurrent callers: when two concurrent `payload.create`
   * attempts both failed the unique constraint, the ValidationError thrown
   * by Payload ABORTED the outer transaction, which then poisoned every
   * subsequent `payload.*({ req })` call (the retry, the compensating
   * `decrementUsage`, even the beforeEach truncate of the next test).
   *
   * @param req - Optional PayloadRequest to reuse the caller's transaction
   */
  async getOrCreateUsageRecord(userId: UserIdentifier, req?: Partial<PayloadRequest>): Promise<UserUsageRecord> {
    const normalizedUserId = normalizeUserId(userId);

    try {
      const drizzle = await this.getDrizzle(req);

      // ON CONFLICT DO NOTHING → no constraint violation, no aborted tx. If
      // the row already existed, RETURNING yields nothing and we SELECT it.
      const inserted = await drizzle
        .insert(user_usage)
        // The `as never` cast keeps Drizzle's strict column-shape checker
        // happy while we pass the defaults we know are valid for this table.
        .values({
          user: normalizedUserId,
          urlFetchesToday: 0,
          fileUploadsToday: 0,
          ingestJobsToday: 0,
          currentActiveSchedules: 0,
          totalEventsCreated: 0,
          currentCatalogs: 0,
          currentScraperRepos: 0,
          scraperRunsToday: 0,
          lastResetDate: new Date(),
          updatedAt: new Date(),
          createdAt: new Date(),
        })
        .onConflictDoNothing({ target: user_usage.user })
        .returning();

      if (inserted.length > 0 && inserted[0]) {
        // Freshly created — re-fetch via Payload to return a fully hydrated
        // doc (matches the previous return shape).
        const id = (inserted[0] as { id: number }).id;
        return await this.payload.findByID({
          collection: USER_USAGE_COLLECTION,
          id,
          overrideAccess: true,
          ...(req && { req }),
        });
      }

      // Row already existed (concurrent creator won). Fetch it.
      const existing = await this.payload.find({
        collection: USER_USAGE_COLLECTION,
        where: { user: { equals: normalizedUserId } },
        limit: 1,
        overrideAccess: true,
        ...(req && { req }),
      });
      if (existing.docs.length > 0 && existing.docs[0]) {
        return existing.docs[0];
      }

      throw new Error(`user-usage row for user ${normalizedUserId} not found after upsert`);
    } catch (error) {
      logger.error("Failed to get or create usage record", { error, userId: normalizedUserId });
      throw error;
    }
  }

  /**
   * Get effective quotas for a user, considering trust level and custom overrides.
   */
  getEffectiveQuotas(user: User | null | undefined): UserQuotas {
    if (!user) {
      // Return most restrictive quotas for unauthenticated users
      return DEFAULT_QUOTAS[TRUST_LEVELS.UNTRUSTED];
    }

    const trustLevel = normalizeTrustLevel(user.trustLevel);
    const defaultQuotas = DEFAULT_QUOTAS[trustLevel];

    // Trust-level defaults are authoritative. The user.quotas snapshot is only
    // used as a performance hint — if trust level changes, the snapshot may be
    // stale (e.g., user created with trustLevel 0 → quotas.maxUrlFetchesPerDay=0,
    // later upgraded to trustLevel 5 where the default is -1). Always derive
    // effective quotas from the current trust level.
    const effectiveQuotas: UserQuotas = { ...defaultQuotas };

    // If user has custom quotas JSON field, merge those (admin-set overrides)
    if (user.customQuotas && typeof user.customQuotas === "object") {
      const validKeys: Set<string> = new Set(Object.keys(defaultQuotas));
      for (const [key, value] of Object.entries(user.customQuotas as Record<string, unknown>)) {
        if (validKeys.has(key) && typeof value === "number") {
          (effectiveQuotas as unknown as Record<string, number>)[key] = value;
        }
      }
    }

    return effectiveQuotas;
  }

  /**
   * Get current usage for a user from the user-usage collection.
   */
  async getCurrentUsage(userId: UserIdentifier): Promise<UserUsage | null> {
    const normalizedUserId = normalizeUserId(userId);

    try {
      const usageRecord = await this.payload.find({
        collection: USER_USAGE_COLLECTION,
        where: { user: { equals: normalizedUserId } },
        limit: 1,
        overrideAccess: true,
      });

      const doc = usageRecord.docs[0];
      if (!doc) {
        return null;
      }

      return {
        currentActiveSchedules: doc.currentActiveSchedules ?? 0,
        urlFetchesToday: doc.urlFetchesToday ?? 0,
        fileUploadsToday: doc.fileUploadsToday ?? 0,
        ingestJobsToday: doc.ingestJobsToday ?? 0,
        totalEventsCreated: doc.totalEventsCreated ?? 0,
        currentCatalogs: doc.currentCatalogs ?? 0,
        currentScraperRepos: doc.currentScraperRepos ?? 0,
        scraperRunsToday: doc.scraperRunsToday ?? 0,
        lastResetDate: doc.lastResetDate ?? new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Failed to get current usage", { error, userId: normalizedUserId });
      return null;
    }
  }

  /**
   * Check if a user can perform an action based on quota limits.
   * Now async since it reads from the separate user-usage collection.
   */
  async checkQuota(
    user: User | null | undefined,
    quotaKey: QuotaKey,
    amount: number = 1,
    req?: { context?: Record<string, unknown> }
  ): Promise<QuotaCheckResult> {
    const desc = QUOTAS[quotaKey];

    // Get effective quotas
    const quotas = this.getEffectiveQuotas(user);
    const limit = quotas[desc.limitField];

    // Check if unlimited (-1)
    if (limit === -1) {
      return { allowed: true, current: 0, limit: -1, remaining: -1, quotaKey };
    }

    // For unauthenticated users, only check the limit
    if (!user) {
      const allowed = amount <= limit;
      return { allowed, current: 0, limit, remaining: allowed ? limit - amount : 0, quotaKey };
    }

    if (!desc.usageField) {
      // For quotas without usage tracking (like file size)
      return { allowed: amount <= limit, current: 0, limit, remaining: limit, quotaKey };
    }

    // Per-request cache: reuse usage record if already fetched this request
    const cacheKey = `_quotaUsage_${user.id}`;
    const context = req?.context;
    let usage: UserUsage | null;

    if (context && cacheKey in context) {
      usage = context[cacheKey] as UserUsage | null;
    } else {
      usage = await this.getCurrentUsage(user.id);
      if (context) {
        context[cacheKey] = usage;
      }
    }

    if (!usage) {
      // No usage record yet - will be created on first increment
      logger.debug("User has no usage record, using defaults", { userId: user.id });
      return { allowed: amount <= limit, current: 0, limit, remaining: limit, quotaKey };
    }

    const current = usage[desc.usageField] || 0;
    const wouldExceed = current + amount > limit;

    // Check if daily limit and needs reset
    let resetTime: Date | undefined;
    if (desc.daily) {
      resetTime = this.getNextResetTime();

      // Check if usage should be reset
      if (this.shouldResetDailyUsage(usage.lastResetDate)) {
        // Assume reset and return current=0
        // The actual reset will happen on next increment
        logger.debug("Daily quota needs reset, assuming current=0 for check", { userId: user.id, quotaKey });
        return { allowed: amount <= limit, current: 0, limit, remaining: limit, resetTime, quotaKey };
      }
    }

    logger.debug("checkQuota: Returning final result", { wouldExceed, current, limit });
    return { allowed: !wouldExceed, current, limit, remaining: Math.max(0, limit - current), resetTime, quotaKey };
  }

  /**
   * Increment usage counter for a user in the user-usage collection.
   *
   * Uses atomic SQL UPDATE to prevent race conditions from concurrent requests.
   * The column is incremented directly in the database rather than using a
   * read-modify-write pattern that could lose updates.
   */
  async incrementUsage(
    userId: UserIdentifier,
    quotaKey: QuotaKey,
    amount: number = 1,
    req?: Partial<PayloadRequest>
  ): Promise<void> {
    const desc = QUOTAS[quotaKey];

    if (!desc.usageField) {
      throw new Error(`Quota "${quotaKey}" has no usage field and cannot be incremented`);
    }

    const usageField = desc.usageField;
    const normalizedUserId = normalizeUserId(userId);

    try {
      logger.debug("incrementUsage: Entry", { userId: normalizedUserId, quotaKey, amount });

      // Ensure usage record exists before atomic update
      await this.getOrCreateUsageRecord(normalizedUserId, req);

      const drizzle = await this.getDrizzle(req);

      if (desc.daily) {
        // For daily types, atomically reset stale counters and increment the target.
        // All daily columns are reset in a single UPDATE to prevent stale data.
        const needsReset = sql`${user_usage.lastResetDate} IS NULL OR ${user_usage.lastResetDate}::date < CURRENT_DATE`;

        const setClauses: Record<string, unknown> = {};
        for (const field of DAILY_USAGE_FIELDS) {
          const col = userUsageColumns[field];
          const increment = field === usageField ? amount : 0;
          setClauses[field] = sql`CASE WHEN ${needsReset} THEN 0 ELSE COALESCE(${col}, 0) END + ${increment}`;
        }
        setClauses.lastResetDate = sql`CASE WHEN ${needsReset} THEN NOW() ELSE ${user_usage.lastResetDate} END`;
        setClauses.updatedAt = sql`NOW()`;

        await drizzle.update(user_usage).set(setClauses).where(eq(user_usage.user, normalizedUserId));
      } else {
        // For non-daily types, simple atomic increment
        const col = userUsageColumns[usageField];
        await drizzle
          .update(user_usage)
          .set({ [usageField]: sql`COALESCE(${col}, 0) + ${amount}`, updatedAt: sql`NOW()` })
          .where(eq(user_usage.user, normalizedUserId));
      }

      logger.debug("Usage incremented", { userId: normalizedUserId, quotaKey, amount });
    } catch (error) {
      logger.error("Failed to increment usage", { error, userId: normalizedUserId, quotaKey, amount });
      throw error;
    }
  }

  /**
   * Decrement usage counter for a user (e.g., when a schedule is disabled).
   *
   * Uses atomic SQL UPDATE with GREATEST to prevent going below zero and
   * avoid race conditions from concurrent requests.
   */
  async decrementUsage(
    userId: UserIdentifier,
    quotaKey: QuotaKey,
    amount: number = 1,
    req?: Partial<PayloadRequest>
  ): Promise<void> {
    const desc = QUOTAS[quotaKey];

    if (!desc.usageField) {
      throw new Error(`Quota "${quotaKey}" has no usage field and cannot be decremented`);
    }

    const usageField = desc.usageField;
    const normalizedUserId = normalizeUserId(userId);

    try {
      // Ensure usage record exists before atomic update
      await this.getOrCreateUsageRecord(normalizedUserId, req);

      const drizzle = await this.getDrizzle(req);
      const col = userUsageColumns[usageField];
      await drizzle
        .update(user_usage)
        .set({ [usageField]: sql`GREATEST(0, COALESCE(${col}, 0) - ${amount})`, updatedAt: sql`NOW()` })
        .where(eq(user_usage.user, normalizedUserId));

      logger.debug("Usage decremented", { userId: normalizedUserId, quotaKey, amount });
    } catch (error) {
      logger.error("Failed to decrement usage", { error, userId: normalizedUserId, quotaKey, amount });
      throw error;
    }
  }

  /**
   * Reset daily counters for a user.
   */
  async resetDailyCounters(userId: UserIdentifier): Promise<void> {
    const normalizedUserId = normalizeUserId(userId);

    try {
      // Find the usage record
      const usageRecords = await this.payload.find({
        collection: USER_USAGE_COLLECTION,
        where: { user: { equals: normalizedUserId } },
        limit: 1,
        overrideAccess: true,
      });

      const usageRecord = usageRecords.docs[0];
      if (!usageRecord) {
        // No usage record - nothing to reset
        return;
      }

      await this.payload.update({
        collection: USER_USAGE_COLLECTION,
        id: usageRecord.id,
        data: { ...DAILY_RESET_DATA, lastResetDate: new Date().toISOString() },
        overrideAccess: true,
      });

      logger.info("Daily counters reset", { userId: normalizedUserId });
    } catch (error) {
      logger.error("Failed to reset daily counters", { error, userId: normalizedUserId });
    }
  }

  /**
   * Reset daily counters for all users (called by background job).
   *
   * Uses a single Drizzle UPDATE to reset every user-usage row in one SQL
   * statement. For 10k users this is 1 query vs. 10k queries via Payload's
   * per-row ORM update path.
   */
  async resetAllDailyCounters(): Promise<void> {
    try {
      // Single bulk UPDATE; no row-level hooks needed for counter resets
      const drizzle = await this.getDrizzle();
      const result = await drizzle
        .update(user_usage)
        .set({ ...DAILY_RESET_DATA, lastResetDate: sql`NOW()`, updatedAt: sql`NOW()` })
        .returning({ id: user_usage.id });

      logger.info(`Daily counter reset completed for ${result.length} user-usage records`);
    } catch (error) {
      logger.error("Failed to reset all daily counters", { error });
      throw error; // Re-throw so tests can catch failures
    }
  }

  /**
   * Check if daily usage should be reset.
   */
  private shouldResetDailyUsage(lastResetDate: string): boolean {
    if (!lastResetDate) return true;

    const lastReset = parseDateInput(lastResetDate);
    if (!lastReset) {
      return true;
    }

    const now = new Date();

    // Reset if it's a new UTC day
    return (
      lastReset.getUTCFullYear() !== now.getUTCFullYear() ||
      lastReset.getUTCMonth() !== now.getUTCMonth() ||
      lastReset.getUTCDate() !== now.getUTCDate()
    );
  }

  /**
   * Get the next reset time (midnight UTC).
   */
  private getNextResetTime(): Date {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow;
  }

  /**
   * Validate a quota check and throw if exceeded.
   * Now async since checkQuota is async.
   * @throws {QuotaExceededError} if the quota would be exceeded
   */
  async validateQuota(user: User | null | undefined, quotaKey: QuotaKey, amount: number = 1): Promise<void> {
    const result = await this.checkQuota(user, quotaKey, amount);

    if (!result.allowed) {
      throw new QuotaExceededError(quotaKey, result.current, result.limit, result.resetTime);
    }
  }

  /**
   * Atomically check quota and increment usage in a single SQL statement.
   *
   * Eliminates the TOCTOU race between separate checkQuota() + incrementUsage() calls.
   * The UPDATE only succeeds if the current value is below the limit, so concurrent
   * requests cannot both slip through.
   *
   * @returns true if increment succeeded, false if quota would be exceeded
   * @throws {QuotaExceededError} if quota exceeded and throwOnExceeded is true
   */
  async checkAndIncrementUsage(
    user: User,
    quotaKey: QuotaKey,
    amount: number = 1,
    req?: Partial<PayloadRequest>,
    throwOnExceeded: boolean = true
  ): Promise<boolean> {
    const desc = QUOTAS[quotaKey];

    if (!desc.usageField) {
      throw new Error(`Quota "${quotaKey}" has no usage field and cannot be incremented`);
    }

    const usageField = desc.usageField;
    const normalizedUserId = normalizeUserId(user.id);
    const quotas = this.getEffectiveQuotas(user);
    const limit = quotas[desc.limitField];

    // Unlimited quota — just increment
    if (limit === -1) {
      await this.incrementUsage(normalizedUserId, quotaKey, amount, req);
      return true;
    }

    // Ensure usage record exists
    await this.getOrCreateUsageRecord(normalizedUserId, req);

    const drizzle = await this.getDrizzle(req);
    const col = userUsageColumns[usageField];

    let result: { id: number }[];

    if (desc.daily) {
      // For daily quotas, reset stale counters before checking the limit.
      // Uses the same CASE WHEN pattern as incrementUsage to handle the window
      // between midnight UTC and the quota-reset job.
      const needsReset = sql`${user_usage.lastResetDate} IS NULL OR ${user_usage.lastResetDate}::date < CURRENT_DATE`;
      const effectiveValue = sql`CASE WHEN ${needsReset} THEN 0 ELSE COALESCE(${col}, 0) END`;

      const setClauses: Record<string, unknown> = {};
      for (const field of DAILY_USAGE_FIELDS) {
        const fieldCol = userUsageColumns[field];
        const increment = field === usageField ? amount : 0;
        setClauses[field] = sql`CASE WHEN ${needsReset} THEN 0 ELSE COALESCE(${fieldCol}, 0) END + ${increment}`;
      }
      setClauses.lastResetDate = sql`CASE WHEN ${needsReset} THEN NOW() ELSE ${user_usage.lastResetDate} END`;
      setClauses.updatedAt = sql`NOW()`;

      result = await drizzle
        .update(user_usage)
        .set(setClauses)
        .where(sql`${user_usage.user} = ${normalizedUserId} AND ${effectiveValue} + ${amount} <= ${limit}`)
        .returning({ id: user_usage.id });
    } else {
      // For non-daily quotas, simple atomic check-and-increment
      result = await drizzle
        .update(user_usage)
        .set({ [usageField]: sql`COALESCE(${col}, 0) + ${amount}`, updatedAt: sql`NOW()` })
        .where(sql`${user_usage.user} = ${normalizedUserId} AND COALESCE(${col}, 0) + ${amount} <= ${limit}`)
        .returning({ id: user_usage.id });
    }

    if (result.length === 0) {
      // Quota exceeded — no rows updated
      if (throwOnExceeded) {
        const usage = await this.getCurrentUsage(normalizedUserId);
        const current = usage?.[usageField] ?? 0;
        throw new QuotaExceededError(quotaKey, current, limit);
      }
      return false;
    }

    return true;
  }

  /**
   * Get minimal quota headers for HTTP responses.
   * Now async since checkQuota is async.
   *
   * Security: Only returns operation-specific rate limit info, does not expose:
   * - Trust levels (internal scoring system)
   * - Detailed quotas across all types (system architecture)
   * - Exact reset times (rate limiting strategy)
   */
  async getQuotaHeaders(user: User | null | undefined, quotaKey?: QuotaKey): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    if (!user) {
      return headers;
    }

    // Only add specific quota information if requested for a specific operation
    if (quotaKey) {
      const result = await this.checkQuota(user, quotaKey);

      // Return only minimal rate-limit information for the current operation
      // Do not expose exact limits for admin users (would reveal privileged status)
      headers["X-RateLimit-Remaining"] = String(result.remaining);

      // Indicate if quotas reset daily (but not exact time to prevent attack timing)
      if (QUOTAS[quotaKey].daily) {
        headers["X-RateLimit-Reset-Period"] = "daily";
      }
    }

    return headers;
  }
}

/**
 * Create a quota service instance.
 *
 * Returns a fresh instance each call. The service is stateless (all data
 * lives in the database), so there is no benefit to caching the instance.
 */
export const createQuotaService = (payload: Payload): QuotaService => new QuotaService(payload);
