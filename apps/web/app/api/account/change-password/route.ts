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
import { getClientIdentifier, getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import config from "@/payload.config";

const MIN_PASSWORD_LENGTH = 8;

export const POST = async (request: Request): Promise<Response> => {
  try {
    const payload = await getPayload({ config });

    // Authenticate user from session
    const { user } = await payload.auth({
      headers: request.headers,
    });

    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

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
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current password and new password are required" }, { status: 400 });
    }

    // Validate new password
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
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
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
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
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
};
