/**
 * Service for managing user quotas and resource limits.
 *
 * This service provides centralized control over user resource limits, usage tracking,
 * and quota enforcement. It integrates with Payload CMS to enforce quotas and track
 * usage across various operations like file uploads, scheduled ingests, and event creation.
 *
 * ## Usage Tracking Architecture
 *
 * Usage tracking is stored in a separate `user-usage` collection rather than embedded
 * in the users collection. This separation:
 * - Prevents session-clearing issues that occurred when versioning was enabled on users
 * - Isolates authentication data from usage tracking
 * - Allows independent scaling and optimization of usage tracking
 *
 * ## Quotas vs Rate Limiting
 *
 * This service works alongside {@link RateLimitService} but serves a different purpose:
 *
 * **QuotaService (this service)**:
 * - Purpose: Long-term resource management (fair usage, capacity planning)
 * - Storage: Database (persistent, accurate) in `user-usage` collection
 * - Scope: Per user ID
 * - Time windows: Hours to lifetime (e.g., daily, total)
 * - Reset: Fixed times (midnight UTC for daily quotas)
 * - Examples: 10 uploads per day, 50,000 total events
 *
 * **RateLimitService**:
 * - Purpose: Short-term abuse prevention (DDoS, spam, burst attacks)
 * - Storage: In-memory (fast, ephemeral)
 * - Scope: Per IP address or identifier
 * - Time windows: Seconds to hours
 * - Reset: Sliding windows
 * - Examples: 1 upload per 5 seconds, 5 per hour
 *
 * Both checks typically run together - rate limits first (fast fail), then quotas (accurate tracking).
 *
 * @example
 * ```typescript
 * // Typical usage pattern: check both rate limits and quotas
 * import { getRateLimitService } from '@/lib/services/rate-limit-service';
 * import { createQuotaService } from '@/lib/services/quota-service';
 *
 * // 1. Rate limit check (fast, prevents abuse)
 * const rateLimitService = getRateLimitService(payload);
 * const rateCheck = rateLimitService.checkTrustLevelRateLimit(
 *   clientIp,
 *   user,
 *   "FILE_UPLOAD"
 * );
 * if (!rateCheck.allowed) {
 *   return res.status(429).json({ error: "Too many requests" });
 * }
 *
 * // 2. Quota check (accurate, tracks long-term usage)
 * const quotaService = createQuotaService(payload);
 * const quotaCheck = await quotaService.checkQuota(
 *   user,
 *   "FILE_UPLOADS_PER_DAY"
 * );
 * if (!quotaCheck.allowed) {
 *   throw new QuotaExceededError(
 *     quotaCheck.quotaKey,
 *     quotaCheck.current,
 *     quotaCheck.limit,
 *     quotaCheck.resetTime
 *   );
 * }
 *
 * // 3. Process the request and track usage
 * await processFileUpload();
 * await quotaService.incrementUsage(user.id, "FILE_UPLOADS_PER_DAY", 1);
 * ```
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
 */
export class QuotaExceededError extends Error {
  public statusCode = 429;
  public quotaKey: QuotaKey;
  public current: number;
  public limit: number;
  public resetTime?: Date;

  constructor(quotaKey: QuotaKey, current: number, limit: number, resetTime?: Date) {
    const message = QUOTAS[quotaKey].errorMessage(current, limit);
    super(message);
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
   * Uses upsert pattern to ensure usage record exists.
   *
   * @param req - Optional PayloadRequest to reuse the caller's transaction
   */
  async getOrCreateUsageRecord(userId: UserIdentifier, req?: Partial<PayloadRequest>): Promise<UserUsageRecord> {
    const normalizedUserId = normalizeUserId(userId);

    try {
      // Try to find existing usage record
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

      // Create new usage record
      try {
        return await this.payload.create({
          collection: USER_USAGE_COLLECTION,
          data: {
            user: normalizedUserId,
            urlFetchesToday: 0,
            fileUploadsToday: 0,
            ingestJobsToday: 0,
            currentActiveSchedules: 0,
            totalEventsCreated: 0,
            currentCatalogs: 0,
            currentScraperRepos: 0,
            scraperRunsToday: 0,
            lastResetDate: new Date().toISOString(),
          },
          overrideAccess: true,
          ...(req && { req }),
        });
      } catch (createError) {
        // Handle unique constraint violation from concurrent requests (TOCTOU race).
        // Another request may have created the record between our find and create.
        const message = createError instanceof Error ? createError.message : String(createError);
        if (message.includes("duplicate") || message.includes("unique") || message.includes("23505")) {
          const retry = await this.payload.find({
            collection: USER_USAGE_COLLECTION,
            where: { user: { equals: normalizedUserId } },
            limit: 1,
            overrideAccess: true,
            ...(req && { req }),
          });
          if (retry.docs.length > 0 && retry.docs[0]) {
            return retry.docs[0];
          }
        }
        throw createError;
      }
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

    // Check if user has quota fields directly on the user object (from database)
    const userQuotas = user.quotas ?? {};

    // Build effective quotas from user fields, falling back to defaults
    const effectiveQuotas: UserQuotas = {
      maxActiveSchedules: userQuotas.maxActiveSchedules ?? defaultQuotas.maxActiveSchedules,
      maxUrlFetchesPerDay: userQuotas.maxUrlFetchesPerDay ?? defaultQuotas.maxUrlFetchesPerDay,
      maxFileUploadsPerDay: userQuotas.maxFileUploadsPerDay ?? defaultQuotas.maxFileUploadsPerDay,
      maxEventsPerImport: userQuotas.maxEventsPerImport ?? defaultQuotas.maxEventsPerImport,
      maxTotalEvents: userQuotas.maxTotalEvents ?? defaultQuotas.maxTotalEvents,
      maxIngestJobsPerDay: userQuotas.maxIngestJobsPerDay ?? defaultQuotas.maxIngestJobsPerDay,
      maxFileSizeMB: userQuotas.maxFileSizeMB ?? defaultQuotas.maxFileSizeMB,
      maxCatalogsPerUser: userQuotas.maxCatalogsPerUser ?? defaultQuotas.maxCatalogsPerUser,
      maxScraperRepos: userQuotas.maxScraperRepos ?? defaultQuotas.maxScraperRepos,
      maxScraperRunsPerDay: userQuotas.maxScraperRunsPerDay ?? defaultQuotas.maxScraperRunsPerDay,
    };

    // If user has custom quotas JSON field, merge those too (with runtime validation)
    if (user.customQuotas && typeof user.customQuotas === "object") {
      const validKeys: Set<string> = new Set(Object.keys(DEFAULT_QUOTAS[TRUST_LEVELS.REGULAR]));
      const validated: Partial<UserQuotas> = {};
      for (const [key, value] of Object.entries(user.customQuotas as Record<string, unknown>)) {
        if (validKeys.has(key) && typeof value === "number") {
          (validated as Record<string, number>)[key] = value;
        }
      }
      if (Object.keys(validated).length > 0) {
        return { ...effectiveQuotas, ...validated };
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
   * Uses Payload's bulk update API with an empty where clause to update all
   * user-usage records in a single operation.
   */
  async resetAllDailyCounters(): Promise<void> {
    try {
      const now = new Date().toISOString();

      // Update all user-usage records
      const result = await this.payload.update({
        collection: USER_USAGE_COLLECTION,
        where: {}, // Empty where = update all
        data: { ...DAILY_RESET_DATA, lastResetDate: now },
        overrideAccess: true,
      });

      const affectedRecords = result.docs.length;
      logger.info(`Daily counter reset completed for ${affectedRecords} user-usage records`);

      // Log any errors that occurred during the update
      if (result.errors.length > 0) {
        logger.error("Some user-usage records failed to update during daily counter reset", {
          errorCount: result.errors.length,
          errors: result.errors,
        });
      }
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
