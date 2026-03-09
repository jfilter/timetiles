/**
 * API endpoint for downloading a specific data export.
 *
 * GET: Download the export ZIP file
 *
 * @module
 * @category API
 */
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { Readable } from "stream";

import { logError, logger } from "@/lib/logger";
import { parseStrictInteger } from "@/lib/utils/event-params";
import { extractRelationId } from "@/lib/utils/relation-id";
import config from "@/payload.config";

const DATA_EXPORTS_COLLECTION = "data-exports" as const;

/** Stream the export file to the client after all validation passes. */
const streamExportFile = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
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
    return NextResponse.json({ error: "Export has expired. Please request a new export." }, { status: 410 });
  }

  // Verify file exists
  const filePath = exportRecord.filePath;
  if (!filePath) {
    return NextResponse.json({ error: "Export file not found" }, { status: 404 });
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
    return NextResponse.json({ error: "Export file not found on disk" }, { status: 404 });
  }

  // Increment download count — re-read to minimize race window
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

/**
 * GET /api/account/download-data/[exportId]
 * Download a specific export.
 */
export const GET = async (
  request: Request,
  { params }: { params: Promise<{ exportId: string }> }
): Promise<Response> => {
  try {
    const { exportId } = await params;
    const normalizedExportId = parseStrictInteger(exportId);

    if (normalizedExportId == null) {
      return NextResponse.json({ error: "Invalid export ID" }, { status: 400 });
    }

    const payload = await getPayload({ config });

    // Authenticate user
    const { user } = await payload.auth({ headers: request.headers });

    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Fetch export record
    const exportRecord = await payload.findByID({
      collection: DATA_EXPORTS_COLLECTION,
      id: normalizedExportId,
      overrideAccess: true,
    });

    if (!exportRecord) {
      return NextResponse.json({ error: "Export not found" }, { status: 404 });
    }

    // Verify ownership
    const ownerId = extractRelationId(exportRecord.user);

    if (user.id !== ownerId && user.role !== "admin") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check status
    if (exportRecord.status === "pending" || exportRecord.status === "processing") {
      return NextResponse.json(
        {
          status: exportRecord.status,
          message: "Export is still processing. Please wait.",
        },
        { status: 202 }
      );
    }

    if (exportRecord.status === "failed") {
      return NextResponse.json(
        {
          error: "Export failed",
          reason: exportRecord.errorLog ?? "Unknown error",
        },
        { status: 500 }
      );
    }

    if (exportRecord.status === "expired") {
      return NextResponse.json({ error: "Export has expired. Please request a new export." }, { status: 410 });
    }

    return await streamExportFile(payload, exportId, normalizedExportId, exportRecord, user.id);
  } catch (error) {
    logError(error, "Failed to download export");
    return NextResponse.json({ error: "Failed to download export" }, { status: 500 });
  }
};
