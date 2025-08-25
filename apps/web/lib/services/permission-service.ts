/**
 * Service for managing user permissions and quotas.
 *
 * This service provides centralized control over user resource limits, usage tracking,
 * and permission checks. It integrates with Payload CMS to enforce quotas and track
 * usage across various operations like file uploads, scheduled imports, and event creation.
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import {
  DEFAULT_QUOTAS,
  QUOTA_ERROR_MESSAGES,
  QUOTA_TYPES,
  TRUST_LEVELS,
  USAGE_TYPES,
  type QuotaType,
  type TrustLevel,
  type UsageType,
  type UserQuotas,
  type UserUsage,
} from "@/lib/constants/permission-constants";
import { createLogger } from "@/lib/logger";
import type { User } from "@/payload-types";

const logger = createLogger("permission-service");

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
 * Service for managing user permissions and quotas.
 */
export class PermissionService {
  private readonly payload: Payload;

  constructor(payload: Payload) {
    this.payload = payload;
  }

  /**
   * Get effective quotas for a user, considering trust level and custom overrides.
   */
  async getEffectiveQuotas(user: User | null | undefined): Promise<UserQuotas> {
    if (!user) {
      // Return most restrictive quotas for unauthenticated users
      return DEFAULT_QUOTAS[TRUST_LEVELS.UNTRUSTED];
    }

    const trustLevelValue = Number(user.trustLevel ?? TRUST_LEVELS.REGULAR);
    const trustLevel = trustLevelValue as TrustLevel;
    const defaultQuotas = DEFAULT_QUOTAS[trustLevel];

    // Check if user has quota fields directly on the user object (from database)
    const userQuotas = user.quotas || {};
    
    // Build effective quotas from user fields, falling back to defaults
    const effectiveQuotas: UserQuotas = {
      maxActiveSchedules: userQuotas.maxActiveSchedules ?? defaultQuotas.maxActiveSchedules,
      maxUrlFetchesPerDay: userQuotas.maxUrlFetchesPerDay ?? defaultQuotas.maxUrlFetchesPerDay,
      maxFileUploadsPerDay: userQuotas.maxFileUploadsPerDay ?? defaultQuotas.maxFileUploadsPerDay,
      maxEventsPerImport: userQuotas.maxEventsPerImport ?? defaultQuotas.maxEventsPerImport,
      maxTotalEvents: userQuotas.maxTotalEvents ?? defaultQuotas.maxTotalEvents,
      maxImportJobsPerDay: userQuotas.maxImportJobsPerDay ?? defaultQuotas.maxImportJobsPerDay,
      maxFileSizeMB: userQuotas.maxFileSizeMB ?? defaultQuotas.maxFileSizeMB,
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
   * Get current usage for a user.
   */
  async getCurrentUsage(userId: number): Promise<UserUsage | null> {
    try {
      const user = await this.payload.findByID({
        collection: "users",
        id: userId,
      });

      if (!user || !user.usage) {
        return null;
      }

      return user.usage as UserUsage;
    } catch (error) {
      logger.error("Failed to get current usage", { error, userId });
      return null;
    }
  }

  /**
   * Check if a user can perform an action based on quota limits.
   */
  async checkQuota(
    user: User | null | undefined,
    quotaType: QuotaType,
    amount: number = 1
  ): Promise<QuotaCheckResult> {
    // Get effective quotas
    const quotas = await this.getEffectiveQuotas(user);
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

    // Get current usage for authenticated users
    const usage = await this.getCurrentUsage(user.id);
    if (!usage) {
      // Initialize usage if not exists
      await this.initializeUsage(user.id);
      return {
        allowed: amount <= limit,
        current: 0,
        limit,
        remaining: limit - amount,
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

    const current = (usage[usageKey] as number) || 0;
    const wouldExceed = current + amount > limit;

    // Check if daily limit and needs reset
    let resetTime: Date | undefined;
    if (this.isDailyQuota(quotaType)) {
      resetTime = this.getNextResetTime();
      
      // Check if usage should be reset
      if (this.shouldResetDailyUsage(usage.lastResetDate)) {
        await this.resetDailyCounters(user.id);
        return {
          allowed: amount <= limit,
          current: 0,
          limit,
          remaining: limit - amount,
          resetTime,
          quotaType,
        };
      }
    }

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
   * Increment usage counter for a user.
   */
  async incrementUsage(
    userId: number,
    usageType: UsageType,
    amount: number = 1
  ): Promise<void> {
    try {
      const user = await this.payload.findByID({
        collection: "users",
        id: userId,
      });

      if (!user) {
        logger.error("User not found for usage increment", { userId });
        return;
      }

      const currentUsage = (user.usage as UserUsage) || this.getEmptyUsage();
      
      // Check if daily reset is needed
      if (this.isDailyUsageType(usageType) && this.shouldResetDailyUsage(currentUsage.lastResetDate)) {
        await this.resetDailyCounters(userId);
        // Refetch to get updated usage
        const updatedUser = await this.payload.findByID({
          collection: "users",
          id: userId,
        });
        if (updatedUser?.usage) {
          Object.assign(currentUsage, updatedUser.usage);
        }
      }

      // Increment the counter
      const newUsage = {
        ...currentUsage,
        [usageType]: ((currentUsage[usageType] as number) || 0) + amount,
      };

      await this.payload.update({
        collection: "users",
        id: userId,
        data: {
          usage: newUsage,
        },
      });

      logger.debug("Usage incremented", {
        userId,
        usageType,
        amount,
        newValue: newUsage[usageType],
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
  async decrementUsage(
    userId: number,
    usageType: UsageType,
    amount: number = 1
  ): Promise<void> {
    try {
      const user = await this.payload.findByID({
        collection: "users",
        id: userId,
      });

      if (!user) {
        logger.error("User not found for usage decrement", { userId });
        return;
      }

      const currentUsage = (user.usage as UserUsage) || this.getEmptyUsage();
      const currentValue = (currentUsage[usageType] as number) || 0;
      
      // Don't go below 0
      const newValue = Math.max(0, currentValue - amount);

      const newUsage = {
        ...currentUsage,
        [usageType]: newValue,
      };

      await this.payload.update({
        collection: "users",
        id: userId,
        data: {
          usage: newUsage,
        },
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
  async resetDailyCounters(userId: number): Promise<void> {
    try {
      const user = await this.payload.findByID({
        collection: "users",
        id: userId,
      });

      if (!user) {
        return;
      }

      const currentUsage = (user.usage as UserUsage) || this.getEmptyUsage();

      // Reset daily counters
      const newUsage: UserUsage = {
        ...currentUsage,
        urlFetchesToday: 0,
        fileUploadsToday: 0,
        importJobsToday: 0,
        lastResetDate: new Date().toISOString(),
      };

      await this.payload.update({
        collection: "users",
        id: userId,
        data: {
          usage: newUsage,
        },
      });

      logger.info("Daily counters reset", { userId });
    } catch (error) {
      logger.error("Failed to reset daily counters", { error, userId });
    }
  }

  /**
   * Reset daily counters for all users (called by background job).
   */
  async resetAllDailyCounters(): Promise<void> {
    try {
      const users = await this.payload.find({
        collection: "users",
        limit: 1000,
        where: {
          usage: {
            exists: true,
          },
        },
      });

      logger.info(`Resetting daily counters for ${users.docs.length} users`);

      for (const user of users.docs) {
        await this.resetDailyCounters(user.id);
      }

      logger.info("Daily counter reset completed");
    } catch (error) {
      logger.error("Failed to reset all daily counters", { error });
    }
  }

  /**
   * Initialize usage tracking for a user.
   */
  private async initializeUsage(userId: number): Promise<void> {
    try {
      await this.payload.update({
        collection: "users",
        id: userId,
        data: {
          usage: this.getEmptyUsage(),
        },
      });
    } catch (error) {
      logger.error("Failed to initialize usage", { error, userId });
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
    };

    return mapping[quotaType] || null;
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
   */
  async validateQuota(
    user: User | null | undefined,
    quotaType: QuotaType,
    amount: number = 1
  ): Promise<void> {
    const result = await this.checkQuota(user, quotaType, amount);
    
    if (!result.allowed) {
      throw new QuotaExceededError(
        quotaType,
        result.current,
        result.limit,
        result.resetTime
      );
    }
  }

  /**
   * Get quota headers for HTTP responses.
   */
  async getQuotaHeaders(
    user: User | null | undefined,
    quotaType?: QuotaType
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    if (!user) {
      return headers;
    }

    const quotas = await this.getEffectiveQuotas(user);
    const usage = await this.getCurrentUsage(user.id);

    if (usage) {
      // Add general quota information
      headers["X-User-Trust-Level"] = String(user.trustLevel ?? TRUST_LEVELS.REGULAR);
      headers["X-Quota-FileUploads"] = `${usage.fileUploadsToday}/${quotas.maxFileUploadsPerDay}`;
      headers["X-Quota-ImportJobs"] = `${usage.importJobsToday}/${quotas.maxImportJobsPerDay}`;
      headers["X-Quota-ActiveSchedules"] = `${usage.currentActiveSchedules}/${quotas.maxActiveSchedules}`;
      
      // Add reset time for daily quotas
      if (this.shouldResetDailyUsage(usage.lastResetDate)) {
        headers["X-Quota-Reset"] = this.getNextResetTime().toISOString();
      }

      // Add specific quota information if requested
      if (quotaType) {
        const result = await this.checkQuota(user, quotaType);
        headers["X-Quota-Limit"] = String(result.limit);
        headers["X-Quota-Remaining"] = String(result.remaining);
        headers["X-Quota-Current"] = String(result.current);
      }
    }

    return headers;
  }
}

// Singleton instance management
let permissionService: PermissionService | null = null;

/**
 * Get or create the permission service instance.
 */
export const getPermissionService = (payload: Payload): PermissionService => {
  // In test environment, always create a new instance for isolation
  if (process.env.NODE_ENV === "test") {
    return new PermissionService(payload);
  }

  if (!permissionService) {
    permissionService = new PermissionService(payload);
  }
  return permissionService;
};