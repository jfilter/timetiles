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
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { logger } from "@/lib/logger";
import { createAccountDeletionService, DELETION_GRACE_PERIOD_DAYS } from "@/lib/services/account-deletion-service";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier, getRateLimitService } from "@/lib/services/rate-limit-service";
import { badRequest, rateLimited } from "@/lib/utils/api-response";
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
      return rateLimited("Too many deletion attempts. Please try again later.");
    }

    const { password } = body;

    // Check password attempt rate limit
    const passwordCheck = rateLimitService.checkConfiguredRateLimit(
      `delete-password:${user.id}`,
      RATE_LIMITS.DELETION_PASSWORD_ATTEMPTS
    );

    if (!passwordCheck.allowed) {
      return rateLimited("Too many failed password attempts. Please try again later.");
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
    const deletionService = createAccountDeletionService(payload);
    const canDelete = await deletionService.canDeleteUser(user.id);

    if (!canDelete.allowed) {
      return badRequest(canDelete.reason ?? "Account cannot be deleted");
    }

    // Check if already pending deletion
    if (user.deletionStatus === "pending_deletion") {
      return badRequest("Deletion already scheduled");
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

    return {
      message: `Your account will be deleted in ${DELETION_GRACE_PERIOD_DAYS} days. You can cancel anytime before then.`,
      deletionScheduledAt: result.deletionScheduledAt,
      summary: result.summary,
    };
  },
});
