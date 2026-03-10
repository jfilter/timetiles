/**
 * API endpoint for scheduling account deletion.
 *
 * This endpoint allows users to schedule their account for deletion.
 * A grace period is applied during which the user can cancel.
 * Requires password re-verification for security.
 *
 * @module
 * @category API
 */
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError, logger } from "@/lib/logger";
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { DELETION_GRACE_PERIOD_DAYS, getAccountDeletionService } from "@/lib/services/account-deletion-service";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier, getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import { badRequest, internalError, unauthorized } from "@/lib/utils/api-response";
import { verifyPassword } from "@/lib/utils/auth-helpers";
import config from "@/payload.config";

export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const payload = await getPayload({ config });
    const user = request.user!;

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
      return badRequest("Invalid request body");
    }

    if (!password) {
      return badRequest("Password is required");
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

    // Verify password
    try {
      await verifyPassword(payload, user, password);
    } catch {
      await auditLog(payload, {
        action: AUDIT_ACTIONS.PASSWORD_VERIFY_FAILED,
        userId: user.id,
        userEmail: user.email,
        ipAddress: clientId,
        details: { context: "account_deletion" },
      });
      return unauthorized("Invalid password");
    }

    // Check if user can be deleted
    const deletionService = getAccountDeletionService(payload);
    const canDelete = await deletionService.canDeleteUser(user.id);

    if (!canDelete.allowed) {
      return badRequest(canDelete.reason ?? "Account cannot be deleted");
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

    await auditLog(payload, {
      action: AUDIT_ACTIONS.DELETION_SCHEDULED,
      userId: user.id,
      userEmail: user.email,
      ipAddress: clientId,
      details: { deletionScheduledAt: result.deletionScheduledAt },
    });

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
    return internalError("Failed to schedule deletion");
  }
});
