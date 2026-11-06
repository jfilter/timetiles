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

    const canDelete = await deletionService.canDeleteUser(user.id);

    return {
      summary,
      canDelete: canDelete.allowed,
      reason: canDelete.reason,
      // Locale-independent code so the client can translate the block reason;
      // `reason` alone would render untranslated English in the modal.
      reasonCode: canDelete.reasonCode,
      // The UI interpolates this into the grace-period copy.
      gracePeriodDays: getAppConfig().account.deletionGracePeriodDays,
      deletionStatus: user.deletionStatus,
      deletionScheduledAt: user.deletionScheduledAt,
    };
  },
});
