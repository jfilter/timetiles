/**
 * API endpoint for changing user password.
 *
 * Requires the current password for verification before allowing
 * the password to be changed. Rate limited to prevent brute force attacks.
 *
 * @module
 * @category API
 */
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { MIN_PASSWORD_LENGTH } from "@/lib/constants/validation";
import { logger } from "@/lib/logger";
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier, getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import { badRequest, createErrorHandler } from "@/lib/utils/api-response";
import { verifyPasswordWithAudit } from "@/lib/utils/auth-helpers";
import config from "@/payload.config";

export const POST = withAuth(async (request: AuthenticatedRequest) => {
  const handleError = createErrorHandler("change password", logger);
  try {
    const payload = await getPayload({ config });
    const user = request.user!;

    // Rate limiting
    const clientId = getClientIdentifier(request);
    const rateLimitService = getRateLimitService(payload);

    // Check password change rate limit
    const passwordChangeCheck = rateLimitService.checkConfiguredRateLimit(
      `password-change:${user.id}`,
      RATE_LIMITS.PASSWORD_CHANGE
    );

    if (!passwordChangeCheck.allowed) {
      return NextResponse.json(
        { error: "Too many password change attempts. Please try again later." },
        { status: 429 }
      );
    }

    // Parse request body
    let currentPassword: string;
    let newPassword: string;
    try {
      const body = await request.json();
      currentPassword = body.currentPassword;
      newPassword = body.newPassword;
    } catch {
      return badRequest("Invalid request body");
    }

    if (!currentPassword || !newPassword) {
      return badRequest("Current password and new password are required");
    }

    // Validate new password
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
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
    await payload.update({ collection: "users", id: user.id, data: { password: newPassword } });

    await auditLog(payload, {
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      userId: user.id,
      userEmail: user.email,
      ipAddress: clientId,
    });

    logger.info({ userId: user.id, clientId }, "Password changed successfully");

    return NextResponse.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    return handleError(error);
  }
});
