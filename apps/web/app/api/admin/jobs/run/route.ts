/**
 * API endpoint for running queued jobs.
 *
 * This endpoint is used by E2E tests to trigger job processing.
 * In production, jobs would typically be run by a scheduled cron or worker.
 *
 * POST /api/admin/jobs/run - Run queued jobs
 *
 * @module
 * @category API Routes
 */

import { NextResponse } from "next/server";
import { getPayload } from "payload";

import { createLogger } from "@/lib/logger";
import config from "@/payload.config";

const logger = createLogger("api-admin-jobs-run");

interface RunJobsRequest {
  limit?: number;
  iterations?: number;
}

/**
 * Run queued jobs.
 *
 * This endpoint is primarily for E2E testing where we need to
 * process jobs synchronously rather than via cron.
 */
export const POST = async (req: Request) => {
  try {
    // Only allow in non-production environments
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Not available in production" }, { status: 403 });
    }

    const payload = await getPayload({ config });
    const body = (await req.json().catch(() => ({}))) as RunJobsRequest;

    const limit = body.limit ?? 100;
    const iterations = body.iterations ?? 10;

    let iterationsRun = 0;

    // Get initial job counts
    const initialPayloadJobs = await payload.find({
      collection: "payload-jobs",
      limit: 1000,
    });

    const initialImportJobs = await payload.find({
      collection: "import-jobs",
      limit: 1000,
    });

    const initialImportFiles = await payload.find({
      collection: "import-files",
      limit: 100,
    });

    logger.info("Jobs run starting", {
      payloadJobsCount: initialPayloadJobs.totalDocs,
      importJobsCount: initialImportJobs.totalDocs,
      importFilesCount: initialImportFiles.totalDocs,
      importFileStatuses: initialImportFiles.docs.map((f) => ({
        id: f.id,
        status: f.status ?? "unknown",
      })),
    });

    // Run jobs for specified iterations
    for (let i = 0; i < iterations; i++) {
      iterationsRun++;

      await payload.jobs.run({
        limit,
      });

      // Small delay between iterations to allow job state to update
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // Get final job counts
    const finalPayloadJobs = await payload.find({
      collection: "payload-jobs",
      limit: 1000,
    });

    const finalImportJobs = await payload.find({
      collection: "import-jobs",
      limit: 1000,
    });

    const finalImportFiles = await payload.find({
      collection: "import-files",
      limit: 100,
    });

    logger.info("Jobs run completed", {
      iterationsRun,
      limit,
      payloadJobsCount: finalPayloadJobs.totalDocs,
      importJobsCount: finalImportJobs.totalDocs,
      importFilesCount: finalImportFiles.totalDocs,
      importFileStatuses: finalImportFiles.docs.map((f) => ({
        id: f.id,
        status: f.status ?? "unknown",
      })),
      importJobStages: finalImportJobs.docs.map((j) => ({
        id: j.id,
        stage: j.stage ?? "unknown",
      })),
    });

    return NextResponse.json({
      success: true,
      iterationsRun,
      debug: {
        payloadJobs: {
          initial: initialPayloadJobs.totalDocs,
          final: finalPayloadJobs.totalDocs,
        },
        importJobs: {
          initial: initialImportJobs.totalDocs,
          final: finalImportJobs.totalDocs,
          stages: finalImportJobs.docs.map((j) => ({
            id: j.id,
            stage: j.stage ?? "unknown",
          })),
        },
        importFiles: {
          initial: initialImportFiles.totalDocs,
          final: finalImportFiles.totalDocs,
          statuses: finalImportFiles.docs.map((f) => ({
            id: f.id,
            status: f.status ?? "unknown",
          })),
        },
      },
    });
  } catch (error) {
    logger.error("Failed to run jobs", { error });
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to run jobs", details: errorMessage }, { status: 500 });
  }
};
