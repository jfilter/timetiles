/**
 * Service for managing user quotas and resource limits.
 *
 * This service provides centralized control over user resource limits, usage tracking,
 * and quota enforcement. It integrates with Payload CMS to enforce quotas and track
 * usage across various operations like file uploads, scheduled imports, and event creation.
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
 * import { getQuotaService } from '@/lib/services/quota-service';
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
 * const quotaService = getQuotaService(payload);
 * const quotaCheck = await quotaService.checkQuota(
 *   user,
 *   QUOTA_TYPES.FILE_UPLOADS_PER_DAY
 * );
 * if (!quotaCheck.allowed) {
 *   throw new QuotaExceededError(
 *     quotaCheck.quotaType,
 *     quotaCheck.current,
 *     quotaCheck.limit,
 *     quotaCheck.resetTime
 *   );
 * }
 *
 * // 3. Process the request and track usage
 * await processFileUpload();
 * await quotaService.incrementUsage(user.id, USAGE_TYPES.FILE_UPLOADS_TODAY, 1);
 * ```
 *
 * @see {@link RateLimitService} for short-term abuse prevention
 *
 * @module
 * @category Services
 */
import type { Payload, PayloadRequest } from "payload";

import {
  DEFAULT_QUOTAS,
  QUOTA_ERROR_MESSAGES,
  QUOTA_TYPES,
  type QuotaType,
  TRUST_LEVELS,
  type TrustLevel,
  USAGE_TYPES,
  type UsageType,
  type UserQuotas,
  type UserUsage,
} from "@/lib/constants/quota-constants";
import { createLogger } from "@/lib/logger";
import type { User, UserUsage as UserUsageRecord } from "@/payload-types";

const logger = createLogger("quota-service");

/** Collection slug for user usage tracking */
const USER_USAGE_COLLECTION = "user-usage";

/**
 * Custom error class for quota exceeded scenarios.
 */
export class QuotaExceededError extends Error {
  public statusCode = 429;
  public quotaType: QuotaType;
  public current: number;
  public limit: number;
  public resetTime?: Date;

  constructor(quotaType: QuotaType, current: number, limit: number, resetTime?: Date) {
    const message = QUOTA_ERROR_MESSAGES[quotaType](current, limit);
    super(message);
    this.name = "QuotaExceededError";
    this.quotaType = quotaType;
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
  quotaType: QuotaType;
}

/**
 * Service for managing user quotas and resource limits.
 */
export class QuotaService {
  private readonly payload: Payload;

  constructor(payload: Payload) {
    this.payload = payload;
  }

  /**
   * Get or create usage record for a user from the user-usage collection.
   * Uses upsert pattern to ensure usage record exists.
   */
  async getOrCreateUsageRecord(userId: number): Promise<UserUsageRecord> {
    try {
      // Try to find existing usage record
      const existing = await this.payload.find({
        collection: USER_USAGE_COLLECTION,
        where: { user: { equals: userId } },
        limit: 1,
        overrideAccess: true,
      });

      if (existing.docs.length > 0 && existing.docs[0]) {
        return existing.docs[0];
      }

      // Create new usage record
      return await this.payload.create({
        collection: USER_USAGE_COLLECTION,
        data: {
          user: userId,
          urlFetchesToday: 0,
          fileUploadsToday: 0,
          importJobsToday: 0,
          currentActiveSchedules: 0,
          totalEventsCreated: 0,
          currentCatalogs: 0,
          lastResetDate: new Date().toISOString(),
        },
        overrideAccess: true,
      });
    } catch (error) {
      logger.error("Failed to get or create usage record", { error, userId });
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

    const trustLevelValue = Number(user.trustLevel ?? TRUST_LEVELS.REGULAR);
    const trustLevel = trustLevelValue as TrustLevel;
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
      maxImportJobsPerDay: userQuotas.maxImportJobsPerDay ?? defaultQuotas.maxImportJobsPerDay,
      maxFileSizeMB: userQuotas.maxFileSizeMB ?? defaultQuotas.maxFileSizeMB,
      maxCatalogsPerUser: userQuotas.maxCatalogsPerUser ?? defaultQuotas.maxCatalogsPerUser,
    };

    // If user has custom quotas JSON field, merge those too
    if (user.customQuotas && typeof user.customQuotas === "object") {
      return {
        ...effectiveQuotas,
        ...(user.customQuotas as Partial<UserQuotas>),
      };
    }

    return effectiveQuotas;
  }

  /**
   * Get current usage for a user from the user-usage collection.
   */
  async getCurrentUsage(userId: number): Promise<UserUsage | null> {
    try {
      const usageRecord = await this.payload.find({
        collection: USER_USAGE_COLLECTION,
        where: { user: { equals: userId } },
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
        importJobsToday: doc.importJobsToday ?? 0,
        totalEventsCreated: doc.totalEventsCreated ?? 0,
        currentCatalogs: doc.currentCatalogs ?? 0,
        lastResetDate: doc.lastResetDate ?? new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Failed to get current usage", { error, userId });
      return null;
    }
  }

  /**
   * Check if a user can perform an action based on quota limits.
   * Now async since it reads from the separate user-usage collection.
   */
  async checkQuota(user: User | null | undefined, quotaType: QuotaType, amount: number = 1): Promise<QuotaCheckResult> {
    // Get effective quotas
    const quotas = this.getEffectiveQuotas(user);
    const limit = quotas[quotaType];

    // Check if unlimited (-1)
    if (limit === -1) {
      return {
        allowed: true,
        current: 0,
        limit: -1,
        remaining: -1,
        quotaType,
      };
    }

    // For unauthenticated users, only check the limit
    if (!user) {
      const allowed = amount <= limit;
      return {
        allowed,
        current: 0,
        limit,
        remaining: allowed ? limit - amount : 0,
        quotaType,
      };
    }

    // Map quota type to usage type
    const usageKey = this.getUsageKeyForQuota(quotaType);

    if (!usageKey) {
      // For quotas without usage tracking (like file size)
      return {
        allowed: amount <= limit,
        current: 0,
        limit,
        remaining: limit,
        quotaType,
      };
    }

    // Get current usage from user-usage collection
    const usage = await this.getCurrentUsage(user.id);

    if (!usage) {
      // No usage record yet - will be created on first increment
      logger.debug("User has no usage record, using defaults", { userId: user.id });
      return {
        allowed: amount <= limit,
        current: 0,
        limit,
        remaining: limit,
        quotaType,
      };
    }

    const current = usage[usageKey] || 0;
    const wouldExceed = current + amount > limit;

    // Check if daily limit and needs reset
    let resetTime: Date | undefined;
    if (this.isDailyQuota(quotaType)) {
      resetTime = this.getNextResetTime();

      // Check if usage should be reset
      if (this.shouldResetDailyUsage(usage.lastResetDate)) {
        // Assume reset and return current=0
        // The actual reset will happen on next increment
        logger.debug("Daily quota needs reset, assuming current=0 for check", { userId: user.id, quotaType });
        return {
          allowed: amount <= limit,
          current: 0,
          limit,
          remaining: limit,
          resetTime,
          quotaType,
        };
      }
    }

    logger.debug("checkQuota: Returning final result", { wouldExceed, current, limit });
    return {
      allowed: !wouldExceed,
      current,
      limit,
      remaining: Math.max(0, limit - current),
      resetTime,
      quotaType,
    };
  }

  /**
   * Increment usage counter for a user in the user-usage collection.
   */
  async incrementUsage(userId: number, usageType: UsageType, amount: number = 1, _req?: PayloadRequest): Promise<void> {
    try {
      logger.debug("incrementUsage: Entry", { userId, usageType, amount });

      // Get or create usage record
      const usageRecord = await this.getOrCreateUsageRecord(userId);
      logger.debug("incrementUsage: Got usage record", { usageRecordId: usageRecord.id });

      // Convert to UserUsage type for manipulation
      const currentUsage: UserUsage = {
        currentActiveSchedules: usageRecord.currentActiveSchedules ?? 0,
        urlFetchesToday: usageRecord.urlFetchesToday ?? 0,
        fileUploadsToday: usageRecord.fileUploadsToday ?? 0,
        importJobsToday: usageRecord.importJobsToday ?? 0,
        totalEventsCreated: usageRecord.totalEventsCreated ?? 0,
        currentCatalogs: usageRecord.currentCatalogs ?? 0,
        lastResetDate: usageRecord.lastResetDate ?? new Date().toISOString(),
      };

      // Check if daily reset is needed
      if (this.isDailyUsageType(usageType) && this.shouldResetDailyUsage(currentUsage.lastResetDate)) {
        logger.debug("incrementUsage: Daily reset needed");
        // Reset daily counters
        currentUsage.urlFetchesToday = 0;
        currentUsage.fileUploadsToday = 0;
        currentUsage.importJobsToday = 0;
        currentUsage.lastResetDate = new Date().toISOString();
      }

      // Increment the counter
      const newValue = (currentUsage[usageType] || 0) + amount;

      logger.debug("incrementUsage: Updating user-usage collection");
      await this.payload.update({
        collection: USER_USAGE_COLLECTION,
        id: usageRecord.id,
        data: {
          [usageType]: newValue,
          // Also update lastResetDate if we reset
          ...(this.isDailyUsageType(usageType) && this.shouldResetDailyUsage(usageRecord.lastResetDate ?? "")
            ? {
                urlFetchesToday: usageType === "urlFetchesToday" ? newValue : 0,
                fileUploadsToday: usageType === "fileUploadsToday" ? newValue : 0,
                importJobsToday: usageType === "importJobsToday" ? newValue : 0,
                lastResetDate: new Date().toISOString(),
              }
            : {}),
        },
        overrideAccess: true,
      });

      logger.debug("Usage incremented", {
        userId,
        usageType,
        amount,
        newValue,
      });
    } catch (error) {
      logger.error("Failed to increment usage", {
        error,
        userId,
        usageType,
        amount,
      });
    }
  }

  /**
   * Decrement usage counter for a user (e.g., when a schedule is disabled).
   */
  async decrementUsage(userId: number, usageType: UsageType, amount: number = 1, _req?: PayloadRequest): Promise<void> {
    try {
      // Get or create usage record
      const usageRecord = await this.getOrCreateUsageRecord(userId);

      const currentValue = (usageRecord[usageType as keyof UserUsageRecord] as number) || 0;

      // Don't go below 0
      const newValue = Math.max(0, currentValue - amount);

      await this.payload.update({
        collection: USER_USAGE_COLLECTION,
        id: usageRecord.id,
        data: {
          [usageType]: newValue,
        },
        overrideAccess: true,
      });

      logger.debug("Usage decremented", {
        userId,
        usageType,
        amount,
        newValue,
      });
    } catch (error) {
      logger.error("Failed to decrement usage", {
        error,
        userId,
        usageType,
        amount,
      });
    }
  }

  /**
   * Reset daily counters for a user.
   */
  async resetDailyCounters(userId: number, _req?: PayloadRequest): Promise<void> {
    try {
      // Find the usage record
      const usageRecords = await this.payload.find({
        collection: USER_USAGE_COLLECTION,
        where: { user: { equals: userId } },
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
        data: {
          urlFetchesToday: 0,
          fileUploadsToday: 0,
          importJobsToday: 0,
          lastResetDate: new Date().toISOString(),
        },
        overrideAccess: true,
      });

      logger.info("Daily counters reset", { userId });
    } catch (error) {
      logger.error("Failed to reset daily counters", { error, userId });
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
        data: {
          urlFetchesToday: 0,
          fileUploadsToday: 0,
          importJobsToday: 0,
          lastResetDate: now,
        },
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
   * Get empty usage object.
   */
  private getEmptyUsage(): UserUsage {
    return {
      currentActiveSchedules: 0,
      urlFetchesToday: 0,
      fileUploadsToday: 0,
      importJobsToday: 0,
      totalEventsCreated: 0,
      currentCatalogs: 0,
      lastResetDate: new Date().toISOString(),
    };
  }

  /**
   * Map quota type to usage type for tracking.
   */
  private getUsageKeyForQuota(quotaType: QuotaType): UsageType | null {
    const mapping: Partial<Record<QuotaType, UsageType>> = {
      [QUOTA_TYPES.ACTIVE_SCHEDULES]: USAGE_TYPES.CURRENT_ACTIVE_SCHEDULES,
      [QUOTA_TYPES.URL_FETCHES_PER_DAY]: USAGE_TYPES.URL_FETCHES_TODAY,
      [QUOTA_TYPES.FILE_UPLOADS_PER_DAY]: USAGE_TYPES.FILE_UPLOADS_TODAY,
      [QUOTA_TYPES.IMPORT_JOBS_PER_DAY]: USAGE_TYPES.IMPORT_JOBS_TODAY,
      [QUOTA_TYPES.TOTAL_EVENTS]: USAGE_TYPES.TOTAL_EVENTS_CREATED,
      [QUOTA_TYPES.CATALOGS_PER_USER]: USAGE_TYPES.CURRENT_CATALOGS,
    };

    return mapping[quotaType] ?? null;
  }

  /**
   * Check if a quota type is daily-based.
   */
  private isDailyQuota(quotaType: QuotaType): boolean {
    return quotaType.includes("PerDay");
  }

  /**
   * Check if a usage type is daily-based.
   */
  private isDailyUsageType(usageType: UsageType): boolean {
    return usageType.includes("Today");
  }

  /**
   * Check if daily usage should be reset.
   */
  private shouldResetDailyUsage(lastResetDate: string): boolean {
    if (!lastResetDate) return true;

    const lastReset = new Date(lastResetDate);
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
   */
  async validateQuota(user: User | null | undefined, quotaType: QuotaType, amount: number = 1): Promise<void> {
    const result = await this.checkQuota(user, quotaType, amount);

    if (!result.allowed) {
      throw new QuotaExceededError(quotaType, result.current, result.limit, result.resetTime);
    }
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
  async getQuotaHeaders(user: User | null | undefined, quotaType?: QuotaType): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    if (!user) {
      return headers;
    }

    // Only add specific quota information if requested for a specific operation
    if (quotaType) {
      const result = await this.checkQuota(user, quotaType);

      // Return only minimal rate-limit information for the current operation
      // Do not expose exact limits for admin users (would reveal privileged status)
      headers["X-RateLimit-Remaining"] = String(result.remaining);

      // Indicate if quotas reset daily (but not exact time to prevent attack timing)
      const isDailyQuota =
        quotaType === QUOTA_TYPES.FILE_UPLOADS_PER_DAY ||
        quotaType === QUOTA_TYPES.URL_FETCHES_PER_DAY ||
        quotaType === QUOTA_TYPES.IMPORT_JOBS_PER_DAY;
      if (isDailyQuota) {
        headers["X-RateLimit-Reset-Period"] = "daily";
      }
    }

    return headers;
  }
}

// Singleton instance management
let quotaService: QuotaService | null = null;

/**
 * Get or create the quota service instance.
 */
export const getQuotaService = (payload: Payload): QuotaService => {
  // In test environment, always create a new instance for isolation
  if (process.env.NODE_ENV === "test") {
    return new QuotaService(payload);
  }

  quotaService ??= new QuotaService(payload);
  return quotaService;
};
