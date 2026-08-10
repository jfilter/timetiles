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

import { apiRoute, AppError, NotFoundError, requireOwnerOrAdmin } from "@/lib/api";
import { unlinkExportFile } from "@/lib/export/unlink-export-file";
import { logger } from "@/lib/logger";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { DataExport as DataExportRecord } from "@/payload-types";

const DATA_EXPORTS_COLLECTION = "data-exports" as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stream the export file to the client after all validation passes. */
const streamExportFile = async (
  payload: Payload,
  exportId: string,
  normalizedExportId: number,
  exportRecord: Pick<DataExportRecord, "filePath" | "expiresAt">,
  userId: number
): Promise<Response> => {
  // Check expiry. Retire the record, then unlink — and drop `filePath` only once the file is
  // actually gone. Clearing it first meant a failed unlink stranded a ZIP of personal data on
  // disk with nothing pointing at it; the cleanup job now re-sweeps expired records that still
  // carry a path, so leaving it set is what lets that retry find the file.
  if (exportRecord.expiresAt && new Date(exportRecord.expiresAt) < new Date()) {
    await payload.update({
      collection: DATA_EXPORTS_COLLECTION,
      id: normalizedExportId,
      data: { status: "expired" },
      overrideAccess: true,
    });
    // "failed" keeps `filePath` on the record so the cleanup job can retry the unlink.
    const fileGone =
      !exportRecord.filePath || (await unlinkExportFile(exportId, exportRecord.filePath, "download")) !== "failed";
    if (fileGone) {
      await payload.update({
        collection: DATA_EXPORTS_COLLECTION,
        id: normalizedExportId,
        data: { filePath: null },
        overrideAccess: true,
      });
    }
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
    // The file is gone; drop the dangling pointer so nothing tries to serve or
    // unlink it again.
    await payload.update({
      collection: DATA_EXPORTS_COLLECTION,
      id: normalizedExportId,
      data: { status: "failed", filePath: null, errorLog: "Export file missing from disk" },
      overrideAccess: true,
    });
    throw new NotFoundError("Export file not found on disk");
  }

  // Atomically increment download count to avoid race conditions
  // when multiple concurrent downloads hit this endpoint.
  // Payload tables live in the "payload" schema and search_path does not
  // include it — an unqualified name throws "relation does not exist".
  await payload.db.drizzle.execute(sql`
    UPDATE payload.data_exports
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
      disableErrors: true,
    });

    if (!exportRecord) {
      throw new NotFoundError("Export not found");
    }

    // Verify ownership
    const ownerId = extractRelationId(exportRecord.user);

    requireOwnerOrAdmin(user, ownerId);

    // Check status
    if (exportRecord.status === "pending" || exportRecord.status === "processing") {
      return Response.json(
        { status: exportRecord.status, message: "Export is still processing. Please wait." },
        { status: 202 }
      );
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
