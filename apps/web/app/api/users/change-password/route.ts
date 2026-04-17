/**
 * API endpoint for changing a user's password.
 *
 * Validates the new password length, verifies the current password,
 * updates the password, and logs the change to the audit log.
 *
 * @module
 * @category API
 */
import { z } from "zod";

import { apiRoute } from "@/lib/api";
import { verifyPasswordWithAudit } from "@/lib/api/auth-helpers";
import { logger } from "@/lib/logger";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validatePassword } from "@/lib/security/password-policy";
import { TIMING_PAD_MS, withTimingPad } from "@/lib/security/timing-pad";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier } from "@/lib/services/rate-limit-service";
import { AppError } from "@/lib/types/errors";

export const POST = apiRoute({
  auth: "required",
  rateLimit: { configName: "PASSWORD_CHANGE", keyPrefix: (u) => `password-change:${u!.id}` },
  body: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  }),
  handler: async ({ payload, user, req, body }) => {
    const clientId = getClientIdentifier(req);
    const { currentPassword, newPassword } = body;

    // Policy checks beyond Zod length bounds (HIBP k-anonymity lookup, etc.)
    const policy = await validatePassword(newPassword);
    if (!policy.ok) {
      throw new AppError(400, policy.message, `password-${policy.code}`);
    }

    // Constant-time response to prevent timing side-channel attacks
    // from distinguishing password verification success/failure timing.
    return withTimingPad(TIMING_PAD_MS.PASSWORD_CHANGE, async () => {
      // Verify current password
      await verifyPasswordWithAudit(
        payload,
        user,
        currentPassword,
        clientId,
        "password_change",
        "Current password is incorrect"
      );

      // Update the password
      await payload.update({ collection: "users", id: user.id, data: { password: newPassword } });

      await auditLog(payload, {
        action: AUDIT_ACTIONS.PASSWORD_CHANGED,
        userId: user.id,
        userEmail: user.email,
        ipAddress: clientId,
      });

      logger.info({ userId: user.id, clientId }, "Password changed successfully");

      return { message: "Password changed successfully" };
    });
  },
});
