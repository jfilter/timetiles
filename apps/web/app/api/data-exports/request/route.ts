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
import { sql } from "@payloadcms/db-postgres";
import { commitTransaction, initTransaction, killTransaction, type Payload, type PayloadRequest } from "payload";

import { apiRoute, ConflictError } from "@/lib/api";
import { queueJobWithRollback } from "@/lib/api/job-helpers";
import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
import type { RequestExportResponse } from "@/lib/export/api-types";
import { createDataExportService } from "@/lib/export/service";
import { logger } from "@/lib/logger";
import type { DataExport as DataExportRecord } from "@/payload-types";

export type { RequestExportError, RequestExportResponse } from "@/lib/export/api-types";

const DATA_EXPORTS_COLLECTION = "data-exports" as const;

/** Find an active (pending or processing) export for the given user. */
const findActiveExport = (payload: Payload, userId: number, req?: PayloadRequest) =>
  payload.find({
    collection: DATA_EXPORTS_COLLECTION,
    where: { and: [{ user: { equals: userId } }, { status: { in: ["pending", "processing"] } }] },
    limit: 1,
    overrideAccess: true,
    req,
  });

/**
 * Per-user transaction-scoped advisory lock, held across the check-then-create
 * so two concurrent requests can't both see zero active exports and both insert.
 */
const acquireUserExportLock = async (payload: Payload, userId: number, req: PayloadRequest): Promise<void> => {
  const drizzle = await getTransactionAwareDrizzle(payload, req);
  await drizzle.execute(sql`
    SELECT pg_advisory_xact_lock(hashtext('timetiles.data_export_request')::int, ${userId}::int)
  `);
};

export const POST = apiRoute({
  auth: "required",
  rateLimit: { configName: "DATA_EXPORT", keyPrefix: (u) => `data-export:${u!.id}` },
  handler: async ({ payload, user }) => {
    const req = { payload, transactionID: undefined, context: {} } as Pick<
      PayloadRequest,
      "payload" | "transactionID" | "context"
    > as PayloadRequest;
    const ownsTransaction = await initTransaction(req);

    let exportRecord;
    let summary;
    try {
      // Serialize concurrent requests for the same user before the check.
      await acquireUserExportLock(payload, user.id, req);

      // Check for existing pending/processing export
      const existingExports = await findActiveExport(payload, user.id, req);

      if (existingExports.docs.length > 0) {
        throw new ConflictError("Export already in progress");
      }

      // Get export summary
      const exportService = createDataExportService(payload);
      summary = await exportService.getExportSummary(user.id);

      exportRecord = await payload.create({
        collection: DATA_EXPORTS_COLLECTION,
        data: {
          user: user.id,
          status: "pending",
          requestedAt: new Date().toISOString(),
          summary: summary as unknown as NonNullable<DataExportRecord["summary"]>,
        },
        overrideAccess: true,
        req,
      });

      if (ownsTransaction) await commitTransaction(req);
    } catch (error) {
      if (ownsTransaction) await killTransaction(req);
      throw error;
    }

    // Queue background job -- if queueing fails, mark the record as failed
    await queueJobWithRollback(
      payload,
      { task: "data-export", input: { exportId: exportRecord.id } },
      {
        collection: DATA_EXPORTS_COLLECTION,
        id: exportRecord.id,
        data: { status: "failed", errorLog: "Failed to queue export job" },
      }
    );

    logger.info({ userId: user.id, exportId: exportRecord.id }, "Data export requested");

    return Response.json(
      {
        message: "Export started. You will receive an email when ready.",
        exportId: exportRecord.id,
        summary,
      } satisfies RequestExportResponse,
      { status: 202 }
    );
  },
});
