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
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier } from "@/lib/services/rate-limit-service";

export const POST = apiRoute({
  auth: "required",
  rateLimit: { configName: "PASSWORD_CHANGE", keyPrefix: (u) => `password-change:${u!.id}` },
  body: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }),
  handler: async ({ payload, user, req, body }) => {
    const clientId = getClientIdentifier(req);
    const { currentPassword, newPassword } = body;

    // Verify current password
    const verifyError = await verifyPasswordWithAudit(
      payload,
      user,
      currentPassword,
      clientId,
      "password_change",
      "Current password is incorrect"
    );
    if (verifyError) return verifyError;

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
  },
});
