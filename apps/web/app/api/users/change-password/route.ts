/**
 * API endpoint for changing a user's password.
 *
 * Validates the new password length, verifies the current password,
 * updates the password, and logs the change to the audit log.
 *
 * @module
 * @category API
 */
import { apiRoute } from "@/lib/api";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants/validation";
import { logger } from "@/lib/logger";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier, getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import { verifyPasswordWithAudit } from "@/lib/utils/auth-helpers";

export const POST = apiRoute({
  auth: "required",
  handler: async ({ payload, user, req }) => {
    // Rate limiting
    const clientId = getClientIdentifier(req);
    const rateLimitService = getRateLimitService(payload);

    const passwordChangeCheck = rateLimitService.checkConfiguredRateLimit(
      `password-change:${user.id}`,
      RATE_LIMITS.PASSWORD_CHANGE
    );

    if (!passwordChangeCheck.allowed) {
      return Response.json({ error: "Too many password change attempts. Please try again later." }, { status: 429 });
    }

    // Parse request body
    let currentPassword: string;
    let newPassword: string;
    try {
      const body = await req.json();
      currentPassword = body.currentPassword;
      newPassword = body.newPassword;
    } catch {
      return Response.json({ error: "Invalid request body", code: "BAD_REQUEST" }, { status: 400 });
    }

    if (!currentPassword || !newPassword) {
      return Response.json(
        { error: "Current password and new password are required", code: "BAD_REQUEST" },
        { status: 400 }
      );
    }

    // Validate new password
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return Response.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, code: "BAD_REQUEST" },
        { status: 400 }
      );
    }

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
    await payload.update({
      collection: "users",
      id: user.id,
      data: {
        password: newPassword,
      },
    });

    await auditLog(payload, {
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      userId: user.id,
      userEmail: user.email,
      ipAddress: clientId,
    });

    logger.info({ userId: user.id, clientId }, "Password changed successfully");

    return Response.json({
      success: true,
      message: "Password changed successfully",
    });
  },
});
