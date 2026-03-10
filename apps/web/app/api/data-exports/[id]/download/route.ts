/**
 * API endpoint for downloading a completed data export.
 *
 * Validates the export ID, verifies ownership, checks export status
 * and expiry, and streams the export ZIP file to the client.
 *
 * @module
 * @category API
 */
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import type { Payload } from "payload";
import { Readable } from "stream";
import { z } from "zod";

import { apiRoute } from "@/lib/api";
import { logger } from "@/lib/logger";
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
    return Response.json({ error: "Export has expired. Please request a new export." }, { status: 410 });
  }

  // Verify file exists
  const filePath = exportRecord.filePath;
  if (!filePath) {
    return Response.json({ error: "Export file not found" }, { status: 404 });
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
    return Response.json({ error: "Export file not found on disk" }, { status: 404 });
  }

  // Increment download count -- re-read to minimize race window
  const freshExport = await payload.findByID({
    collection: DATA_EXPORTS_COLLECTION,
    id: normalizedExportId,
    overrideAccess: true,
  });
  await payload.update({
    collection: DATA_EXPORTS_COLLECTION,
    id: normalizedExportId,
    data: { downloadCount: (freshExport.downloadCount ?? 0) + 1 },
    overrideAccess: true,
  });

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
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
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
      return Response.json({ error: "Export not found" }, { status: 404 });
    }

    // Verify ownership
    const ownerId = extractRelationId(exportRecord.user);

    if (user.id !== ownerId && user.role !== "admin") {
      return Response.json({ error: "Access denied" }, { status: 403 });
    }

    // Check status
    if (exportRecord.status === "pending" || exportRecord.status === "processing") {
      return Response.json(
        {
          status: exportRecord.status,
          message: "Export is still processing. Please wait.",
        },
        { status: 202 }
      );
    }

    if (exportRecord.status === "failed") {
      return Response.json(
        {
          error: "Export failed",
          reason: exportRecord.errorLog ?? "Unknown error",
        },
        { status: 500 }
      );
    }

    if (exportRecord.status === "expired") {
      return Response.json({ error: "Export has expired. Please request a new export." }, { status: 410 });
    }

    return streamExportFile(payload, exportId, normalizedExportId, exportRecord, user.id);
  },
});
