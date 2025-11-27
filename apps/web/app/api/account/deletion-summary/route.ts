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
import { getAccountDeletionService } from "@/lib/services/account-deletion-service";
import config from "@/payload.config";

export const GET = async (request: Request): Promise<Response> => {
  try {
    const payload = await getPayload({ config });

    // Authenticate user from session
    const { user } = await payload.auth({
      headers: request.headers,
    });

    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

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
    return NextResponse.json({ error: "Failed to get deletion summary" }, { status: 500 });
  }
};
