/**
 * API endpoint for getting account deletion summary.
 *
 * Returns a preview of what data will be affected when the user deletes their account,
 * including counts of public vs private catalogs, datasets, and events.
 *
 * @module
 * @category API
 */
import { apiRoute } from "@/lib/api";
import { logger } from "@/lib/logger";
import { getAccountDeletionService } from "@/lib/services/account-deletion-service";

export const GET = apiRoute({
  auth: "required",
  handler: async ({ user, payload }) => {
    logger.debug({ userId: user.id }, "Fetching deletion summary");

    const deletionService = getAccountDeletionService(payload);
    const summary = await deletionService.getDeletionSummary(user.id);

    // Also check if user can be deleted
    const canDelete = await deletionService.canDeleteUser(user.id);

    return Response.json({
      summary,
      canDelete: canDelete.allowed,
      reason: canDelete.reason,
      // Include current deletion status if pending
      deletionStatus: user.deletionStatus,
      deletionScheduledAt: user.deletionScheduledAt,
    });
  },
});
