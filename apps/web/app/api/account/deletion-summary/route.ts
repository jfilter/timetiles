/**
 * API endpoint for getting account deletion summary.
 *
 * Returns a preview of what data will be affected when the user deletes their account,
 * including counts of public vs private catalogs, datasets, and events.
 *
 * @module
 * @category API
 */
import { createAccountDeletionService } from "@/lib/account/deletion-service";
import { apiRoute } from "@/lib/api";
import { getAppConfig } from "@/lib/config/app-config";
import { logger } from "@/lib/logger";

export const GET = apiRoute({
  auth: "required",
  handler: async ({ user, payload }) => {
    logger.debug({ userId: user.id }, "Fetching deletion summary");

    const deletionService = createAccountDeletionService(payload);
    const summary = await deletionService.getDeletionSummary(user.id);

    // Also check if user can be deleted
    const canDelete = await deletionService.canDeleteUser(user.id);

    return {
      summary,
      canDelete: canDelete.allowed,
      reason: canDelete.reason,
      // The UI interpolates this into the grace-period copy — hardcoded "7
      // days" strings previously contradicted the configured 30-day default.
      gracePeriodDays: getAppConfig().account.deletionGracePeriodDays,
      // Include current deletion status if pending
      deletionStatus: user.deletionStatus,
      deletionScheduledAt: user.deletionScheduledAt,
    };
  },
});
