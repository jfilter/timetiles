/**
 * API endpoint for requesting a user data export.
 *
 * Checks rate limits, verifies no existing export is in progress,
 * creates an export record, and queues a background job to generate
 * the export file.
 *
 * @module
 * @category API
 */
import { apiRoute } from "@/lib/api";
import { logger } from "@/lib/logger";
import { getDataExportService } from "@/lib/services/data-export-service";

const DATA_EXPORTS_COLLECTION = "data-exports" as const;

export const POST = apiRoute({
  auth: "required",
  rateLimit: { configName: "DATA_EXPORT", keyPrefix: (u) => `data-export:${u!.id}` },
  handler: async ({ payload, user }) => {
    // Check for existing pending/processing export
    const existingExports = await payload.find({
      collection: DATA_EXPORTS_COLLECTION,
      where: { and: [{ user: { equals: user.id } }, { status: { in: ["pending", "processing"] } }] },
      limit: 1,
      overrideAccess: true,
    });

    if (existingExports.docs.length > 0) {
      const existing = existingExports.docs[0];
      return Response.json(
        {
          error: "Export already in progress",
          exportId: existing?.id,
          status: existing?.status,
          requestedAt: existing?.requestedAt,
        },
        { status: 409 }
      );
    }

    // Get export summary
    const exportService = getDataExportService(payload);
    const summary = await exportService.getExportSummary(user.id);

    // Create export record (re-check for duplicates to handle race condition)
    let exportRecord;
    try {
      exportRecord = await payload.create({
        collection: DATA_EXPORTS_COLLECTION,
        data: {
          user: user.id,
          status: "pending",
          requestedAt: new Date().toISOString(),
          summary: summary as unknown as Record<string, unknown>,
        },
        overrideAccess: true,
      });
    } catch (createError) {
      // Re-check for existing exports in case of race condition
      const raceCheck = await payload.find({
        collection: DATA_EXPORTS_COLLECTION,
        where: { and: [{ user: { equals: user.id } }, { status: { in: ["pending", "processing"] } }] },
        limit: 1,
        overrideAccess: true,
      });
      if (raceCheck.docs.length > 0) {
        return Response.json({ error: "Export already in progress", exportId: raceCheck.docs[0]?.id }, { status: 409 });
      }
      throw createError;
    }

    // Queue background job -- if queueing fails, mark the record as failed
    try {
      await payload.jobs.queue({ task: "data-export", input: { exportId: exportRecord.id } });
    } catch (queueError) {
      await payload.update({
        collection: DATA_EXPORTS_COLLECTION,
        id: exportRecord.id,
        data: { status: "failed", errorLog: "Failed to queue export job" },
        overrideAccess: true,
      });
      throw queueError;
    }

    logger.info({ userId: user.id, exportId: exportRecord.id }, "Data export requested");

    return Response.json(
      {
        success: true,
        message: "Export started. You will receive an email when ready.",
        exportId: exportRecord.id,
        summary,
      },
      { status: 202 }
    );
  },
});
