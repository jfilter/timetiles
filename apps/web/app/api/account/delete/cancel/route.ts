/**
 * API endpoint for canceling scheduled account deletion.
 *
 * This endpoint allows users to cancel a previously scheduled account deletion
 * during the grace period. Once cancelled, the account returns to active status.
 *
 * @module
 * @category API
 */
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logger } from "@/lib/logger";
import { getAccountDeletionService } from "@/lib/services/account-deletion-service";
import { AUDIT_ACTIONS, auditLog } from "@/lib/services/audit-log-service";
import { createErrorHandler } from "@/lib/utils/api-response";
import config from "@/payload.config";

export const POST = async (request: Request): Promise<Response> => {
  const handleError = createErrorHandler("cancel account deletion", logger);
  try {
    const payload = await getPayload({ config });

    // Authenticate user from session
    const { user } = await payload.auth({ headers: request.headers });

    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Check if deletion is pending
    if (user.deletionStatus !== "pending_deletion") {
      return NextResponse.json({ error: "No pending deletion to cancel" }, { status: 400 });
    }

    // Cancel deletion
    const deletionService = getAccountDeletionService(payload);
    await deletionService.cancelDeletion(user.id);

    await auditLog(payload, { action: AUDIT_ACTIONS.DELETION_CANCELLED, userId: user.id, userEmail: user.email });

    logger.info({ userId: user.id }, "Account deletion cancelled");

    return NextResponse.json({
      success: true,
      message: "Account deletion has been cancelled. Your account is now active.",
    });
  } catch (error) {
    return handleError(error);
  }
};
