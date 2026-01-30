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

import { logError, logger } from "@/lib/logger";
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { getClientIdentifier, getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import { badRequest, internalError, unauthorized } from "@/lib/utils/api-response";
import config from "@/payload.config";

const MIN_PASSWORD_LENGTH = 8;

export const POST = withAuth(async (request: AuthenticatedRequest) => {
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

    // Verify current password via login attempt
    try {
      await payload.login({
        collection: "users",
        data: {
          email: user.email,
          password: currentPassword,
        },
      });
    } catch {
      logger.warn({ userId: user.id }, "Failed password verification for password change");
      return unauthorized("Current password is incorrect");
    }

    // Update the password
    await payload.update({
      collection: "users",
      id: user.id,
      data: {
        password: newPassword,
      },
    });

    logger.info({ userId: user.id, clientId }, "Password changed successfully");

    return NextResponse.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    logError(error, "Failed to change password");
    return internalError("Failed to change password");
  }
});
