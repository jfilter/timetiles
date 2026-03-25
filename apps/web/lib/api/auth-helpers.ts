/**
 * Shared authentication helper functions for account API routes.
 *
 * @module
 * @category API
 */
import type { Payload } from "payload";

import { AppError, ForbiddenError } from "@/lib/api/errors";
import { isPrivileged } from "@/lib/collections/shared-fields";
import { logger } from "@/lib/logger";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { isFeatureEnabled } from "@/lib/services/feature-flag-service";
import { resolveSite } from "@/lib/services/resolution/site-resolver";
import type { User } from "@/payload-types";

/** Payload relation IDs can be a number, stringified number, null, or undefined. */
type OwnerId = number | string | null | undefined;

/**
 * Check if a user can manage a resource based on role or ownership.
 * Admins and editors can manage any resource; regular users only their own.
 */
export const canManageResource = (user: { id: number; role?: string | null }, ownerId: OwnerId): boolean => {
  if (isPrivileged(user)) return true;
  return ownerId != null && ownerId === user.id;
};

/**
 * Require that the user has admin role.
 * @throws {ForbiddenError} if user is not an admin
 */
export const requireAdmin = (user: { role?: string | null }): void => {
  if (user.role !== "admin") {
    throw new ForbiddenError("Admin access required");
  }
};

/**
 * Require that the user has editor or admin role.
 * @throws {ForbiddenError} if user is not privileged
 */
export const requirePrivileged = (user: { role?: string | null }): void => {
  if (!isPrivileged(user)) {
    throw new ForbiddenError("Editor or admin access required");
  }
};

/**
 * Require that the user owns the resource or is an admin.
 * @throws {ForbiddenError} if neither condition is met
 */
export const requireOwnerOrAdmin = (user: { id: number; role?: string | null }, ownerId: OwnerId): void => {
  if (user.role === "admin") return;
  if (ownerId != null && ownerId === user.id) return;
  throw new ForbiddenError("Access denied");
};

/**
 * Require that a feature flag is enabled.
 * @throws {ForbiddenError} if the feature is disabled
 */
export const requireFeatureEnabled = async (
  payload: Payload,
  flag: Parameters<typeof isFeatureEnabled>[1],
  message = "Feature is not enabled"
): Promise<void> => {
  const enabled = await isFeatureEnabled(payload, flag);
  if (!enabled) {
    throw new ForbiddenError(message);
  }
};

/**
 * Require that the scrapers feature flag is enabled.
 * @throws {ForbiddenError} if the feature is disabled
 */
export const requireScrapersEnabled = async (payload: Payload): Promise<void> =>
  requireFeatureEnabled(payload, "enableScrapers", "Scraper feature is not enabled");

/**
 * Require that the request originates from the default (main) site.
 * Non-default sites are display-only and cannot perform data ingestion.
 * @throws {ForbiddenError} if the request is from a non-default site
 */
export const requireDefaultSite = async (payload: Payload, req: { headers: Headers }): Promise<void> => {
  const host = req.headers.get("host");
  const site = await resolveSite(payload, host);
  if (site && !site.isDefault) {
    throw new ForbiddenError("This feature is only available on the main site");
  }
};

/**
 * Verify a user's password by attempting a login.
 * Throws an error with a descriptive message on failure.
 */
const verifyPassword = async (payload: Payload, user: User, password: string): Promise<void> => {
  try {
    await payload.login({ collection: "users", data: { email: user.email, password } });
  } catch {
    logger.warn({ userId: user.id }, "Failed password verification");
    throw new Error("Password is incorrect");
  }
};

/**
 * Verify a user's password and log a failed attempt to the audit log.
 * Throws AppError(401) on failure.
 *
 * @param errorMessage - Custom error message for the 401 response (default: "Password is incorrect")
 * @throws {AppError} with status 401 if the password is incorrect
 */
export const verifyPasswordWithAudit = async (
  payload: Payload,
  user: User,
  password: string,
  clientId: string,
  context: string,
  errorMessage: string = "Password is incorrect"
): Promise<void> => {
  try {
    await verifyPassword(payload, user, password);
  } catch {
    await auditLog(payload, {
      action: AUDIT_ACTIONS.PASSWORD_VERIFY_FAILED,
      userId: user.id,
      userEmail: user.email,
      ipAddress: clientId,
      details: { context },
    });
    throw new AppError(401, errorMessage);
  }
};
