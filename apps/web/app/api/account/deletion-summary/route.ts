/**
 * API endpoint for getting account deletion summary.
 *
 * Returns a preview of what data will be affected when the user deletes their account,
 * including counts of public vs private catalogs, datasets, and events.
 *
 * @module
 * @category API
 */
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logError, logger } from "@/lib/logger";
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { getAccountDeletionService } from "@/lib/services/account-deletion-service";
import { internalError } from "@/lib/utils/api-response";
import config from "@/payload.config";

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const payload = await getPayload({ config });
    const user = request.user!;

    logger.debug({ userId: user.id }, "Fetching deletion summary");

    const deletionService = getAccountDeletionService(payload);
    const summary = await deletionService.getDeletionSummary(user.id);

    // Also check if user can be deleted
    const canDelete = await deletionService.canDeleteUser(user.id);

    return NextResponse.json({
      summary,
      canDelete: canDelete.allowed,
      reason: canDelete.reason,
      // Include current deletion status if pending
      deletionStatus: user.deletionStatus,
      deletionScheduledAt: user.deletionScheduledAt,
    });
  } catch (error) {
    logError(error, "Failed to get deletion summary");
    return internalError("Failed to get deletion summary");
  }
});
