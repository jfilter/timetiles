/**
 * API endpoint for changing user email.
 *
 * Requires password verification before allowing the email to be changed.
 * Checks that the new email is not already in use.
 *
 * @module
 * @category API
 */
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError, logger } from "@/lib/logger";
import { getClientIdentifier, getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import config from "@/payload.config";

const EMAIL_REGEX = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/;

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

    // Check email change rate limit
    const emailChangeCheck = rateLimitService.checkConfiguredRateLimit(
      `email-change:${user.id}`,
      RATE_LIMITS.EMAIL_CHANGE
    );

    if (!emailChangeCheck.allowed) {
      return NextResponse.json({ error: "Too many email change attempts. Please try again later." }, { status: 429 });
    }

    // Parse request body
    let newEmail: string;
    let password: string;
    try {
      const body = await request.json();
      newEmail = body.newEmail?.trim().toLowerCase();
      password = body.password;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!newEmail || !password) {
      return NextResponse.json({ error: "New email and password are required" }, { status: 400 });
    }

    // Validate email format
    if (!EMAIL_REGEX.test(newEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    // Check if email is same as current
    if (newEmail === user.email.toLowerCase()) {
      return NextResponse.json({ error: "New email must be different from current email" }, { status: 400 });
    }

    // Verify password via login attempt
    try {
      await payload.login({
        collection: "users",
        data: {
          email: user.email,
          password,
        },
      });
    } catch {
      logger.warn({ userId: user.id, clientId }, "Failed password verification for email change");
      return NextResponse.json({ error: "Password is incorrect" }, { status: 401 });
    }

    // Check if new email is already in use
    const existingUser = await payload.find({
      collection: "users",
      where: {
        email: { equals: newEmail },
      },
      limit: 1,
    });

    if (existingUser.docs.length > 0) {
      return NextResponse.json({ error: "Email is already in use" }, { status: 400 });
    }

    // Update the email
    await payload.update({
      collection: "users",
      id: user.id,
      data: {
        email: newEmail,
      },
    });

    logger.info({ userId: user.id, oldEmail: user.email, newEmail, clientId }, "Email changed successfully");

    return NextResponse.json({
      success: true,
      message: "Email changed successfully",
      newEmail,
    });
  } catch (error) {
    logError(error, "Failed to change email");
    return NextResponse.json({ error: "Failed to change email" }, { status: 500 });
  }
};
