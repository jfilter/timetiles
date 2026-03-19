/**
 * API endpoint for downloading a completed data export.
 *
 * Validates the export ID, verifies ownership, checks export status
 * and expiry, and streams the export ZIP file to the client.
 *
 * @module
 * @category API
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";
import { z } from "zod";

import { apiRoute, AppError, ForbiddenError, NotFoundError } from "@/lib/api";
import { logger } from "@/lib/logger";
import { apiSuccess } from "@/lib/utils/api-response";
import { extractRelationId } from "@/lib/utils/relation-id";

const DATA_EXPORTS_COLLECTION = "data-exports" as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stream the export file to the client after all validation passes. */
const streamExportFile = async (
  payload: Payload,
  exportId: string,
  normalizedExportId: number,
  exportRecord: { filePath?: string | null; expiresAt?: string | null },
  userId: number
): Promise<Response> => {
  // Check expiry
  if (exportRecord.expiresAt && new Date(exportRecord.expiresAt) < new Date()) {
    await payload.update({
      collection: DATA_EXPORTS_COLLECTION,
      id: normalizedExportId,
      data: { status: "expired" },
      overrideAccess: true,
    });
    throw new AppError(410, "Export has expired. Please request a new export.");
  }

  // Verify file exists
  const filePath = exportRecord.filePath;
  if (!filePath) {
    throw new NotFoundError("Export file not found");
  }

  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch {
    await payload.update({
      collection: DATA_EXPORTS_COLLECTION,
      id: normalizedExportId,
      data: { status: "failed", errorLog: "Export file missing from disk" },
      overrideAccess: true,
    });
    throw new NotFoundError("Export file not found on disk");
  }

  // Atomically increment download count to avoid race conditions
  // when multiple concurrent downloads hit this endpoint.
  await payload.db.drizzle.execute(sql`
    UPDATE data_exports
    SET download_count = COALESCE(download_count, 0) + 1,
        updated_at = NOW()
    WHERE id = ${normalizedExportId}
  `);

  logger.info({ userId, exportId }, "Data export downloaded");

  const timestamp = new Date().toISOString().split("T")[0];
  const fileName = `timetiles-data-export-${timestamp}.zip`;

  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(fileStats.size),
    },
  });
};

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const GET = apiRoute({
  auth: "required",
  params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }),
  handler: async ({ payload, user, params }) => {
    const normalizedExportId = params.id;
    const exportId = String(normalizedExportId);

    // Fetch export record
    const exportRecord = await payload.findByID({
      collection: DATA_EXPORTS_COLLECTION,
      id: normalizedExportId,
      overrideAccess: true,
    });

    if (!exportRecord) {
      throw new NotFoundError("Export not found");
    }

    // Verify ownership
    const ownerId = extractRelationId(exportRecord.user);

    if (user.id !== ownerId && user.role !== "admin") {
      throw new ForbiddenError("Access denied");
    }

    // Check status
    if (exportRecord.status === "pending" || exportRecord.status === "processing") {
      return apiSuccess({ status: exportRecord.status, message: "Export is still processing. Please wait." }, 202);
    }

    if (exportRecord.status === "failed") {
      throw new AppError(500, "Export failed", "EXPORT_FAILED", { reason: exportRecord.errorLog ?? "Unknown error" });
    }

    if (exportRecord.status === "expired") {
      throw new AppError(410, "Export has expired. Please request a new export.");
    }

    return streamExportFile(payload, exportId, normalizedExportId, exportRecord, user.id);
  },
});
