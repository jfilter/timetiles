/**
 * API endpoint for initiating and listing data exports.
 *
 * POST: Request a new data export
 * GET: List user's export history
 *
 * @module
 * @category API
 */
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { logger } from "@/lib/logger";
import { type AuthenticatedRequest, withAuth } from "@/lib/middleware/auth";
import { getDataExportService } from "@/lib/services/data-export-service";
import { getRateLimitService, RATE_LIMITS } from "@/lib/services/rate-limit-service";
import { createErrorHandler } from "@/lib/utils/api-response";
import config from "@/payload.config";

const DATA_EXPORTS_COLLECTION = "data-exports" as const;

/**
 * POST /api/account/download-data
 * Request a new data export.
 */
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  const handleError = createErrorHandler("initiate data export", logger);
  try {
    const payload = await getPayload({ config });
    const user = request.user!;

    // Rate limiting
    const rateLimitService = getRateLimitService(payload);

    const rateLimitCheck = rateLimitService.checkConfiguredRateLimit(`data-export:${user.id}`, RATE_LIMITS.DATA_EXPORT);

    if (!rateLimitCheck.allowed) {
      const resetTime = rateLimitCheck.resetTime ? new Date(rateLimitCheck.resetTime).toISOString() : undefined;

      return NextResponse.json(
        {
          error: "Too many export requests. Please try again later.",
          resetTime,
          failedWindow: rateLimitCheck.failedWindow,
        },
        { status: 429 }
      );
    }

    // Check for existing pending/processing export
    const existingExports = await payload.find({
      collection: DATA_EXPORTS_COLLECTION,
      where: { and: [{ user: { equals: user.id } }, { status: { in: ["pending", "processing"] } }] },
      limit: 1,
      overrideAccess: true,
    });

    if (existingExports.docs.length > 0) {
      const existing = existingExports.docs[0];
      return NextResponse.json(
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
        return NextResponse.json(
          { error: "Export already in progress", exportId: raceCheck.docs[0]?.id },
          { status: 409 }
        );
      }
      throw createError;
    }

    // Queue background job — if queueing fails, mark the record as failed
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

    return NextResponse.json(
      {
        success: true,
        message: "Export started. You will receive an email when ready.",
        exportId: exportRecord.id,
        summary,
      },
      { status: 202 }
    );
  } catch (error) {
    return handleError(error);
  }
});

/**
 * GET /api/account/download-data
 * List user's export history.
 */
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  const handleError = createErrorHandler("list data exports", logger);
  try {
    const payload = await getPayload({ config });
    const user = request.user!;

    // Get user's exports
    const exports = await payload.find({
      collection: DATA_EXPORTS_COLLECTION,
      where: { user: { equals: user.id } },
      sort: "-requestedAt",
      limit: 10,
      overrideAccess: true,
    });

    // Transform for response (hide internal fields)
    const exportList = exports.docs.map((exp) => ({
      id: exp.id,
      status: exp.status,
      requestedAt: exp.requestedAt,
      completedAt: exp.completedAt,
      expiresAt: exp.expiresAt,
      fileSize: exp.fileSize,
      downloadCount: exp.downloadCount,
      summary: exp.summary,
      errorLog: exp.status === "failed" ? exp.errorLog : undefined,
    }));

    return NextResponse.json({ exports: exportList, total: exports.totalDocs });
  } catch (error) {
    return handleError(error);
  }
});
