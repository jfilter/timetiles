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

import { createAccountDeletionService, DELETION_GRACE_PERIOD_DAYS } from "@/lib/account/deletion-service";
import { apiRoute, AppError, ValidationError } from "@/lib/api";
import { verifyPasswordWithAudit } from "@/lib/api/auth-helpers";
import { RATE_LIMITS } from "@/lib/constants/rate-limits";
import { logger } from "@/lib/logger";
import { TIMING_PAD_MS, withTimingPad } from "@/lib/security/timing-pad";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier, getRateLimitService } from "@/lib/services/rate-limit-service";

export const POST = apiRoute({
  auth: "required",
  body: z.object({ password: z.string().min(1) }),
  handler: async ({ payload, user, req, body }) => {
    // Rate limiting
    const clientId = getClientIdentifier(req);
    const rateLimitService = getRateLimitService(payload);

    // Check deletion rate limit
    const deletionCheck = await rateLimitService.checkConfiguredRateLimit(
      `account-delete:${user.id}`,
      RATE_LIMITS.ACCOUNT_DELETION
    );

    if (!deletionCheck.allowed) {
      throw new AppError(429, "Too many deletion attempts. Please try again later.");
    }

    const { password } = body;

    // Check password attempt rate limit
    const passwordCheck = await rateLimitService.checkConfiguredRateLimit(
      `delete-password:${user.id}`,
      RATE_LIMITS.DELETION_PASSWORD_ATTEMPTS
    );

    if (!passwordCheck.allowed) {
      throw new AppError(429, "Too many failed password attempts. Please try again later.");
    }

    // Constant-time response to prevent timing side-channel attacks
    // from distinguishing password verification or eligibility check timing.
    return withTimingPad(TIMING_PAD_MS.ACCOUNT_DELETION, async () => {
      // Verify password
      await verifyPasswordWithAudit(payload, user, password, clientId, "account_deletion", "Invalid password");

      // Check if user can be deleted
      const deletionService = createAccountDeletionService(payload);
      const canDelete = await deletionService.canDeleteUser(user.id);

      if (!canDelete.allowed) {
        throw new ValidationError(canDelete.reason ?? "Account cannot be deleted");
      }

      // Check if already pending deletion
      if (user.deletionStatus === "pending_deletion") {
        throw new ValidationError("Deletion already scheduled");
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
    });
  },
});
