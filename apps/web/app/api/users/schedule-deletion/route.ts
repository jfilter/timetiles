/**
 * API endpoint for scheduling account deletion.
 *
 * Verifies the user's password, checks eligibility for deletion,
 * schedules the account for deletion after a grace period, and
 * logs the action to the audit log.
 *
 * @module
 * @category API
 */
import { z } from "zod";

import { apiRoute } from "@/lib/api";
import { logger } from "@/lib/logger";
import { DELETION_GRACE_PERIOD_DAYS, getAccountDeletionService } from "@/lib/services/account-deletion-service";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier, getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import { verifyPasswordWithAudit } from "@/lib/utils/auth-helpers";

export const POST = apiRoute({
  auth: "required",
  body: z.object({ password: z.string().min(1) }),
  handler: async ({ payload, user, req, body }) => {
    // Rate limiting
    const clientId = getClientIdentifier(req);
    const rateLimitService = getRateLimitService(payload);

    // Check deletion rate limit
    const deletionCheck = rateLimitService.checkConfiguredRateLimit(
      `account-delete:${user.id}`,
      RATE_LIMITS.ACCOUNT_DELETION
    );

    if (!deletionCheck.allowed) {
      return Response.json({ error: "Too many deletion attempts. Please try again later." }, { status: 429 });
    }

    const { password } = body;

    // Check password attempt rate limit
    const passwordCheck = rateLimitService.checkConfiguredRateLimit(
      `delete-password:${user.id}`,
      RATE_LIMITS.DELETION_PASSWORD_ATTEMPTS
    );

    if (!passwordCheck.allowed) {
      return Response.json({ error: "Too many failed password attempts. Please try again later." }, { status: 429 });
    }

    // Verify password
    const verifyError = await verifyPasswordWithAudit(
      payload,
      user,
      password,
      clientId,
      "account_deletion",
      "Invalid password"
    );
    if (verifyError) return verifyError;

    // Check if user can be deleted
    const deletionService = getAccountDeletionService(payload);
    const canDelete = await deletionService.canDeleteUser(user.id);

    if (!canDelete.allowed) {
      return Response.json(
        { error: canDelete.reason ?? "Account cannot be deleted", code: "BAD_REQUEST" },
        { status: 400 }
      );
    }

    // Check if already pending deletion
    if (user.deletionStatus === "pending_deletion") {
      return Response.json(
        { error: "Deletion already scheduled", deletionScheduledAt: user.deletionScheduledAt },
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
      { userId: user.id, deletionScheduledAt: result.deletionScheduledAt, clientId },
      "Account deletion scheduled"
    );

    return Response.json({
      success: true,
      message: `Your account will be deleted in ${DELETION_GRACE_PERIOD_DAYS} days. You can cancel anytime before then.`,
      deletionScheduledAt: result.deletionScheduledAt,
      summary: result.summary,
    });
  },
});
