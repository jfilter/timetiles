/**
 * Shared authentication helper functions for account API routes.
 *
 * @module
 * @category Utils
 */
import type { Payload } from "payload";

import { logger } from "@/lib/logger";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import type { User } from "@/payload-types";

import { unauthorized } from "./api-response";

/**
 * Verify a user's password by attempting a login.
 * Throws an error with a descriptive message on failure.
 */
export const verifyPassword = async (payload: Payload, user: User, password: string): Promise<void> => {
  try {
    await payload.login({ collection: "users", data: { email: user.email, password } });
  } catch {
    logger.warn({ userId: user.id }, "Failed password verification");
    throw new Error("Password is incorrect");
  }
};

/**
 * Verify a user's password and log a failed attempt to the audit log.
 * Returns null on success, or an unauthorized response on failure.
 *
 * @param errorMessage - Custom error message for the 401 response (default: "Password is incorrect")
 */
export const verifyPasswordWithAudit = async (
  payload: Payload,
  user: User,
  password: string,
  clientId: string,
  context: string,
  errorMessage: string = "Password is incorrect"
): Promise<Response | null> => {
  try {
    await verifyPassword(payload, user, password);
    return null;
  } catch {
    await auditLog(payload, {
      action: AUDIT_ACTIONS.PASSWORD_VERIFY_FAILED,
      userId: user.id,
      userEmail: user.email,
      ipAddress: clientId,
      details: { context },
    });
    return unauthorized(errorMessage);
  }
};
