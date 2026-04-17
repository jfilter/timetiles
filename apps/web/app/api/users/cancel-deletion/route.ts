/**
 * API endpoint for cancelling a scheduled account deletion.
 *
 * Requires the caller's current password (to match the protection on
 * `schedule-deletion`, `change-password`, and `change-email`). Checks that
 * the user has a pending deletion, cancels it, and writes an audit log entry.
 *
 * @module
 * @category API
 */
import { z } from "zod";

import { createAccountDeletionService } from "@/lib/account/deletion-service";
import { apiRoute, ValidationError } from "@/lib/api";
import { verifyPasswordWithAudit } from "@/lib/api/auth-helpers";
import { logger } from "@/lib/logger";
import { TIMING_PAD_MS, withTimingPad } from "@/lib/security/timing-pad";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { getClientIdentifier } from "@/lib/services/rate-limit-service";

export const POST = apiRoute({
  auth: "required",
  body: z.object({ password: z.string().min(1) }),
  handler: async ({ payload, user, req, body }) => {
    // Check if deletion is pending before we spend time verifying the password.
    if (user.deletionStatus !== "pending_deletion") {
      throw new ValidationError("No pending deletion to cancel");
    }

    const clientId = getClientIdentifier(req);
    const { password } = body;

    // Constant-time response to prevent timing side-channels on password
    // verification. Reuses the same pad as the sibling account endpoints.
    return withTimingPad(TIMING_PAD_MS.ACCOUNT_DELETION, async () => {
      // Verify current password — writes a PASSWORD_VERIFY_FAILED audit entry
      // on failure and throws 401.
      await verifyPasswordWithAudit(payload, user, password, clientId, "cancel_deletion", "Password is incorrect");

      // Cancel deletion
      const deletionService = createAccountDeletionService(payload);
      await deletionService.cancelDeletion(user.id);

      await auditLog(payload, {
        action: AUDIT_ACTIONS.DELETION_CANCELLED,
        userId: user.id,
        userEmail: user.email,
        ipAddress: clientId,
      });

      logger.info({ userId: user.id, clientId }, "Account deletion cancelled");

      return { message: "Account deletion has been cancelled. Your account is now active." };
    });
  },
});
