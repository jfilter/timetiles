/**
 * Background job for creating user data export archives.
 *
 * This job fetches all user data, creates a ZIP archive with JSON files,
 * stores it on disk, and sends an email notification when ready.
 *
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { logError, logger } from "@/lib/logger";
import { sendExportFailedEmail, sendExportReadyEmail } from "@/lib/services/data-export-emails";
import { getDataExportService } from "@/lib/services/data-export-service";

/** Expiry time in milliseconds (7 days) */
const EXPORT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/** Collection slug for data exports */
const DATA_EXPORTS_COLLECTION = "data-exports";

/**
 * Handle export failure - update status and send notification.
 */
const handleExportFailure = async (payload: Payload, exportId: number, error: unknown): Promise<void> => {
  try {
    const exportRecord = await payload.findByID({
      collection: DATA_EXPORTS_COLLECTION,
      id: exportId,
      overrideAccess: true,
    });

    if (!exportRecord) return;

    const userId = typeof exportRecord.user === "object" ? exportRecord.user.id : exportRecord.user;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await payload.update({
      collection: DATA_EXPORTS_COLLECTION,
      id: exportId,
      data: {
        status: "failed",
        completedAt: new Date().toISOString(),
        errorLog: errorMessage,
      },
      overrideAccess: true,
    });

    // Send failure notification
    const user = await payload.findByID({
      collection: "users",
      id: userId,
      overrideAccess: true,
    });

    if (user) {
      await sendExportFailedEmail(payload, user.email, user.firstName, errorMessage);
    }
  } catch (updateError) {
    logError(updateError, "Failed to update export status after error", { exportId });
  }
};

/**
 * Job handler for creating user data exports.
 */
export const dataExportJob = {
  slug: "data-export",
  handler: async (context: JobHandlerContext<{ exportId: number }>) => {
    const { job, req } = context;
    const payload = req?.payload;

    if (!payload) {
      throw new Error("Payload not available in job context");
    }

    const input = (context.input ?? job?.input) as { exportId: number } | undefined;
    const exportId = input?.exportId;
    if (!exportId) {
      throw new Error("Export ID not provided in job input");
    }

    try {
      logger.info({ jobId: job?.id, exportId }, "Starting data export job");

      // Update status to processing
      await payload.update({
        collection: DATA_EXPORTS_COLLECTION,
        id: exportId,
        data: { status: "processing" },
        overrideAccess: true,
      });

      // Fetch export record to get user
      const exportRecord = await payload.findByID({
        collection: DATA_EXPORTS_COLLECTION,
        id: exportId,
        overrideAccess: true,
      });

      if (!exportRecord) {
        throw new Error(`Export record not found: ${exportId}`);
      }

      const userId = typeof exportRecord.user === "object" ? exportRecord.user.id : exportRecord.user;

      // Fetch user for email
      const user = await payload.findByID({
        collection: "users",
        id: userId,
        overrideAccess: true,
      });

      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      // Execute export
      const exportService = getDataExportService(payload);
      const result = await exportService.executeExport(exportId);

      // Calculate expiry (7 days from now)
      const expiresAt = new Date(Date.now() + EXPORT_EXPIRY_MS);

      // Update record with results
      await payload.update({
        collection: DATA_EXPORTS_COLLECTION,
        id: exportId,
        data: {
          status: "ready",
          completedAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString(),
          filePath: result.filePath,
          fileSize: result.fileSize,
          summary: result.recordCounts as unknown as Record<string, unknown>,
        },
        overrideAccess: true,
      });

      // Generate download URL
      const downloadUrl = `${process.env.NEXT_PUBLIC_PAYLOAD_URL}/api/account/download-data/${exportId}`;

      // Calculate file size in MB for email
      const fileSizeMB = result.fileSize / (1024 * 1024);

      // Send notification email
      await sendExportReadyEmail(payload, user.email, user.firstName, downloadUrl, expiresAt.toISOString(), fileSizeMB);

      logger.info({ jobId: job?.id, exportId, fileSize: result.fileSize }, "Data export completed successfully");

      return {
        output: {
          success: true,
          exportId,
          fileSize: result.fileSize,
          recordCounts: result.recordCounts,
        },
      };
    } catch (error) {
      logError(error, "Data export job failed", { exportId });
      await handleExportFailure(payload, exportId, error);
      throw error;
    }
  },
};
