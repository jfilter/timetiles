/**
 * API endpoint for cancelling a scheduled account deletion.
 *
 * Checks that the user has a pending deletion, cancels it,
 * and logs the action to the audit log.
 *
 * @module
 * @category API
 */
import { createAccountDeletionService } from "@/lib/account/deletion-service";
import { apiRoute, ValidationError } from "@/lib/api";
import { logger } from "@/lib/logger";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";

export const POST = apiRoute({
  auth: "required",
  handler: async ({ payload, user }) => {
    // Check if deletion is pending
    if (user.deletionStatus !== "pending_deletion") {
      throw new ValidationError("No pending deletion to cancel");
    }

    // Cancel deletion
    const deletionService = createAccountDeletionService(payload);
    await deletionService.cancelDeletion(user.id);

    await auditLog(payload, { action: AUDIT_ACTIONS.DELETION_CANCELLED, userId: user.id, userEmail: user.email });

    logger.info({ userId: user.id }, "Account deletion cancelled");

    return { message: "Account deletion has been cancelled. Your account is now active." };
  },
});
