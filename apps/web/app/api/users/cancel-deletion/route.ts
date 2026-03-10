/**
 * API endpoint for cancelling a scheduled account deletion.
 *
 * Checks that the user has a pending deletion, cancels it,
 * and logs the action to the audit log.
 *
 * @module
 * @category API
 */
import { apiRoute } from "@/lib/api";
import { logger } from "@/lib/logger";
import { getAccountDeletionService } from "@/lib/services/account-deletion-service";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";

export const POST = apiRoute({
  auth: "required",
  handler: async ({ payload, user }) => {
    // Check if deletion is pending
    if (user.deletionStatus !== "pending_deletion") {
      return Response.json({ error: "No pending deletion to cancel" }, { status: 400 });
    }

    // Cancel deletion
    const deletionService = getAccountDeletionService(payload);
    await deletionService.cancelDeletion(user.id);

    await auditLog(payload, { action: AUDIT_ACTIONS.DELETION_CANCELLED, userId: user.id, userEmail: user.email });

    logger.info({ userId: user.id }, "Account deletion cancelled");

    return Response.json({
      success: true,
      message: "Account deletion has been cancelled. Your account is now active.",
    });
  },
});
