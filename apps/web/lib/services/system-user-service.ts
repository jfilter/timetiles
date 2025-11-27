/**
 * Service for managing the system user account.
 *
 * The system user is a reserved account used to own orphaned public data
 * when users delete their accounts. Public catalogs and datasets are
 * transferred to this system user rather than being deleted, ensuring
 * that publicly shared data remains accessible.
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import type { User } from "@/payload-types";

import { createLogger } from "../logger";

const logger = createLogger("system-user-service");

/**
 * Reserved system user email address.
 * This email is used to identify the system user account.
 */
export const SYSTEM_USER_EMAIL = "system@timetiles.internal";

/**
 * Generate a cryptographically secure random string for the system user password.
 * This password will never be used but is required by Payload auth.
 */
const generateSecurePassword = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return `system-${Date.now()}-${Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("")}`;
};

/**
 * System user configuration for creating the account.
 */
const SYSTEM_USER_CONFIG = {
  email: SYSTEM_USER_EMAIL,
  firstName: "Deleted",
  lastName: "User",
  role: "user" as const,
  isActive: false, // Cannot login
  trustLevel: "0" as const, // UNTRUSTED - no quotas
  registrationSource: "admin" as const,
  // Password is required by Payload auth but will never be used
  password: generateSecurePassword(),
};

/**
 * Service for managing the system user account.
 */
export class SystemUserService {
  private readonly payload: Payload;
  private cachedSystemUserId: number | null = null;

  constructor(payload: Payload) {
    this.payload = payload;
  }

  /**
   * Get or create the system user account.
   *
   * This method is idempotent - if the system user already exists,
   * it returns the existing user. If not, it creates one.
   *
   * @returns The system user record
   */
  async getOrCreateSystemUser(): Promise<User> {
    // Check cache first
    if (this.cachedSystemUserId !== null) {
      const user = await this.payload.findByID({
        collection: "users",
        id: this.cachedSystemUserId,
        overrideAccess: true,
      });
      if (user) {
        return user;
      }
      // Cache was stale, clear it
      this.cachedSystemUserId = null;
    }

    // Try to find existing system user
    const existing = await this.payload.find({
      collection: "users",
      where: {
        email: { equals: SYSTEM_USER_EMAIL },
      },
      limit: 1,
      overrideAccess: true,
    });

    if (existing.docs.length > 0 && existing.docs[0]) {
      const user = existing.docs[0];
      this.cachedSystemUserId = user.id;
      logger.debug({ userId: user.id }, "Found existing system user");
      return user;
    }

    // Create system user
    logger.info("Creating system user");
    const user = await this.payload.create({
      collection: "users",
      data: SYSTEM_USER_CONFIG,
      overrideAccess: true,
    });

    this.cachedSystemUserId = user.id;
    logger.info({ userId: user.id }, "System user created");
    return user;
  }

  /**
   * Check if a user ID belongs to the system user.
   *
   * @param userId - The user ID to check
   * @returns True if the ID belongs to the system user
   */
  async isSystemUser(userId: number | string): Promise<boolean> {
    const numericId = typeof userId === "string" ? parseInt(userId, 10) : userId;

    // Fast path: check cache
    if (this.cachedSystemUserId !== null) {
      return this.cachedSystemUserId === numericId;
    }

    // Slow path: look up the user
    const user = await this.payload.findByID({
      collection: "users",
      id: numericId,
      overrideAccess: true,
    });

    if (!user) {
      return false;
    }

    const isSystem = user.email === SYSTEM_USER_EMAIL;

    // Cache if this is the system user
    if (isSystem) {
      this.cachedSystemUserId = numericId;
    }

    return isSystem;
  }

  /**
   * Get the cached system user ID.
   *
   * This method returns the cached ID without making a database call.
   * Returns null if the system user hasn't been looked up yet.
   *
   * @returns The system user ID or null if not cached
   */
  getSystemUserId(): number | null {
    return this.cachedSystemUserId;
  }

  /**
   * Clear the cached system user ID.
   *
   * Useful for testing or when the system user may have changed.
   */
  clearCache(): void {
    this.cachedSystemUserId = null;
  }
}

// Singleton instance
let systemUserService: SystemUserService | null = null;

/**
 * Get the system user service singleton.
 *
 * @param payload - The Payload instance
 * @returns The system user service
 */
export const getSystemUserService = (payload: Payload): SystemUserService => {
  systemUserService ??= new SystemUserService(payload);
  return systemUserService;
};

/**
 * Reset the system user service singleton (for testing).
 */
export const resetSystemUserService = (): void => {
  if (systemUserService) {
    systemUserService.clearCache();
    systemUserService = null;
  }
};
