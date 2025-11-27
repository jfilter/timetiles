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
import config from "@/payload.config";

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
    const payload = await getPayload({ config });

    // Authenticate user
    const { user } = await payload.auth({ headers: request.headers });

    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Fetch export record
    const exportRecord = await payload.findByID({
      collection: "data-exports",
      id: exportId,
      overrideAccess: true,
    });

    if (!exportRecord) {
      return NextResponse.json({ error: "Export not found" }, { status: 404 });
    }

    // Verify ownership
    const ownerId = typeof exportRecord.user === "object" ? exportRecord.user.id : exportRecord.user;

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

    // Check expiry
    if (exportRecord.expiresAt && new Date(exportRecord.expiresAt) < new Date()) {
      // Mark as expired
      await payload.update({
        collection: "data-exports",
        id: Number(exportId),
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
      return NextResponse.json({ error: "Export file not found on disk" }, { status: 404 });
    }

    // Increment download count
    await payload.update({
      collection: "data-exports",
      id: Number(exportId),
      data: { downloadCount: (exportRecord.downloadCount ?? 0) + 1 },
      overrideAccess: true,
    });

    logger.info({ userId: user.id, exportId }, "Data export downloaded");

    // Generate filename for download
    const timestamp = new Date().toISOString().split("T")[0];
    const fileName = `timetiles-data-export-${timestamp}.zip`;

    // Stream file using Node.js createReadStream converted to web stream
    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new Response(webStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(fileStats.size),
      },
    });
  } catch (error) {
    logError(error, "Failed to download export");
    return NextResponse.json({ error: "Failed to download export" }, { status: 500 });
  }
};
