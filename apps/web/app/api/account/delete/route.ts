/**
 * API endpoint for scheduling account deletion.
 *
 * This endpoint allows users to schedule their account for deletion.
 * A 7-day grace period is applied during which the user can cancel.
 * Requires password re-verification for security.
 *
 * @module
 * @category API
 */
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError, logger } from "@/lib/logger";
import { DELETION_GRACE_PERIOD_DAYS, getAccountDeletionService } from "@/lib/services/account-deletion-service";
import { getClientIdentifier, getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import config from "@/payload.config";

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

    // Check deletion rate limit
    const deletionCheck = rateLimitService.checkConfiguredRateLimit(
      `account-delete:${user.id}`,
      RATE_LIMITS.ACCOUNT_DELETION
    );

    if (!deletionCheck.allowed) {
      return NextResponse.json({ error: "Too many deletion attempts. Please try again later." }, { status: 429 });
    }

    // Parse request body
    let password: string;
    try {
      const body = await request.json();
      password = body.password;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    // Check password attempt rate limit
    const passwordCheck = rateLimitService.checkConfiguredRateLimit(
      `delete-password:${user.id}`,
      RATE_LIMITS.DELETION_PASSWORD_ATTEMPTS
    );

    if (!passwordCheck.allowed) {
      return NextResponse.json(
        { error: "Too many failed password attempts. Please try again later." },
        { status: 429 }
      );
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
      logger.warn({ userId: user.id }, "Failed deletion password verification");
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    // Check if user can be deleted
    const deletionService = getAccountDeletionService(payload);
    const canDelete = await deletionService.canDeleteUser(user.id);

    if (!canDelete.allowed) {
      return NextResponse.json({ error: canDelete.reason }, { status: 400 });
    }

    // Check if already pending deletion
    if (user.deletionStatus === "pending_deletion") {
      return NextResponse.json(
        {
          error: "Deletion already scheduled",
          deletionScheduledAt: user.deletionScheduledAt,
        },
        { status: 400 }
      );
    }

    // Schedule deletion
    const result = await deletionService.scheduleDeletion(user.id);

    logger.info(
      {
        userId: user.id,
        deletionScheduledAt: result.deletionScheduledAt,
        clientId,
      },
      "Account deletion scheduled"
    );

    return NextResponse.json({
      success: true,
      message: `Your account will be deleted in ${DELETION_GRACE_PERIOD_DAYS} days. You can cancel anytime before then.`,
      deletionScheduledAt: result.deletionScheduledAt,
      summary: result.summary,
    });
  } catch (error) {
    logError(error, "Failed to schedule account deletion");
    return NextResponse.json({ error: "Failed to schedule deletion" }, { status: 500 });
  }
};
